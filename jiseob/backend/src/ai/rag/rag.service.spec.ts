import { EntityManager } from 'typeorm';
import { Comment } from '../../comments/entities/comment.entity';
import { AiAnalysisStatus, CommentType, RagStatus } from '../../common/enums/ai-status.enum';
import { EmbeddingStatus, TranscriptStatus } from '../../common/enums/video-status.enum';
import { Post } from '../../posts/entities/post.entity';
import { TranscriptChunk } from '../../videos/entities/transcript-chunk.entity';
import { ProviderError } from '../../videos/providers/provider-error';
import { CommentAnalysis } from '../comment-analysis/entities/comment-analysis.entity';
import { RagEvidence } from './entities/rag-evidence.entity';
import { RagService } from './rag.service';

describe('RagService', () => {
  const commentId = '01J00000000000000000000000';
  const videoId = '01J00000000000000000000001';
  const transcriptChunkId = '01J00000000000000000000002';

  const createComment = (
    overrides: {
      commentType?: CommentType | null;
      ragStatus?: RagStatus;
      transcriptStatus?: TranscriptStatus;
      embeddingStatus?: EmbeddingStatus;
    } = {},
  ) =>
    ({
      id: commentId,
      content: '이 영상은 코스피 큰손 귀환을 설명합니다',
      post: {
        video: {
          id: videoId,
          transcriptStatus: overrides.transcriptStatus ?? TranscriptStatus.SUCCESS,
          embeddingStatus: overrides.embeddingStatus ?? EmbeddingStatus.SUCCESS,
          transcriptErrorCode: null,
          transcriptErrorMessage: null,
          embeddingErrorCode: null,
          embeddingErrorMessage: null,
        },
      },
      analysis: {
        commentId,
        aiAnalysisStatus: AiAnalysisStatus.SUCCESS,
        commentType: overrides.commentType ?? CommentType.FACT_CLAIM,
        ragStatus: overrides.ragStatus ?? RagStatus.PENDING,
      },
    }) as Comment & { post: Post; analysis: CommentAnalysis };

  const createQueryBuilder = (comment: unknown) => ({
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(comment),
  });

  const createTransactionManager = (
    evidenceRepository: Record<string, jest.Mock>,
    analysisRepository: Record<string, jest.Mock>,
  ) =>
    ({
      getRepository: jest.fn((entity: typeof RagEvidence | typeof CommentAnalysis) => {
        if (entity === RagEvidence) {
          return evidenceRepository;
        }

        return analysisRepository;
      }),
    }) as unknown as EntityManager;

  const createService = (overrides: {
    dataSource?: unknown;
    embeddingProvider?: unknown;
    commentsRepository?: unknown;
    analysesRepository?: unknown;
    evidencesRepository?: unknown;
  }) =>
    new RagService(
      (overrides.dataSource ?? {}) as never,
      (overrides.embeddingProvider ?? {}) as never,
      (overrides.commentsRepository ?? {}) as never,
      (overrides.analysesRepository ?? {}) as never,
      (overrides.evidencesRepository ?? {}) as never,
    );

  it('stores latest pgvector evidence for fact claims', async () => {
    const evidenceRepository = {
      delete: jest.fn(),
      create: jest.fn((input: Partial<RagEvidence>) => input),
      save: jest.fn(),
    };
    const analysisRepository = {
      update: jest.fn(),
    };
    const manager = createTransactionManager(evidenceRepository, analysisRepository);
    const service = createService({
      dataSource: {
        query: jest.fn().mockResolvedValue([
          {
            transcriptChunkId,
            evidenceText: '코스피를 움직이는 큰손들의 귀환을 분석합니다.',
            startTime: 12,
            endTime: 18,
            similarityScore: '0.82',
          },
        ]),
        transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<void>) =>
          callback(manager),
        ),
      },
      embeddingProvider: {
        embedTexts: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
      },
      commentsRepository: {
        createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilder(createComment())),
      },
    });

    await service.processComment(commentId);

    expect(evidenceRepository.delete).toHaveBeenCalledWith({ commentId });
    expect(evidenceRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        commentId,
        transcriptChunkId,
        similarityScore: 0.82,
      }),
    ]);
    expect(analysisRepository.update).toHaveBeenCalledWith(
      { commentId },
      expect.objectContaining({
        ragStatus: RagStatus.SUCCESS,
        evidenceCount: 1,
        ragErrorCode: null,
        ragErrorMessage: null,
      }),
    );
  });

  it('keeps RAG pending when video embedding is still pending', async () => {
    const evidenceRepository = {
      delete: jest.fn(),
    };
    const analysisRepository = {
      update: jest.fn(),
    };
    const manager = createTransactionManager(evidenceRepository, analysisRepository);
    const embeddingProvider = {
      embedTexts: jest.fn(),
    };
    const service = createService({
      dataSource: {
        transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<void>) =>
          callback(manager),
        ),
      },
      embeddingProvider,
      commentsRepository: {
        createQueryBuilder: jest
          .fn()
          .mockReturnValue(
            createQueryBuilder(createComment({ embeddingStatus: EmbeddingStatus.PENDING })),
          ),
      },
    });

    await service.processComment(commentId);

    expect(embeddingProvider.embedTexts).not.toHaveBeenCalled();
    expect(analysisRepository.update).toHaveBeenCalledWith(
      { commentId },
      expect.objectContaining({
        ragStatus: RagStatus.PENDING,
        evidenceCount: 0,
      }),
    );
  });

  it('marks non fact claims as not required', async () => {
    const evidenceRepository = {
      delete: jest.fn(),
    };
    const analysisRepository = {
      update: jest.fn(),
    };
    const manager = createTransactionManager(evidenceRepository, analysisRepository);
    const service = createService({
      dataSource: {
        transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<void>) =>
          callback(manager),
        ),
      },
      embeddingProvider: {
        embedTexts: jest.fn(),
      },
      commentsRepository: {
        createQueryBuilder: jest
          .fn()
          .mockReturnValue(createQueryBuilder(createComment({ commentType: CommentType.OPINION }))),
      },
    });

    await service.processComment(commentId);

    expect(analysisRepository.update).toHaveBeenCalledWith(
      { commentId },
      expect.objectContaining({
        ragStatus: RagStatus.NOT_REQUIRED,
        evidenceCount: 0,
      }),
    );
  });

  it('stores no result when all chunks are below threshold', async () => {
    const evidenceRepository = {
      delete: jest.fn(),
    };
    const analysisRepository = {
      update: jest.fn(),
    };
    const manager = createTransactionManager(evidenceRepository, analysisRepository);
    const service = createService({
      dataSource: {
        query: jest.fn().mockResolvedValue([]),
        transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<void>) =>
          callback(manager),
        ),
      },
      embeddingProvider: {
        embedTexts: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
      },
      commentsRepository: {
        createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilder(createComment())),
      },
    });

    await service.processComment(commentId);

    expect(analysisRepository.update).toHaveBeenCalledWith(
      { commentId },
      expect.objectContaining({
        ragStatus: RagStatus.NO_RESULT,
        evidenceCount: 0,
      }),
    );
  });

  it('stores RAG failure when transcript is unavailable', async () => {
    const evidenceRepository = {
      delete: jest.fn(),
    };
    const analysisRepository = {
      update: jest.fn(),
    };
    const manager = createTransactionManager(evidenceRepository, analysisRepository);
    const service = createService({
      dataSource: {
        transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<void>) =>
          callback(manager),
        ),
      },
      embeddingProvider: {
        embedTexts: jest.fn(),
      },
      commentsRepository: {
        createQueryBuilder: jest
          .fn()
          .mockReturnValue(
            createQueryBuilder(createComment({ transcriptStatus: TranscriptStatus.NOT_AVAILABLE })),
          ),
      },
    });

    await service.processComment(commentId);

    expect(analysisRepository.update).toHaveBeenCalledWith(
      { commentId },
      expect.objectContaining({
        ragStatus: RagStatus.FAILED,
        evidenceCount: 0,
        ragErrorCode: 'RAG_TRANSCRIPT_UNAVAILABLE',
      }),
    );
  });

  it('stores RAG failure when comment embedding fails', async () => {
    const evidenceRepository = {
      delete: jest.fn(),
    };
    const analysisRepository = {
      update: jest.fn(),
    };
    const manager = createTransactionManager(evidenceRepository, analysisRepository);
    const service = createService({
      dataSource: {
        transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<void>) =>
          callback(manager),
        ),
      },
      embeddingProvider: {
        embedTexts: jest
          .fn()
          .mockRejectedValue(
            new ProviderError('MISSING_OPENAI_API_KEY', 'OpenAI API key가 없습니다.'),
          ),
      },
      commentsRepository: {
        createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilder(createComment())),
      },
    });

    await service.processComment(commentId);

    expect(analysisRepository.update).toHaveBeenCalledWith(
      { commentId },
      expect.objectContaining({
        ragStatus: RagStatus.FAILED,
        evidenceCount: 0,
        ragErrorCode: 'MISSING_OPENAI_API_KEY',
        ragErrorMessage: 'OpenAI API key가 없습니다.',
      }),
    );
  });

  it('does not trigger RAG processing when reading evidences', async () => {
    const embeddingProvider = {
      embedTexts: jest.fn(),
    };
    const dataSource = {
      query: jest.fn(),
    };
    const service = createService({
      dataSource,
      embeddingProvider,
      commentsRepository: {
        createQueryBuilder: jest.fn().mockReturnValue(
          createQueryBuilder({
            id: commentId,
            analysis: {
              ragStatus: RagStatus.SUCCESS,
              evidenceCount: 1,
              ragErrorCode: null,
              ragErrorMessage: null,
            },
          }),
        ),
      },
      evidencesRepository: {
        find: jest.fn().mockResolvedValue([
          {
            id: '01J00000000000000000000003',
            commentId,
            transcriptChunkId,
            evidenceText: '근거 후보입니다.',
            similarityScore: 0.86,
            transcriptChunk: {
              startTime: 1,
              endTime: 5,
            } as TranscriptChunk,
            createdAt: new Date('2026-06-14T00:00:00.000Z'),
          },
        ]),
      },
    });

    const response = await service.getEvidences(commentId);

    expect(embeddingProvider.embedTexts).not.toHaveBeenCalled();
    expect(dataSource.query).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      commentId,
      ragStatus: RagStatus.SUCCESS,
      evidenceCount: 1,
      evidences: [
        {
          transcriptChunkId,
          similarityScore: 0.86,
          startTime: 1,
          endTime: 5,
        },
      ],
    });
  });

  it('resets related evidence and analysis when a video is reprocessed', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = createService({
      dataSource: {
        manager: {
          query,
        },
      },
      embeddingProvider: {},
    });

    await service.resetForVideo(videoId);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('"rag_status" = $2'), [
      videoId,
      RagStatus.PENDING,
      AiAnalysisStatus.SUCCESS,
      CommentType.FACT_CLAIM,
    ]);
  });
});
