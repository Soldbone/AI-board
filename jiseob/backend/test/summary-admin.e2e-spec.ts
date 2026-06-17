import request from 'supertest';
import { AiAnalysisStatus, SummaryStatus } from '../src/common/enums/ai-status.enum';
import { E2eTestApp, createE2eApp } from './helpers/e2e-app';
import { authHeader, createAdminSession, createSession, csrfHeader } from './helpers/e2e-auth';
import { truncateE2eDatabase } from './helpers/e2e-database';
import {
  createComment,
  createPost,
  createReply,
  findCommentInThread,
  getComments,
  waitFor,
  waitForCommentAnalysis,
  waitForSummaryStatus,
} from './helpers/e2e-fixtures';

const API_PREFIX = '/api/v1';

describe('Summary and admin E2E', () => {
  let testApp: E2eTestApp;

  beforeAll(async () => {
    testApp = await createE2eApp();
  });

  beforeEach(async () => {
    await testApp.waitForBackgroundTasks();
    await truncateE2eDatabase(testApp.dataSource);
  });

  afterEach(async () => {
    await testApp.waitForBackgroundTasks();
  });

  afterAll(async () => {
    await testApp?.waitForBackgroundTasks();
    await testApp?.app.close();
  });

  it('rejects summary creation when the thread has fewer than 10 active comments', async () => {
    const session = await createSession(testApp.httpServer, {
      email: 'summary-small@example.com',
      nickname: '요약사용자',
    });
    const post = await createPost(session);
    const rootComment = await createComment(session, post.id, '요약하기에는 짧은 댓글입니다');

    await session.agent
      .post(`${API_PREFIX}/comments/${rootComment.id}/summary`)
      .set(authHeader(session))
      .set(csrfHeader(session))
      .expect(400);
  });

  it('creates a summary for 10 comments and allows anonymous reads of the existing summary', async () => {
    const session = await createSession(testApp.httpServer, {
      email: 'summary-ok@example.com',
      nickname: '요약사용자',
    });
    const post = await createPost(session);
    const rootComment = await createComment(session, post.id, '요약 루트 댓글입니다');

    for (const content of [
      '첫 번째 대댓글입니다',
      '두 번째 대댓글입니다',
      '세 번째 대댓글입니다',
      '네 번째 대댓글입니다',
      '다섯 번째 대댓글입니다',
      '여섯 번째 대댓글입니다',
      '일곱 번째 대댓글입니다',
      '여덟 번째 대댓글입니다',
      '아홉 번째 대댓글입니다',
    ]) {
      await createReply(session, rootComment.id, content);
    }

    await session.agent.post(`${API_PREFIX}/comments/${rootComment.id}/summary`).expect(401);

    const createResponse = await session.agent
      .post(`${API_PREFIX}/comments/${rootComment.id}/summary`)
      .set(authHeader(session))
      .set(csrfHeader(session))
      .expect(202);

    expect((createResponse.body as { status: SummaryStatus }).status).toBe(SummaryStatus.PENDING);

    const summary = await waitForSummaryStatus(session, rootComment.id, SummaryStatus.SUCCESS);

    expect(summary.summaryText).toBe('테스트 요약');

    const readResponse = await request(testApp.httpServer)
      .get(`${API_PREFIX}/comments/${rootComment.id}/summary`)
      .expect(200);

    expect((readResponse.body as { status: SummaryStatus }).status).toBe(SummaryStatus.SUCCESS);
  });

  it('allows only admins to list review comments and does not require CSRF for admin GET', async () => {
    const user = await createSession(testApp.httpServer, {
      email: 'admin-list-user@example.com',
      nickname: '일반사용자',
    });
    const admin = await createAdminSession(testApp.httpServer, testApp.dataSource, {
      email: 'admin-list-admin@example.com',
      nickname: '관리자',
    });
    const post = await createPost(user);
    const toxicComment = await createComment(user, post.id, '바보 toxic 검토 댓글입니다');

    await waitForCommentAnalysis(user, post.id, toxicComment.id, AiAnalysisStatus.SUCCESS);

    await user.agent
      .get(`${API_PREFIX}/admin/comments?moderationStatus=NEEDS_REVIEW`)
      .set(authHeader(user))
      .expect(403);

    const response = await admin.agent
      .get(`${API_PREFIX}/admin/comments?moderationStatus=NEEDS_REVIEW`)
      .set(authHeader(admin))
      .expect(200);
    const body = response.body as { items: Array<{ id: string; moderationStatus: string }> };

    expect(body.items.some((item) => item.id === toxicComment.id)).toBe(true);
  });

  it('requires CSRF for admin delete and renders the admin deletion placeholder', async () => {
    const user = await createSession(testApp.httpServer, {
      email: 'admin-delete-user@example.com',
      nickname: '일반사용자',
    });
    const admin = await createAdminSession(testApp.httpServer, testApp.dataSource, {
      email: 'admin-delete-admin@example.com',
      nickname: '관리자',
    });
    const post = await createPost(user);
    const toxicComment = await createComment(user, post.id, '바보 toxic 삭제 댓글입니다');

    await waitForCommentAnalysis(user, post.id, toxicComment.id, AiAnalysisStatus.SUCCESS);

    await admin.agent
      .delete(`${API_PREFIX}/admin/comments/${toxicComment.id}`)
      .set(authHeader(admin))
      .expect(403);

    await admin.agent
      .delete(`${API_PREFIX}/admin/comments/${toxicComment.id}`)
      .set(authHeader(admin))
      .set(csrfHeader(admin))
      .expect(204);

    const comments = await getComments(user, post.id);
    const deletedComment = findCommentInThread(comments, toxicComment.id);

    expect(deletedComment?.isDeleted).toBe(true);
    expect(deletedComment?.content).toBe('관리자에 의해 삭제된 댓글입니다');
  });

  it('allows admins to retry only FAILED analyses', async () => {
    const user = await createSession(testApp.httpServer, {
      email: 'admin-retry-user@example.com',
      nickname: '일반사용자',
    });
    const admin = await createAdminSession(testApp.httpServer, testApp.dataSource, {
      email: 'admin-retry-admin@example.com',
      nickname: '관리자',
    });
    const post = await createPost(user);
    const failedComment = await createComment(user, post.id, 'fail-analysis 관리자 재시도');

    await waitForCommentAnalysis(user, post.id, failedComment.id, AiAnalysisStatus.FAILED);

    await user.agent
      .post(`${API_PREFIX}/admin/comments/${failedComment.id}/analysis/retry`)
      .set(authHeader(user))
      .set(csrfHeader(user))
      .expect(403);

    const retryResponse = await admin.agent
      .post(`${API_PREFIX}/admin/comments/${failedComment.id}/analysis/retry`)
      .set(authHeader(admin))
      .set(csrfHeader(admin))
      .expect(202);
    const retryBody = retryResponse.body as {
      commentId: string;
      accepted: boolean;
      aiAnalysisStatus: AiAnalysisStatus;
    };

    expect(retryBody).toEqual({
      commentId: failedComment.id,
      accepted: true,
      aiAnalysisStatus: AiAnalysisStatus.PENDING,
    });

    const normalComment = await createComment(user, post.id, '관리자 재시도 일반 댓글입니다');

    await waitFor(async () => {
      const analyzed = await waitForCommentAnalysis(
        user,
        post.id,
        normalComment.id,
        AiAnalysisStatus.SUCCESS,
      );

      expect(analyzed.analysis?.aiAnalysisStatus).toBe(AiAnalysisStatus.SUCCESS);
    });

    await admin.agent
      .post(`${API_PREFIX}/admin/comments/${normalComment.id}/analysis/retry`)
      .set(authHeader(admin))
      .set(csrfHeader(admin))
      .expect(409);
  });
});
