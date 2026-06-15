import request from 'supertest';
import { E2eTestApp, createE2eApp } from './helpers/e2e-app';
import { authHeader, createSession, csrfHeader } from './helpers/e2e-auth';
import { truncateE2eDatabase } from './helpers/e2e-database';
import { createPost, getPost } from './helpers/e2e-fixtures';

const API_PREFIX = '/api/v1';

describe('Auth and posts E2E', () => {
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

  it('signs up, logs in, and reads the current user without leaking secrets', async () => {
    const session = await createSession(testApp.httpServer, {
      email: 'user-a@example.com',
      nickname: '사용자A',
    });

    const response = await session.agent
      .get(`${API_PREFIX}/users/me`)
      .set(authHeader(session))
      .expect(200);
    const body = response.body as Record<string, unknown>;

    expect(body.id).toBe(session.userId);
    expect(body.email).toBe(session.email);
    expect(body.passwordHash).toBeUndefined();
    expect(body.refreshToken).toBeUndefined();
  });

  it('rejects anonymous post creation', async () => {
    await request(testApp.httpServer)
      .post(`${API_PREFIX}/posts`)
      .send({
        title: '비회원 작성',
        content: '작성할 수 없어야 합니다.',
        youtubeUrl: 'https://www.youtube.com/watch?v=anon0000000',
      })
      .expect(401);
  });

  it('creates a post with pending video status at the HTTP boundary', async () => {
    const session = await createSession(testApp.httpServer, {
      email: 'pending-author@example.com',
      nickname: '작성자',
    });

    const post = await createPost(session);

    expect(post.video.metadataStatus).toBe('PENDING');
    expect(post.video.transcriptStatus).toBe('PENDING');
    expect(post.video.embeddingStatus).toBe('PENDING');
  });

  it('allows only the author to update and delete a post', async () => {
    const author = await createSession(testApp.httpServer, {
      email: 'post-author@example.com',
      nickname: '작성자',
    });
    const other = await createSession(testApp.httpServer, {
      email: 'post-other@example.com',
      nickname: '다른사용자',
    });
    const post = await createPost(author);

    await other.agent
      .patch(`${API_PREFIX}/posts/${post.id}`)
      .set(authHeader(other))
      .set(csrfHeader(other))
      .send({ title: '권한 없는 수정' })
      .expect(403);

    await author.agent
      .patch(`${API_PREFIX}/posts/${post.id}`)
      .set(authHeader(author))
      .set(csrfHeader(author))
      .send({ title: '수정된 제목' })
      .expect(200);

    await other.agent
      .delete(`${API_PREFIX}/posts/${post.id}`)
      .set(authHeader(other))
      .set(csrfHeader(other))
      .expect(403);

    await author.agent
      .delete(`${API_PREFIX}/posts/${post.id}`)
      .set(authHeader(author))
      .set(csrfHeader(author))
      .expect(204);
  });

  it('increments view count and enforces duplicate-like policy', async () => {
    const session = await createSession(testApp.httpServer, {
      email: 'like-author@example.com',
      nickname: '작성자',
    });
    const post = await createPost(session);

    const viewResponse = await session.agent
      .post(`${API_PREFIX}/posts/${post.id}/views`)
      .expect(200);

    expect((viewResponse.body as { viewCount: number }).viewCount).toBe(1);

    const likeResponse = await session.agent
      .post(`${API_PREFIX}/posts/${post.id}/like`)
      .set(authHeader(session))
      .set(csrfHeader(session))
      .expect(200);

    expect((likeResponse.body as { likeCount: number }).likeCount).toBe(1);

    await session.agent
      .post(`${API_PREFIX}/posts/${post.id}/like`)
      .set(authHeader(session))
      .set(csrfHeader(session))
      .expect(409);

    await session.agent
      .delete(`${API_PREFIX}/posts/${post.id}/like`)
      .set(authHeader(session))
      .set(csrfHeader(session))
      .expect(204);

    await session.agent
      .delete(`${API_PREFIX}/posts/${post.id}/like`)
      .set(authHeader(session))
      .set(csrfHeader(session))
      .expect(204);

    const currentPost = await getPost(session, post.id);

    expect(currentPost.viewCount).toBe(1);
    expect(currentPost.likeCount).toBe(0);
  });

  it('rejects state-changing post APIs without CSRF header', async () => {
    const session = await createSession(testApp.httpServer, {
      email: 'csrf-author@example.com',
      nickname: '작성자',
    });

    await session.agent
      .post(`${API_PREFIX}/posts`)
      .set(authHeader(session))
      .send({
        title: 'CSRF 없는 작성',
        content: '실패해야 합니다.',
        youtubeUrl: 'https://www.youtube.com/watch?v=csrf0000000',
      })
      .expect(403);
  });
});
