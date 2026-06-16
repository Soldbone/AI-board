import { ConflictException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CommentAnalysis } from '../ai/comment-analysis/entities/comment-analysis.entity';
import { AiAnalysisStatus, CommentType, RagStatus } from '../common/enums/ai-status.enum';
import { ModerationStatus } from '../common/enums/comment-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { Comment } from '../comments/entities/comment.entity';
import { Post } from '../posts/entities/post.entity';
import { User } from '../users/entities/user.entity';
import { AdminCommentsService } from './admin-comments.service';

describe('AdminCommentsService', () => {
  const now = new Date('2026-06-15T00:00:00.000Z');
  const user = {
    id: '01J00000000000000000000000',
    email: 'user@example.com',
    nickname: '작성자',
    role: UserRole.USER,
    deletedAt: null,
  } as User;
  const post = {
    id: '01J00000000000000000000001',
    deletedAt: null,
  } as Post;

  const createComment = (overrides: Partial<Comment> = {}): Comment =>
    ({
      id: '01J00000000000000000000002',
      postId: post.id,
      authorId: user.id,
      parentCommentId: null,
      content: '검토가 필요한 댓글',
      moderationStatus: ModerationStatus.NEEDS_REVIEW,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      ...overrides,
    }) as Comment;

  const createAnalysis = (overrides: Partial<CommentAnalysis> = {}): CommentAnalysis =>
    ({
      id: '01J00000000000000000000003',
      commentId: '01J00000000000000000000002',
      commentType: CommentType.TOXIC,
      aiAnalysisStatus: AiAnalysisStatus.SUCCESS,
      ragStatus: RagStatus.NOT_REQUIRED,
      evidenceCount: 0,
      errorCode: null,
      errorMessage: null,
      analyzedAt: now,
      ...overrides,
    }) as CommentAnalysis;

  const createAnalysisService = (overrides: Partial<Record<string, unknown>> = {}) => ({
    preparePendingAnalysis: jest.fn(),
    analyzeComment: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  const createService = (
    overrides: {
      dataSource?: unknown;
      analysisService?: ReturnType<typeof createAnalysisService>;
      commentsRepository?: unknown;
      postsRepository?: unknown;
      analysesRepository?: unknown;
    } = {},
  ) =>
    new AdminCommentsService(
      (overrides.dataSource ?? {}) as never,
      (overrides.analysisService ?? createAnalysisService()) as never,
      (overrides.commentsRepository ?? {}) as never,
      (overrides.postsRepository ?? {}) as never,
      (overrides.analysesRepository ?? {}) as never,
    );

  const createPostQueryBuilder = () => ({
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  });

  it('lists active NEEDS_REVIEW comments from active posts', async () => {
    const comment = createComment({
      author: user,
      analysis: createAnalysis(),
    });
    const queryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[comment], 1]),
    };
    const service = createService({
      commentsRepository: {
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      },
    });

    const response = await service.findReviewComments({});

    expect(queryBuilder.innerJoin).toHaveBeenCalledWith(
      'comment.post',
      'post',
      'post.deleted_at IS NULL',
    );
    expect(queryBuilder.where).toHaveBeenCalledWith('comment.deleted_at IS NULL');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'comment.moderation_status = :moderationStatus',
      { moderationStatus: ModerationStatus.NEEDS_REVIEW },
    );
    expect(response).toMatchObject({
      items: [
        {
          id: comment.id,
          postId: post.id,
          content: '검토가 필요한 댓글',
          moderationStatus: ModerationStatus.NEEDS_REVIEW,
          author: {
            id: user.id,
            nickname: '작성자',
          },
          analysis: {
            commentType: CommentType.TOXIC,
            aiAnalysisStatus: AiAnalysisStatus.SUCCESS,
          },
        },
      ],
      meta: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
    });
  });

  it('keeps authorId and returns withdrawn nickname when author relation is absent', async () => {
    const comment = createComment({
      author: null as never,
      analysis: createAnalysis(),
    });
    const queryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[comment], 1]),
    };
    const service = createService({
      commentsRepository: {
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      },
    });

    const response = await service.findReviewComments({});

    expect(response.items[0].author).toEqual({
      id: user.id,
      nickname: '탈퇴한 회원',
    });
  });

  it('soft deletes active comments as admin and decrements comment count', async () => {
    const comment = createComment();
    const commentRepository = {
      findOne: jest.fn().mockResolvedValue(comment),
      update: jest.fn(),
      softDelete: jest.fn(),
    };
    const postQueryBuilder = createPostQueryBuilder();
    const postRepository = {
      findOne: jest.fn().mockResolvedValue(post),
      createQueryBuilder: jest.fn().mockReturnValue(postQueryBuilder),
    };
    const manager = {
      getRepository: jest.fn((entity: typeof Comment | typeof Post) => {
        if (entity === Comment) {
          return commentRepository;
        }

        return postRepository;
      }),
    } as unknown as EntityManager;
    const service = createService({
      dataSource: {
        transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<unknown>) =>
          callback(manager),
        ),
      },
    });

    await service.deleteComment(comment.id);

    expect(commentRepository.update).toHaveBeenCalledWith(comment.id, {
      moderationStatus: ModerationStatus.DELETED_BY_ADMIN,
    });
    expect(commentRepository.softDelete).toHaveBeenCalledWith(comment.id);
    expect(postRepository.createQueryBuilder).toHaveBeenCalled();
    const setArgument = postQueryBuilder.set.mock.calls[0][0] as {
      commentCount: () => string;
    };
    expect(setArgument.commentCount()).toBe('GREATEST("comment_count" - 1, 0)');
  });

  it('does not decrement count when admin deletes an already deleted comment', async () => {
    const comment = createComment({
      deletedAt: now,
    });
    const commentRepository = {
      findOne: jest.fn().mockResolvedValue(comment),
      update: jest.fn(),
      softDelete: jest.fn(),
    };
    const postRepository = {
      findOne: jest.fn().mockResolvedValue(post),
      createQueryBuilder: jest.fn(),
    };
    const manager = {
      getRepository: jest.fn((entity: typeof Comment | typeof Post) => {
        if (entity === Comment) {
          return commentRepository;
        }

        return postRepository;
      }),
    } as unknown as EntityManager;
    const service = createService({
      dataSource: {
        transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<unknown>) =>
          callback(manager),
        ),
      },
    });

    await service.deleteComment(comment.id);

    expect(commentRepository.update).not.toHaveBeenCalled();
    expect(commentRepository.softDelete).not.toHaveBeenCalled();
    expect(postRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('resets failed analysis to pending and enqueues analysis retry', async () => {
    const comment = createComment();
    const analysis = createAnalysis({
      aiAnalysisStatus: AiAnalysisStatus.FAILED,
    });
    const analysisService = createAnalysisService();
    const commentRepository = {
      findOne: jest.fn().mockResolvedValue(comment),
    };
    const postRepository = {
      findOne: jest.fn().mockResolvedValue(post),
    };
    const analysisRepository = {
      findOne: jest.fn().mockResolvedValue(analysis),
    };
    const manager = {
      getRepository: jest.fn((entity: typeof Comment | typeof Post | typeof CommentAnalysis) => {
        if (entity === Comment) {
          return commentRepository;
        }

        if (entity === Post) {
          return postRepository;
        }

        return analysisRepository;
      }),
    } as unknown as EntityManager;
    const service = createService({
      dataSource: {
        transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<unknown>) =>
          callback(manager),
        ),
      },
      analysisService,
    });

    const response = await service.retryCommentAnalysis(comment.id);

    expect(analysisService.preparePendingAnalysis).toHaveBeenCalledWith(comment.id, manager);
    expect(analysisService.analyzeComment).toHaveBeenCalledWith(comment.id);
    expect(response).toEqual({
      commentId: comment.id,
      accepted: true,
      aiAnalysisStatus: AiAnalysisStatus.PENDING,
    });
  });

  it('rejects analysis retry when analysis is not failed', async () => {
    const comment = createComment();
    const analysis = createAnalysis({
      aiAnalysisStatus: AiAnalysisStatus.SUCCESS,
    });
    const analysisService = createAnalysisService();
    const manager = {
      getRepository: jest.fn((entity: typeof Comment | typeof Post | typeof CommentAnalysis) => {
        if (entity === Comment) {
          return {
            findOne: jest.fn().mockResolvedValue(comment),
          };
        }

        if (entity === Post) {
          return {
            findOne: jest.fn().mockResolvedValue(post),
          };
        }

        return {
          findOne: jest.fn().mockResolvedValue(analysis),
        };
      }),
    } as unknown as EntityManager;
    const service = createService({
      dataSource: {
        transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<unknown>) =>
          callback(manager),
        ),
      },
      analysisService,
    });

    await expect(service.retryCommentAnalysis(comment.id)).rejects.toThrow(ConflictException);
    expect(analysisService.preparePendingAnalysis).not.toHaveBeenCalled();
    expect(analysisService.analyzeComment).not.toHaveBeenCalled();
  });

  it('rejects analysis retry when the analysis row is missing', async () => {
    const comment = createComment();
    const manager = {
      getRepository: jest.fn((entity: typeof Comment | typeof Post | typeof CommentAnalysis) => {
        if (entity === Comment) {
          return {
            findOne: jest.fn().mockResolvedValue(comment),
          };
        }

        if (entity === Post) {
          return {
            findOne: jest.fn().mockResolvedValue(post),
          };
        }

        return {
          findOne: jest.fn().mockResolvedValue(null),
        };
      }),
    } as unknown as EntityManager;
    const service = createService({
      dataSource: {
        transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<unknown>) =>
          callback(manager),
        ),
      },
    });

    await expect(service.retryCommentAnalysis(comment.id)).rejects.toThrow(NotFoundException);
  });

  it('rejects analysis retry when the comment is deleted', async () => {
    const manager = {
      getRepository: jest.fn((entity: typeof Comment) => {
        if (entity === Comment) {
          return {
            findOne: jest.fn().mockResolvedValue(null),
          };
        }

        return {};
      }),
    } as unknown as EntityManager;
    const service = createService({
      dataSource: {
        transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<unknown>) =>
          callback(manager),
        ),
      },
    });

    await expect(service.retryCommentAnalysis('01J00000000000000000000004')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects analysis retry when the post is deleted', async () => {
    const comment = createComment();
    const manager = {
      getRepository: jest.fn((entity: typeof Comment | typeof Post) => {
        if (entity === Comment) {
          return {
            findOne: jest.fn().mockResolvedValue(comment),
          };
        }

        return {
          findOne: jest.fn().mockResolvedValue(null),
        };
      }),
    } as unknown as EntityManager;
    const service = createService({
      dataSource: {
        transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<unknown>) =>
          callback(manager),
        ),
      },
    });

    await expect(service.retryCommentAnalysis(comment.id)).rejects.toThrow(NotFoundException);
  });
});
