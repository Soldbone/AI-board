import {
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SummaryStatus } from '../../common/enums/ai-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SummaryController } from './summary.controller';
import { SummaryService } from './summary.service';

describe('SummaryController', () => {
  const user = {
    id: '01J00000000000000000000000',
    email: 'user@example.com',
    role: UserRole.USER,
    sessionId: '01J00000000000000000000001',
  };
  const rootCommentId = '01J00000000000000000000002';
  const now = new Date('2026-06-15T00:00:00.000Z');
  const summaryResponse = {
    summaryId: '01J00000000000000000000003',
    rootCommentId,
    postId: '01J00000000000000000000004',
    status: SummaryStatus.PENDING,
    summaryText: null,
    summarizedCommentCount: 10,
    currentCommentCount: 10,
    isStale: false,
    errorCode: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    generatedAt: null,
  };

  let app: INestApplication;
  const summaryService = {
    createSummary: jest.fn(),
    getSummary: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    summaryService.createSummary.mockResolvedValue({
      httpStatus: 202,
      summary: summaryResponse,
    });
    summaryService.getSummary.mockResolvedValue({
      ...summaryResponse,
      status: SummaryStatus.SUCCESS,
      summaryText: '요약 결과',
      generatedAt: now,
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [SummaryController],
      providers: [
        {
          provide: SummaryService,
          useValue: summaryService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const httpRequest = context.switchToHttp().getRequest<{
            headers: Record<string, string>;
            user?: typeof user;
          }>();

          if (httpRequest.headers.authorization !== 'Bearer test-token') {
            throw new UnauthorizedException();
          }

          httpRequest.user = user;

          return true;
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
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('requires authentication for summary creation', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/comments/${rootCommentId}/summary`)
      .set('x-csrf-token', 'test-csrf')
      .send({})
      .expect(401);
  });

  it('requires CSRF for summary creation', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/comments/${rootCommentId}/summary`)
      .set('Authorization', 'Bearer test-token')
      .send({})
      .expect(403);
  });

  it('returns 202 for queued summary generation', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/comments/${rootCommentId}/summary`)
      .set('Authorization', 'Bearer test-token')
      .set('x-csrf-token', 'test-csrf')
      .send({})
      .expect(202)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          summaryId: summaryResponse.summaryId,
          status: SummaryStatus.PENDING,
          currentCommentCount: 10,
        });
      });
    expect(summaryService.createSummary).toHaveBeenCalledWith(user, rootCommentId);
  });

  it('returns 200 for a fresh cached summary', async () => {
    summaryService.createSummary.mockResolvedValueOnce({
      httpStatus: 200,
      summary: {
        ...summaryResponse,
        status: SummaryStatus.SUCCESS,
        summaryText: '요약 결과',
        generatedAt: now,
      },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/comments/${rootCommentId}/summary`)
      .set('Authorization', 'Bearer test-token')
      .set('x-csrf-token', 'test-csrf')
      .send({})
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: SummaryStatus.SUCCESS,
          summaryText: '요약 결과',
        });
      });
  });

  it('allows anonymous reads of an existing summary', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/comments/${rootCommentId}/summary`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: SummaryStatus.SUCCESS,
          summaryText: '요약 결과',
        });
      });
    expect(summaryService.getSummary).toHaveBeenCalledWith(rootCommentId);
  });
});
