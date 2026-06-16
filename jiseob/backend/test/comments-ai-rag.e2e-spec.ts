import { AiAnalysisStatus, RagStatus } from '../src/common/enums/ai-status.enum';
import { E2eTestApp, createE2eApp } from './helpers/e2e-app';
import { authHeader, createSession, csrfHeader } from './helpers/e2e-auth';
import { truncateE2eDatabase } from './helpers/e2e-database';
import {
  createComment,
  createPost,
  createReply,
  findCommentInThread,
  getComments,
  getPost,
  prepareVideoWithTranscript,
  waitFor,
  waitForCommentAnalysis,
} from './helpers/e2e-fixtures';

const API_PREFIX = '/api/v1';

describe('Comments, AI analysis, and RAG E2E', () => {
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

  it('creates comments and replies while keeping post commentCount in sync', async () => {
    const session = await createSession(testApp.httpServer, {
      email: 'comment-author@example.com',
      nickname: '댓글작성자',
    });
    const post = await createPost(session);
    const rootComment = await createComment(session, post.id, '첫 댓글입니다');

    expect(rootComment.analysis?.aiAnalysisStatus).toBe(AiAnalysisStatus.PENDING);
    expect((await getPost(session, post.id)).commentCount).toBe(1);

    await createReply(session, rootComment.id, '첫 대댓글입니다');

    expect((await getPost(session, post.id)).commentCount).toBe(2);
  });

  it('rejects replies to replies', async () => {
    const session = await createSession(testApp.httpServer, {
      email: 'reply-author@example.com',
      nickname: '댓글작성자',
    });
    const post = await createPost(session);
    const rootComment = await createComment(session, post.id);
    const reply = await createReply(session, rootComment.id);

    await session.agent
      .post(`${API_PREFIX}/comments/${reply.id}/replies`)
      .set(authHeader(session))
      .set(csrfHeader(session))
      .send({ content: '대댓글의 대댓글입니다' })
      .expect(400);
  });

  it('rejects comment update and delete from another user', async () => {
    const author = await createSession(testApp.httpServer, {
      email: 'comment-owner@example.com',
      nickname: '댓글작성자',
    });
    const other = await createSession(testApp.httpServer, {
      email: 'comment-other@example.com',
      nickname: '다른사용자',
    });
    const post = await createPost(author);
    const rootComment = await createComment(author, post.id);

    await other.agent
      .patch(`${API_PREFIX}/comments/${rootComment.id}`)
      .set(authHeader(other))
      .set(csrfHeader(other))
      .send({ content: '권한 없는 수정입니다' })
      .expect(403);

    await other.agent
      .delete(`${API_PREFIX}/comments/${rootComment.id}`)
      .set(authHeader(other))
      .set(csrfHeader(other))
      .expect(403);
  });

  it('soft-deletes a root comment, keeps replies visible, and avoids double decrement', async () => {
    const session = await createSession(testApp.httpServer, {
      email: 'delete-owner@example.com',
      nickname: '댓글작성자',
    });
    const post = await createPost(session);
    const rootComment = await createComment(session, post.id, '삭제될 댓글입니다');
    const reply = await createReply(session, rootComment.id, '유지될 대댓글입니다');

    await session.agent
      .delete(`${API_PREFIX}/comments/${rootComment.id}`)
      .set(authHeader(session))
      .set(csrfHeader(session))
      .expect(204);

    expect((await getPost(session, post.id)).commentCount).toBe(1);

    const comments = await getComments(session, post.id);
    const deletedRoot = findCommentInThread(comments, rootComment.id);

    expect(deletedRoot?.isDeleted).toBe(true);
    expect(deletedRoot?.content).toBe('삭제된 댓글입니다');
    expect(deletedRoot?.replies).toHaveLength(1);
    expect(deletedRoot?.replies[0]?.id).toBe(reply.id);

    await session.agent
      .delete(`${API_PREFIX}/comments/${rootComment.id}`)
      .set(authHeader(session))
      .set(csrfHeader(session))
      .expect(204);

    expect((await getPost(session, post.id)).commentCount).toBe(1);
  });

  it('keeps a comment when analyzer fails and stores FAILED analysis status', async () => {
    const session = await createSession(testApp.httpServer, {
      email: 'analysis-fail@example.com',
      nickname: '댓글작성자',
    });
    const post = await createPost(session);
    const comment = await createComment(session, post.id, 'fail-analysis 댓글입니다');
    const analyzedComment = await waitForCommentAnalysis(
      session,
      post.id,
      comment.id,
      AiAnalysisStatus.FAILED,
    );

    expect(analyzedComment.content).toBe('fail-analysis 댓글입니다');
    expect(analyzedComment.isDeleted).toBe(false);
  });

  it('runs RAG only for fact claims and exposes evidence details through a separate endpoint', async () => {
    const session = await createSession(testApp.httpServer, {
      email: 'rag-author@example.com',
      nickname: '댓글작성자',
    });
    const post = await createPost(session);

    await prepareVideoWithTranscript(testApp.dataSource, post.video.id);

    const factComment = await createComment(session, post.id, 'fact 2026 근거가 필요한 댓글');
    const opinionComment = await createComment(session, post.id, '개인적으로 좋은 의견입니다');

    const factAfterAnalysis = await waitFor(async () => {
      const comments = await getComments(session, post.id);
      const comment = findCommentInThread(comments, factComment.id);

      expect(comment?.analysis?.aiAnalysisStatus).toBe(AiAnalysisStatus.SUCCESS);
      expect(comment?.analysis?.ragStatus).toBe(RagStatus.SUCCESS);
      expect(comment?.analysis?.evidenceCount).toBeGreaterThan(0);

      return comment;
    });
    const opinionAfterAnalysis = await waitForCommentAnalysis(
      session,
      post.id,
      opinionComment.id,
      AiAnalysisStatus.SUCCESS,
    );

    expect(opinionAfterAnalysis.analysis?.ragStatus).toBe(RagStatus.NOT_REQUIRED);

    const evidenceResponse = await session.agent
      .get(`${API_PREFIX}/comments/${factComment.id}/evidences`)
      .expect(200);
    const evidenceBody = evidenceResponse.body as {
      ragStatus: RagStatus;
      evidenceCount: number;
      evidences: unknown[];
    };

    expect(evidenceBody.ragStatus).toBe(RagStatus.SUCCESS);
    expect(evidenceBody.evidenceCount).toBeGreaterThan(0);
    expect(evidenceBody.evidences.length).toBeGreaterThan(0);
    expect(factAfterAnalysis).not.toHaveProperty('evidences');
  });
});
