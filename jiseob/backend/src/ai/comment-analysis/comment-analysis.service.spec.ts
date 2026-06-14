import { NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Comment } from '../../comments/entities/comment.entity';
import { AiAnalysisStatus, CommentType, RagStatus } from '../../common/enums/ai-status.enum';
import { ModerationStatus } from '../../common/enums/comment-status.enum';
import { CommentAnalyzerError } from './comment-analyzer.provider';
import { CommentAnalysisService } from './comment-analysis.service';
import { CommentAnalysis } from './entities/comment-analysis.entity';

describe('CommentAnalysisService', () => {
  const comment = {
    id: '01J00000000000000000000000',
    content: '2024년에 공개된 공식 통계입니다',
    moderationStatus: ModerationStatus.NORMAL,
    deletedAt: null,
  } as Comment;

  const createService = (overrides: {
    dataSource?: unknown;
    analyzerProvider?: unknown;
    analysesRepository?: unknown;
    commentsRepository?: unknown;
  }) =>
    new CommentAnalysisService(
      (overrides.dataSource ?? {}) as never,
      (overrides.analyzerProvider ?? {}) as never,
      (overrides.analysesRepository ?? {}) as never,
      (overrides.commentsRepository ?? {}) as never,
    );

  it('stores fact claim analysis as RAG pending', async () => {
    const analysisUpdates: Array<Partial<CommentAnalysis>> = [];
    const commentUpdates: Array<Partial<Comment>> = [];
    const manager = {
      getRepository: jest.fn((entity: typeof Comment | typeof CommentAnalysis) => {
        if (entity === Comment) {
          return {
            update: jest.fn((_commentId: string, update: Partial<Comment>) => {
              commentUpdates.push(update);
            }),
          };
        }

        return {
          update: jest.fn((_criteria: unknown, update: Partial<CommentAnalysis>) => {
            analysisUpdates.push(update);
          }),
        };
      }),
    } as unknown as EntityManager;
    const service = createService({
      dataSource: {
        transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<void>) =>
          callback(manager),
        ),
      },
      analyzerProvider: {
        analyze: jest.fn().mockResolvedValue({
          commentType: CommentType.FACT_CLAIM,
          moderationStatus: ModerationStatus.NORMAL,
        }),
      },
      commentsRepository: {
        findOne: jest.fn().mockResolvedValue(comment),
      },
      analysesRepository: {
        update: jest.fn(),
      },
    });

    await service.analyzeComment(comment.id);

    expect(commentUpdates).toEqual([
      expect.objectContaining({
        moderationStatus: ModerationStatus.NORMAL,
      }),
    ]);
    expect(analysisUpdates).toEqual([
      expect.objectContaining({
        commentType: CommentType.FACT_CLAIM,
        aiAnalysisStatus: AiAnalysisStatus.SUCCESS,
        ragStatus: RagStatus.PENDING,
        evidenceCount: 0,
      }),
    ]);
  });

  it('marks toxic comments as needs review without deleting them', async () => {
    const commentRepository = {
      update: jest.fn(),
    };
    const analysisRepository = {
      update: jest.fn(),
    };
    const manager = {
      getRepository: jest.fn((entity: typeof Comment | typeof CommentAnalysis) => {
        if (entity === Comment) {
          return commentRepository;
        }

        return analysisRepository;
      }),
    } as unknown as EntityManager;
    const service = createService({
      dataSource: {
        transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<void>) =>
          callback(manager),
        ),
      },
      analyzerProvider: {
        analyze: jest.fn().mockResolvedValue({
          commentType: CommentType.TOXIC,
          moderationStatus: ModerationStatus.NEEDS_REVIEW,
        }),
      },
      commentsRepository: {
        findOne: jest.fn().mockResolvedValue(comment),
      },
      analysesRepository: {
        update: jest.fn(),
      },
    });

    await service.analyzeComment(comment.id);

    expect(commentRepository.update).toHaveBeenCalledWith(comment.id, {
      moderationStatus: ModerationStatus.NEEDS_REVIEW,
    });
    expect(analysisRepository.update).toHaveBeenCalledWith(
      { commentId: comment.id },
      expect.objectContaining({
        commentType: CommentType.TOXIC,
        aiAnalysisStatus: AiAnalysisStatus.SUCCESS,
        ragStatus: RagStatus.NOT_REQUIRED,
      }),
    );
  });

  it('stores sanitized failure status when analysis fails', async () => {
    const analysisRepository = {
      update: jest.fn(),
    };
    const service = createService({
      analyzerProvider: {
        analyze: jest
          .fn()
          .mockRejectedValue(
            new CommentAnalyzerError('COMMENT_ANALYSIS_FAILED', '분석 provider 오류입니다.'),
          ),
      },
      commentsRepository: {
        findOne: jest.fn().mockResolvedValue(comment),
      },
      analysesRepository: analysisRepository,
    });

    await service.analyzeComment(comment.id);

    expect(analysisRepository.update).toHaveBeenCalledWith(
      { commentId: comment.id },
      expect.objectContaining({
        aiAnalysisStatus: AiAnalysisStatus.FAILED,
        errorCode: 'COMMENT_ANALYSIS_FAILED',
        errorMessage: '분석 provider 오류입니다.',
      }),
    );
  });

  it('rejects analysis for missing comments', async () => {
    const service = createService({
      commentsRepository: {
        findOne: jest.fn().mockResolvedValue(null),
      },
    });

    await expect(service.analyzeComment(comment.id)).rejects.toThrow(NotFoundException);
  });
});
