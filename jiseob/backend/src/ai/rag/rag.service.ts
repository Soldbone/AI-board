import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Comment } from '../../comments/entities/comment.entity';
import { AiAnalysisStatus, CommentType, RagStatus } from '../../common/enums/ai-status.enum';
import { EmbeddingStatus, TranscriptStatus } from '../../common/enums/video-status.enum';
import { Post } from '../../posts/entities/post.entity';
import { Video } from '../../videos/entities/video.entity';
import { EmbeddingProvider } from '../../videos/providers/embedding.provider';
import { toProviderError } from '../../videos/providers/provider-error';
import { CommentAnalysis } from '../comment-analysis/entities/comment-analysis.entity';
import { RagEvidence } from './entities/rag-evidence.entity';

const RAG_TOP_K = 3;
const RAG_SIMILARITY_THRESHOLD = 0.7;

type SearchResultRow = {
  transcriptChunkId: string;
  evidenceText: string;
  startTime: number | null;
  endTime: number | null;
  similarityScore: number | string;
};

type CommentForRag = Comment & {
  post: Post & {
    video: Video;
  };
  analysis?: CommentAnalysis | null;
};

export type RagEvidenceItemResponse = {
  id: string;
  transcriptChunkId: string;
  evidenceText: string;
  similarityScore: number;
  startTime: number | null;
  endTime: number | null;
  createdAt: Date;
};

export type RagEvidencesResponse = {
  commentId: string;
  ragStatus: RagStatus;
  evidenceCount: number;
  ragErrorCode: string | null;
  ragErrorMessage: string | null;
  evidences: RagEvidenceItemResponse[];
};

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly embeddingProvider: EmbeddingProvider,
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>,
    @InjectRepository(CommentAnalysis)
    private readonly analysesRepository: Repository<CommentAnalysis>,
    @InjectRepository(RagEvidence)
    private readonly evidencesRepository: Repository<RagEvidence>,
  ) {}

  enqueueForComment(commentId: string): void {
    void this.processComment(commentId).catch((error: unknown) => {
      this.logger.warn(
        `RAG processing failed after comment analysis: ${commentId}`,
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  async enqueuePendingForVideo(videoId: string): Promise<void> {
    const rows = (await this.dataSource.query(
      `
        SELECT "comments"."id" AS "commentId"
        FROM "comments"
        INNER JOIN "posts" ON "posts"."id" = "comments"."post_id"
        INNER JOIN "comment_analyses" ON "comment_analyses"."comment_id" = "comments"."id"
        WHERE "posts"."video_id" = $1
          AND "posts"."deleted_at" IS NULL
          AND "comments"."deleted_at" IS NULL
          AND "comment_analyses"."ai_analysis_status" = $2
          AND "comment_analyses"."comment_type" = $3
          AND "comment_analyses"."rag_status" IN ($4, $5)
      `,
      [
        videoId,
        AiAnalysisStatus.SUCCESS,
        CommentType.FACT_CLAIM,
        RagStatus.PENDING,
        RagStatus.FAILED,
      ],
    )) as Array<{ commentId: string }>;

    rows.forEach((row) => this.enqueueForComment(row.commentId));
  }

  async processComment(commentId: string): Promise<void> {
    const comment = await this.findActiveCommentForRag(commentId);
    const analysis = comment.analysis ?? null;

    if (
      !analysis ||
      analysis.aiAnalysisStatus !== AiAnalysisStatus.SUCCESS ||
      analysis.commentType !== CommentType.FACT_CLAIM
    ) {
      await this.storeNotRequired(commentId);
      return;
    }

    const video = comment.post.video;

    if (
      video.transcriptStatus === TranscriptStatus.PENDING ||
      video.embeddingStatus === EmbeddingStatus.PENDING
    ) {
      await this.storePending(commentId);
      return;
    }

    if (video.transcriptStatus !== TranscriptStatus.SUCCESS) {
      await this.storeFailure(
        commentId,
        video.transcriptErrorCode ?? 'RAG_TRANSCRIPT_UNAVAILABLE',
        video.transcriptErrorMessage ?? '자막이 없어 근거 후보를 검색할 수 없습니다.',
      );
      return;
    }

    if (video.embeddingStatus !== EmbeddingStatus.SUCCESS) {
      await this.storeFailure(
        commentId,
        video.embeddingErrorCode ?? 'RAG_EMBEDDING_UNAVAILABLE',
        video.embeddingErrorMessage ?? '자막 임베딩이 없어 근거 후보를 검색할 수 없습니다.',
      );
      return;
    }

    let queryEmbedding: number[];

    try {
      [queryEmbedding] = await this.embeddingProvider.embedTexts([comment.content]);
    } catch (error) {
      const providerError = toProviderError(
        error,
        'OPENAI_API_ERROR',
        '댓글 임베딩을 생성하지 못해 근거 후보를 검색할 수 없습니다.',
      );

      await this.storeFailure(commentId, providerError.code, providerError.userMessage);
      return;
    }

    const searchResults = await this.searchSimilarChunks(video.id, queryEmbedding);

    if (searchResults.length === 0) {
      await this.storeNoResult(commentId);
      return;
    }

    await this.storeSuccess(commentId, searchResults);
  }

  async getEvidences(commentId: string): Promise<RagEvidencesResponse> {
    const comment = await this.commentsRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.analysis', 'analysis')
      .innerJoin('comment.post', 'post', 'post.deleted_at IS NULL')
      .where('comment.id = :commentId', { commentId })
      .andWhere('comment.deleted_at IS NULL')
      .getOne();

    if (!comment) {
      throw new NotFoundException('댓글을 찾을 수 없습니다.');
    }

    const analysis = (comment as Comment & { analysis?: CommentAnalysis | null }).analysis ?? null;
    const evidences = await this.evidencesRepository.find({
      where: { commentId },
      relations: {
        transcriptChunk: true,
      },
      order: {
        similarityScore: 'DESC',
        createdAt: 'ASC',
      },
    });

    return {
      commentId,
      ragStatus: analysis?.ragStatus ?? RagStatus.NOT_REQUIRED,
      evidenceCount: analysis?.evidenceCount ?? 0,
      ragErrorCode: analysis?.ragErrorCode ?? null,
      ragErrorMessage: analysis?.ragErrorMessage ?? null,
      evidences: evidences.map((evidence) => this.toEvidenceResponse(evidence)),
    };
  }

  async resetForVideo(videoId: string, manager?: EntityManager): Promise<void> {
    const queryRunner = manager ?? this.dataSource.manager;

    await queryRunner.query(
      `
        DELETE FROM "rag_evidences"
        WHERE "comment_id" IN (
          SELECT "comments"."id"
          FROM "comments"
          INNER JOIN "posts" ON "posts"."id" = "comments"."post_id"
          WHERE "posts"."video_id" = $1
        )
      `,
      [videoId],
    );

    await queryRunner.query(
      `
        UPDATE "comment_analyses"
        SET
          "rag_status" = $2,
          "evidence_count" = 0,
          "rag_error_code" = NULL,
          "rag_error_message" = NULL,
          "updated_at" = now()
        FROM "comments"
        INNER JOIN "posts" ON "posts"."id" = "comments"."post_id"
        WHERE "comment_analyses"."comment_id" = "comments"."id"
          AND "posts"."video_id" = $1
          AND "comment_analyses"."ai_analysis_status" = $3
          AND "comment_analyses"."comment_type" = $4
      `,
      [videoId, RagStatus.PENDING, AiAnalysisStatus.SUCCESS, CommentType.FACT_CLAIM],
    );
  }

  async failForVideo(
    videoId: string,
    errorCode: string,
    errorMessage: string,
    manager?: EntityManager,
  ): Promise<void> {
    const queryRunner = manager ?? this.dataSource.manager;

    await queryRunner.query(
      `
        DELETE FROM "rag_evidences"
        WHERE "comment_id" IN (
          SELECT "comments"."id"
          FROM "comments"
          INNER JOIN "posts" ON "posts"."id" = "comments"."post_id"
          WHERE "posts"."video_id" = $1
        )
      `,
      [videoId],
    );

    await queryRunner.query(
      `
        UPDATE "comment_analyses"
        SET
          "rag_status" = $2,
          "evidence_count" = 0,
          "rag_error_code" = $3,
          "rag_error_message" = $4,
          "updated_at" = now()
        FROM "comments"
        INNER JOIN "posts" ON "posts"."id" = "comments"."post_id"
        WHERE "comment_analyses"."comment_id" = "comments"."id"
          AND "posts"."video_id" = $1
          AND "comment_analyses"."ai_analysis_status" = $5
          AND "comment_analyses"."comment_type" = $6
      `,
      [
        videoId,
        RagStatus.FAILED,
        errorCode,
        errorMessage,
        AiAnalysisStatus.SUCCESS,
        CommentType.FACT_CLAIM,
      ],
    );
  }

  private async findActiveCommentForRag(commentId: string): Promise<CommentForRag> {
    const comment = await this.commentsRepository
      .createQueryBuilder('comment')
      .innerJoinAndSelect('comment.post', 'post', 'post.deleted_at IS NULL')
      .innerJoinAndSelect('post.video', 'video')
      .leftJoinAndSelect('comment.analysis', 'analysis')
      .where('comment.id = :commentId', { commentId })
      .andWhere('comment.deleted_at IS NULL')
      .getOne();

    if (!comment) {
      throw new NotFoundException('댓글을 찾을 수 없습니다.');
    }

    return comment as CommentForRag;
  }

  private async searchSimilarChunks(
    videoId: string,
    queryEmbedding: number[],
  ): Promise<SearchResultRow[]> {
    const vector = this.toVectorLiteral(queryEmbedding);
    const rows = (await this.dataSource.query(
      `
        SELECT
          "id" AS "transcriptChunkId",
          "content" AS "evidenceText",
          "start_time" AS "startTime",
          "end_time" AS "endTime",
          1 - ("embedding" <=> $1::vector) AS "similarityScore"
        FROM "transcript_chunks"
        WHERE "video_id" = $2
          AND "deleted_at" IS NULL
          AND "embedding" IS NOT NULL
          AND 1 - ("embedding" <=> $1::vector) >= $3
        ORDER BY "embedding" <=> $1::vector ASC
        LIMIT $4
      `,
      [vector, videoId, RAG_SIMILARITY_THRESHOLD, RAG_TOP_K],
    )) as SearchResultRow[];

    return rows
      .map((row) => ({
        ...row,
        similarityScore: Number(row.similarityScore),
      }))
      .filter((row) => Number.isFinite(row.similarityScore));
  }

  private async storePending(commentId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(RagEvidence).delete({ commentId });
      await manager.getRepository(CommentAnalysis).update(
        { commentId },
        {
          ragStatus: RagStatus.PENDING,
          evidenceCount: 0,
          ragErrorCode: null,
          ragErrorMessage: null,
        },
      );
    });
  }

  private async storeNotRequired(commentId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(RagEvidence).delete({ commentId });
      await manager.getRepository(CommentAnalysis).update(
        { commentId },
        {
          ragStatus: RagStatus.NOT_REQUIRED,
          evidenceCount: 0,
          ragErrorCode: null,
          ragErrorMessage: null,
        },
      );
    });
  }

  private async storeNoResult(commentId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(RagEvidence).delete({ commentId });
      await manager.getRepository(CommentAnalysis).update(
        { commentId },
        {
          ragStatus: RagStatus.NO_RESULT,
          evidenceCount: 0,
          ragErrorCode: null,
          ragErrorMessage: null,
        },
      );
    });
  }

  private async storeFailure(
    commentId: string,
    ragErrorCode: string,
    ragErrorMessage: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(RagEvidence).delete({ commentId });
      await manager.getRepository(CommentAnalysis).update(
        { commentId },
        {
          ragStatus: RagStatus.FAILED,
          evidenceCount: 0,
          ragErrorCode,
          ragErrorMessage,
        },
      );
    });
  }

  private async storeSuccess(commentId: string, searchResults: SearchResultRow[]): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(RagEvidence).delete({ commentId });
      const evidenceRepository = manager.getRepository(RagEvidence);
      const evidences = searchResults.map((result) =>
        evidenceRepository.create({
          commentId,
          transcriptChunkId: result.transcriptChunkId,
          evidenceText: result.evidenceText,
          similarityScore: Number(result.similarityScore),
        }),
      );

      await evidenceRepository.save(evidences);
      await manager.getRepository(CommentAnalysis).update(
        { commentId },
        {
          ragStatus: RagStatus.SUCCESS,
          evidenceCount: evidences.length,
          ragErrorCode: null,
          ragErrorMessage: null,
        },
      );
    });
  }

  private toVectorLiteral(embedding: number[]): string {
    if (embedding.length === 0 || embedding.some((value) => !Number.isFinite(value))) {
      throw new Error('Invalid embedding vector');
    }

    return `[${embedding.join(',')}]`;
  }

  private toEvidenceResponse(evidence: RagEvidence): RagEvidenceItemResponse {
    return {
      id: evidence.id,
      transcriptChunkId: evidence.transcriptChunkId,
      evidenceText: evidence.evidenceText,
      similarityScore: evidence.similarityScore,
      startTime: evidence.transcriptChunk?.startTime ?? null,
      endTime: evidence.transcriptChunk?.endTime ?? null,
      createdAt: evidence.createdAt,
    };
  }
}
