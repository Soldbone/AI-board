import { EmbeddingStatus, TranscriptStatus } from '../../common/enums/video-status.enum';
import { McpInvalidParamsError, McpToolError } from '../mcp.errors';
import { TranscriptSearchChunksTool } from './transcript-search-chunks.tool';

describe('TranscriptSearchChunksTool', () => {
  const post = {
    id: '01J00000000000000000000002',
    video: {
      id: '01J00000000000000000000003',
      transcriptStatus: TranscriptStatus.SUCCESS,
      embeddingStatus: EmbeddingStatus.SUCCESS,
    },
  };

  const createTool = (
    overrides: {
      dataSource?: unknown;
      postsService?: unknown;
      embeddingProvider?: unknown;
    } = {},
  ) =>
    new TranscriptSearchChunksTool(
      (overrides.dataSource ?? {}) as never,
      (overrides.postsService ?? {}) as never,
      (overrides.embeddingProvider ?? {}) as never,
    );

  it('searches transcript chunks with pgvector similarity settings', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        transcriptChunkId: '01J00000000000000000000004',
        chunkIndex: 0,
        content: '검색된 자막 청크',
        startTime: 1.2,
        endTime: 4.5,
        similarityScore: '0.82',
      },
    ]);
    const tool = createTool({
      dataSource: { query },
      postsService: { getPost: jest.fn().mockResolvedValue(post) },
      embeddingProvider: { embedTexts: jest.fn().mockResolvedValue([[0.1, 0.2]]) },
    });

    await expect(
      tool.execute({
        postId: post.id,
        query: '검색어',
        limit: 7,
      }),
    ).resolves.toMatchObject({
      postId: post.id,
      videoId: post.video.id,
      limit: 7,
      similarityThreshold: 0.7,
      chunks: [
        {
          transcriptChunkId: '01J00000000000000000000004',
          chunkIndex: 0,
          content: '검색된 자막 청크',
          similarityScore: 0.82,
        },
      ],
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('embedding'), [
      '[0.1,0.2]',
      post.video.id,
      0.7,
      7,
    ]);
  });

  it('rejects limit values above the maximum', async () => {
    const tool = createTool();

    await expect(
      tool.execute({
        postId: post.id,
        query: '검색어',
        limit: 11,
      }),
    ).rejects.toThrow(McpInvalidParamsError);
  });

  it('rejects search when transcript embeddings are unavailable', async () => {
    const tool = createTool({
      postsService: {
        getPost: jest.fn().mockResolvedValue({
          ...post,
          video: {
            ...post.video,
            embeddingStatus: EmbeddingStatus.PENDING,
          },
        }),
      },
    });

    await expect(
      tool.execute({
        postId: post.id,
        query: '검색어',
      }),
    ).rejects.toThrow(McpToolError);
  });
});
