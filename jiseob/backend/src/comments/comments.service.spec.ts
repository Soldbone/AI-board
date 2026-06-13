import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ModerationStatus } from '../common/enums/comment-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { Post } from '../posts/entities/post.entity';
import { User } from '../users/entities/user.entity';
import { CommentsService, CommentResponse } from './comments.service';
import { Comment } from './entities/comment.entity';

describe('CommentsService', () => {
  const user = {
    id: '01J00000000000000000000000',
    email: 'user@example.com',
    role: UserRole.USER,
    sessionId: '01J00000000000000000000001',
  };
  const now = new Date('2026-06-13T00:00:00.000Z');

  const createComment = (overrides: Partial<Comment> = {}): Comment =>
    ({
      id: '01J00000000000000000000002',
      postId: '01J00000000000000000000003',
      authorId: user.id,
      parentCommentId: null,
      content: '댓글',
      moderationStatus: ModerationStatus.NORMAL,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      ...overrides,
    }) as Comment;

  const createService = (dataSource: unknown = {}) =>
    new CommentsService(
      dataSource as ConstructorParameters<typeof CommentsService>[0],
      {} as never,
      {} as never,
    );

  it('rejects replies to replies', async () => {
    const parentReply = createComment({
      id: '01J00000000000000000000004',
      parentCommentId: '01J00000000000000000000002',
    });
    const commentRepository = {
      findOne: jest.fn().mockResolvedValue(parentReply),
    };
    const manager = {
      getRepository: jest.fn((entity: typeof Comment | typeof Post) => {
        if (entity === Comment) {
          return commentRepository;
        }

        return {};
      }),
    } as unknown as EntityManager;
    const service = createService({
      transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<unknown>) =>
        callback(manager),
      ),
    });

    await expect(
      service.createReply(user, parentReply.id, {
        content: '대댓글의 대댓글',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not decrement comment count when deleting an already deleted comment', async () => {
    const deletedComment = createComment({
      deletedAt: now,
    });
    const activePost = {
      id: deletedComment.postId,
      deletedAt: null,
    };
    const commentRepository = {
      findOne: jest.fn().mockResolvedValue(deletedComment),
      update: jest.fn(),
      softDelete: jest.fn(),
    };
    const postQueryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };
    const postRepository = {
      findOne: jest.fn().mockResolvedValue(activePost),
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
      transaction: jest.fn(async (callback: (manager: EntityManager) => Promise<unknown>) =>
        callback(manager),
      ),
    });

    await service.deleteComment(user, deletedComment.id);

    expect(commentRepository.update).not.toHaveBeenCalled();
    expect(commentRepository.softDelete).not.toHaveBeenCalled();
    expect(postRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returns deleted comments as placeholders while keeping replies', () => {
    const rootComment = createComment({
      deletedAt: now,
      moderationStatus: ModerationStatus.DELETED_BY_USER,
      author: {
        id: user.id,
        nickname: '작성자',
      } as User,
    });
    const reply = createComment({
      id: '01J00000000000000000000005',
      parentCommentId: rootComment.id,
      content: '남아 있는 대댓글',
      author: {
        id: user.id,
        nickname: '작성자',
      } as User,
    });
    const service = createService();
    const threadResponse = (
      service as unknown as {
        toThreadResponse(comments: Comment[]): CommentResponse[];
      }
    ).toThreadResponse([rootComment, reply]);

    expect(threadResponse).toHaveLength(1);
    expect(threadResponse[0].content).toBe('삭제된 댓글입니다');
    expect(threadResponse[0].isDeleted).toBe(true);
    expect(threadResponse[0].replies).toHaveLength(1);
    expect(threadResponse[0].replies[0].content).toBe('남아 있는 대댓글');
  });
});
