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
    expect(currentPost.likedByMe).toBe(false);
  });

  it('returns likedByMe for authenticated readers and null for anonymous readers', async () => {
    const author = await createSession(testApp.httpServer, {
      email: 'liked-author@example.com',
      nickname: '작성자',
    });
    const liker = await createSession(testApp.httpServer, {
      email: 'liked-reader@example.com',
      nickname: '좋아요사용자',
    });
    const other = await createSession(testApp.httpServer, {
      email: 'liked-other@example.com',
      nickname: '다른사용자',
    });
    const post = await createPost(author);

    const anonymousResponse = await request(testApp.httpServer)
      .get(`${API_PREFIX}/posts/${post.id}`)
      .expect(200);

    expect((anonymousResponse.body as { likedByMe: boolean | null }).likedByMe).toBeNull();

    await liker.agent
      .post(`${API_PREFIX}/posts/${post.id}/like`)
      .set(authHeader(liker))
      .set(csrfHeader(liker))
      .expect(200);

    const likedDetailResponse = await liker.agent
      .get(`${API_PREFIX}/posts/${post.id}`)
      .set(authHeader(liker))
      .expect(200);

    expect((likedDetailResponse.body as { likedByMe: boolean | null }).likedByMe).toBe(true);

    const otherDetailResponse = await other.agent
      .get(`${API_PREFIX}/posts/${post.id}`)
      .set(authHeader(other))
      .expect(200);

    expect((otherDetailResponse.body as { likedByMe: boolean | null }).likedByMe).toBe(false);

    const listResponse = await liker.agent
      .get(`${API_PREFIX}/posts`)
      .set(authHeader(liker))
      .expect(200);
    const listBody = listResponse.body as {
      items: Array<{ id: string; likedByMe: boolean | null }>;
    };

    expect(listBody.items.find((item) => item.id === post.id)?.likedByMe).toBe(true);
  });

  it('sorts posts by latest activity counters', async () => {
    const session = await createSession(testApp.httpServer, {
      email: 'sort-author@example.com',
      nickname: '정렬작성자',
    });
    const latestPost = await createPost(session, { title: '최신 게시글' });
    const commentsPost = await createPost(session, { title: '댓글 많은 게시글' });
    const likesPost = await createPost(session, { title: '좋아요 많은 게시글' });
    const viewsPost = await createPost(session, { title: '조회 많은 게시글' });

    await testApp.dataSource.query(
      `
        UPDATE "posts"
        SET
          "created_at" = CASE "id"
            WHEN $1 THEN $5::timestamptz
            WHEN $2 THEN $6::timestamptz
            WHEN $3 THEN $7::timestamptz
            WHEN $4 THEN $8::timestamptz
          END,
          "comment_count" = CASE "id" WHEN $2 THEN 9 ELSE 1 END,
          "like_count" = CASE "id" WHEN $3 THEN 8 ELSE 1 END,
          "view_count" = CASE "id" WHEN $4 THEN 7 ELSE 1 END
        WHERE "id" IN ($1, $2, $3, $4)
      `,
      [
        latestPost.id,
        commentsPost.id,
        likesPost.id,
        viewsPost.id,
        '2026-06-16T04:00:00.000Z',
        '2026-06-16T03:00:00.000Z',
        '2026-06-16T02:00:00.000Z',
        '2026-06-16T01:00:00.000Z',
      ],
    );

    const expectTopPost = async (sort: string, postId: string) => {
      const response = await session.agent
        .get(`${API_PREFIX}/posts?sort=${sort}`)
        .set(authHeader(session))
        .expect(200);
      const body = response.body as { items: Array<{ id: string }> };

      expect(body.items[0]?.id).toBe(postId);
    };

    await expectTopPost('latest', latestPost.id);
    await expectTopPost('comments', commentsPost.id);
    await expectTopPost('likes', likesPost.id);
    await expectTopPost('views', viewsPost.id);
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
