import {
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AiAnalysisStatus } from '../common/enums/ai-status.enum';
import { ModerationStatus } from '../common/enums/comment-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { CsrfGuard } from '../common/guards/csrf.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminCommentsController } from './admin-comments.controller';
import { AdminCommentsService } from './admin-comments.service';

describe('AdminCommentsController', () => {
  const commentId = '01J00000000000000000000000';
  const now = new Date('2026-06-15T00:00:00.000Z');
  const adminUser = {
    id: '01J00000000000000000000001',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
    sessionId: '01J00000000000000000000002',
  };
  const normalUser = {
    ...adminUser,
    id: '01J00000000000000000000003',
    email: 'user@example.com',
    role: UserRole.USER,
  };
  const listResponse = {
    items: [
      {
        id: commentId,
        postId: '01J00000000000000000000004',
        parentCommentId: null,
        content: '검토가 필요한 댓글',
        moderationStatus: ModerationStatus.NEEDS_REVIEW,
        author: {
          id: '01J00000000000000000000005',
          nickname: '작성자',
        },
        analysis: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    meta: {
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    },
  };

  let app: INestApplication;
  const adminCommentsService = {
    findReviewComments: jest.fn(),
    deleteComment: jest.fn(),
    retryCommentAnalysis: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    adminCommentsService.findReviewComments.mockResolvedValue(listResponse);
    adminCommentsService.deleteComment.mockResolvedValue(undefined);
    adminCommentsService.retryCommentAnalysis.mockResolvedValue({
      commentId,
      accepted: true,
      aiAnalysisStatus: AiAnalysisStatus.PENDING,
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminCommentsController],
      providers: [
        {
          provide: AdminCommentsService,
          useValue: adminCommentsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const httpRequest = context.switchToHttp().getRequest<{
            headers: Record<string, string>;
            user?: typeof adminUser | typeof normalUser;
          }>();

          if (httpRequest.headers.authorization === 'Bearer admin-token') {
            httpRequest.user = adminUser;
            return true;
          }

          if (httpRequest.headers.authorization === 'Bearer user-token') {
            httpRequest.user = normalUser;
            return true;
          }

          throw new UnauthorizedException();
        },
      })
      .overrideGuard(CsrfGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const httpRequest = context.switchToHttp().getRequest<{
            headers: Record<string, string>;
          }>();

          if (httpRequest.headers['x-csrf-token'] !== 'test-csrf') {
            throw new ForbiddenException();
          }

          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const httpRequest = context.switchToHttp().getRequest<{
            user?: typeof adminUser | typeof normalUser;
          }>();

          return httpRequest.user?.role === UserRole.ADMIN;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('requires authentication for admin comment list', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/comments').expect(401);
  });

  it('rejects non-admin users', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/comments')
      .set('Authorization', 'Bearer user-token')
      .expect(403);
  });

  it('allows admin comment list without CSRF', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/comments')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          items: [
            {
              id: commentId,
              moderationStatus: ModerationStatus.NEEDS_REVIEW,
            },
          ],
          meta: {
            total: 1,
          },
        });
      });
    expect(adminCommentsService.findReviewComments).toHaveBeenCalled();
  });

  it('requires CSRF for admin comment delete', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/comments/${commentId}`)
      .set('Authorization', 'Bearer admin-token')
      .expect(403);
  });

  it('returns 204 for admin comment delete', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/comments/${commentId}`)
      .set('Authorization', 'Bearer admin-token')
      .set('x-csrf-token', 'test-csrf')
      .expect(204);
    expect(adminCommentsService.deleteComment).toHaveBeenCalledWith(commentId);
  });

  it('requires CSRF for analysis retry', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/admin/comments/${commentId}/analysis/retry`)
      .set('Authorization', 'Bearer admin-token')
      .send({})
      .expect(403);
  });

  it('returns 202 for accepted analysis retry', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/admin/comments/${commentId}/analysis/retry`)
      .set('Authorization', 'Bearer admin-token')
      .set('x-csrf-token', 'test-csrf')
      .send({})
      .expect(202)
      .expect(({ body }) => {
        expect(body).toEqual({
          commentId,
          accepted: true,
          aiAnalysisStatus: AiAnalysisStatus.PENDING,
        });
      });
    expect(adminCommentsService.retryCommentAnalysis).toHaveBeenCalledWith(commentId);
  });
});
