import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EmbeddingStatus, TranscriptStatus } from '../../common/enums/video-status.enum';
import { PostsService } from '../../posts/posts.service';
import { EmbeddingProvider } from '../../videos/providers/embedding.provider';
import { McpToolError } from '../mcp.errors';
import { assertPlainObject, readOptionalInteger, readRequiredString } from '../mcp.validation';
import { McpTool, McpToolDefinition } from '../mcp.types';

const TRANSCRIPT_SEARCH_DEFAULT_LIMIT = 5;
const TRANSCRIPT_SEARCH_MAX_LIMIT = 10;
const TRANSCRIPT_SEARCH_SIMILARITY_THRESHOLD = 0.7;

type TranscriptSearchRow = {
  transcriptChunkId: string;
  chunkIndex: number;
  content: string;
  startTime?: number | null;
  endTime?: number | null;
  similarityScore: string | number;
  matchType?: 'TEXT' | 'VECTOR';
};

@Injectable()
export class TranscriptSearchChunksTool implements McpTool {
  readonly definition: McpToolDefinition = {
    name: 'transcript.searchChunks',
    description: '게시글 영상 자막 청크를 pgvector similarity search로 검색한다.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      required: ['postId', 'query'],
      additionalProperties: false,
      properties: {
        postId: { type: 'string' },
        query: { type: 'string' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: TRANSCRIPT_SEARCH_MAX_LIMIT,
          default: TRANSCRIPT_SEARCH_DEFAULT_LIMIT,
        },
      },
    },
    outputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        postId: { type: 'string' },
        videoId: { type: 'string' },
        query: { type: 'string' },
        limit: { type: 'number' },
        similarityThreshold: { type: 'number' },
        chunks: { type: 'array' },
      },
    },
  };

  constructor(
    private readonly dataSource: DataSource,
    private readonly postsService: PostsService,
    private readonly embeddingProvider: EmbeddingProvider,
  ) {}

  async execute(args: unknown) {
    const parsedArgs = assertPlainObject(args);
    const postId = readRequiredString(parsedArgs, 'postId');
    const query = readRequiredString(parsedArgs, 'query', { maxLength: 1000 });
    const limit = readOptionalInteger(parsedArgs, 'limit', {
      defaultValue: TRANSCRIPT_SEARCH_DEFAULT_LIMIT,
      min: 1,
      max: TRANSCRIPT_SEARCH_MAX_LIMIT,
    });
    const post = await this.postsService.getPost(postId);

    this.assertSearchableTranscript(post.video.transcriptStatus, post.video.embeddingStatus);

    const [queryEmbedding] = await this.embeddingProvider.embedTexts([query]);

    if (!queryEmbedding) {
      throw new McpToolError('QUERY_EMBEDDING_FAILED', '검색어 임베딩을 생성하지 못했습니다.');
    }

    const rows = await this.searchChunks(post.video.id, query, queryEmbedding, limit);

    return {
      postId,
      videoId: post.video.id,
      query,
      limit,
      similarityThreshold: TRANSCRIPT_SEARCH_SIMILARITY_THRESHOLD,
      chunks: rows,
    };
  }

  private assertSearchableTranscript(transcriptStatus: string, embeddingStatus: string): void {
    if (transcriptStatus !== TranscriptStatus.SUCCESS) {
      throw new McpToolError('TRANSCRIPT_UNAVAILABLE', '검색할 수 있는 자막이 없습니다.');
    }

    if (embeddingStatus !== EmbeddingStatus.SUCCESS) {
      throw new McpToolError('EMBEDDING_UNAVAILABLE', '자막 임베딩이 없어 검색할 수 없습니다.');
    }
  }

  private async searchChunks(
    videoId: string,
    query: string,
    queryEmbedding: number[],
    limit: number,
  ) {
    const vectorRows = await this.searchSimilarChunks(videoId, queryEmbedding, limit);

    if (vectorRows.length >= limit) {
      return vectorRows;
    }

    const textRows = await this.searchTextChunks(videoId, query, limit);
    const seenChunkIds = new Set(vectorRows.map((row) => row.transcriptChunkId));
    const mergedRows = [...vectorRows];

    for (const row of textRows) {
      if (seenChunkIds.has(row.transcriptChunkId)) {
        continue;
      }

      seenChunkIds.add(row.transcriptChunkId);
      mergedRows.push(row);

      if (mergedRows.length >= limit) {
        break;
      }
    }

    return mergedRows;
  }

  private async searchSimilarChunks(videoId: string, queryEmbedding: number[], limit: number) {
    const vector = this.toVectorLiteral(queryEmbedding);
    const rows = (await this.dataSource.query(
      `
        SELECT
          "id" AS "transcriptChunkId",
          "chunk_index" AS "chunkIndex",
          "content",
          "start_time" AS "startTime",
          "end_time" AS "endTime",
          1 - ("embedding" <=> $1::vector) AS "similarityScore",
          'VECTOR' AS "matchType"
        FROM "transcript_chunks"
        WHERE "video_id" = $2
          AND "deleted_at" IS NULL
          AND "embedding" IS NOT NULL
          AND 1 - ("embedding" <=> $1::vector) >= $3
        ORDER BY "embedding" <=> $1::vector ASC
        LIMIT $4
      `,
      [vector, videoId, TRANSCRIPT_SEARCH_SIMILARITY_THRESHOLD, limit],
    )) as TranscriptSearchRow[];

    return rows
      .map((row) => ({
        transcriptChunkId: row.transcriptChunkId,
        chunkIndex: Number(row.chunkIndex),
        content: row.content,
        startTime: row.startTime,
        endTime: row.endTime,
        similarityScore: Number(row.similarityScore),
        matchType: row.matchType ?? 'VECTOR',
      }))
      .filter((row) => Number.isFinite(row.chunkIndex) && Number.isFinite(row.similarityScore));
  }

  private async searchTextChunks(videoId: string, query: string, limit: number) {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      return [];
    }

    const rows = (await this.dataSource.query(
      `
        SELECT
          "id" AS "transcriptChunkId",
          "chunk_index" AS "chunkIndex",
          "content",
          "start_time" AS "startTime",
          "end_time" AS "endTime",
          1 AS "similarityScore",
          'TEXT' AS "matchType"
        FROM "transcript_chunks"
        WHERE "video_id" = $1
          AND "deleted_at" IS NULL
          AND position(lower($2) in lower("content")) > 0
        ORDER BY "chunk_index" ASC
        LIMIT $3
      `,
      [videoId, normalizedQuery, limit],
    )) as TranscriptSearchRow[];

    return rows
      .map((row) => ({
        transcriptChunkId: row.transcriptChunkId,
        chunkIndex: Number(row.chunkIndex),
        content: row.content,
        startTime: row.startTime,
        endTime: row.endTime,
        similarityScore: Number(row.similarityScore),
        matchType: row.matchType ?? 'TEXT',
      }))
      .filter((row) => Number.isFinite(row.chunkIndex) && Number.isFinite(row.similarityScore));
  }

  private toVectorLiteral(embedding: number[]): string {
    if (embedding.length === 0 || embedding.some((value) => !Number.isFinite(value))) {
      throw new McpToolError('INVALID_EMBEDDING_VECTOR', '임베딩 벡터가 올바르지 않습니다.');
    }

    return `[${embedding.join(',')}]`;
  }
}
