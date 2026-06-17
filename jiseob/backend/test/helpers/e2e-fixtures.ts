import { DataSource } from 'typeorm';
import { ulid } from 'ulid';
import { AiAnalysisStatus, RagStatus, SummaryStatus } from '../../src/common/enums/ai-status.enum';
import {
  EmbeddingStatus,
  MetadataStatus,
  TranscriptStatus,
} from '../../src/common/enums/video-status.enum';
import { Video } from '../../src/videos/entities/video.entity';
import { E2eSession, authHeader, csrfHeader } from './e2e-auth';
import { vectorLiteral } from './e2e-database';

const API_PREFIX = '/api/v1';
let youtubeCounter = 0;

export type PostResponseBody = {
  id: string;
  title: string;
  commentCount: number;
  viewCount: number;
  likeCount: number;
  likedByMe: boolean | null;
  video: {
    id: string;
    metadataStatus: string;
    transcriptStatus: string;
    embeddingStatus: string;
  };
};

export type CommentResponseBody = {
  id: string;
  postId: string;
  parentCommentId: string | null;
  content: string;
  moderationStatus: string;
  isDeleted: boolean;
  analysis: {
    commentType: string | null;
    aiAnalysisStatus: AiAnalysisStatus;
    ragStatus: RagStatus;
    evidenceCount: number;
  } | null;
  replies: CommentResponseBody[];
};

export const createPost = async (
  session: E2eSession,
  overrides: Partial<{
    title: string;
    content: string;
    youtubeUrl: string;
    tags: string[];
  }> = {},
): Promise<PostResponseBody> => {
  youtubeCounter += 1;
  const youtubeVideoId = `e2e${youtubeCounter.toString().padStart(8, '0')}`;
  const response = await session.agent
    .post(`${API_PREFIX}/posts`)
    .set(authHeader(session))
    .set(csrfHeader(session))
    .send({
      title: overrides.title ?? 'E2E 테스트 게시글',
      content: overrides.content ?? 'E2E 테스트 본문입니다.',
      youtubeUrl: overrides.youtubeUrl ?? `https://www.youtube.com/watch?v=${youtubeVideoId}`,
      tags: overrides.tags ?? ['e2e'],
    })
    .expect(201);

  return response.body as PostResponseBody;
};

export const getPost = async (session: E2eSession, postId: string): Promise<PostResponseBody> => {
  const response = await session.agent
    .get(`${API_PREFIX}/posts/${postId}`)
    .set(authHeader(session))
    .expect(200);

  return response.body as PostResponseBody;
};

export const createComment = async (
  session: E2eSession,
  postId: string,
  content = 'E2E 댓글입니다',
): Promise<CommentResponseBody> => {
  const response = await session.agent
    .post(`${API_PREFIX}/posts/${postId}/comments`)
    .set(authHeader(session))
    .set(csrfHeader(session))
    .send({ content })
    .expect(201);

  return response.body as CommentResponseBody;
};

export const createReply = async (
  session: E2eSession,
  parentCommentId: string,
  content = 'E2E 대댓글입니다',
): Promise<CommentResponseBody> => {
  const response = await session.agent
    .post(`${API_PREFIX}/comments/${parentCommentId}/replies`)
    .set(authHeader(session))
    .set(csrfHeader(session))
    .send({ content })
    .expect(201);

  return response.body as CommentResponseBody;
};

export const getComments = async (
  session: E2eSession,
  postId: string,
): Promise<CommentResponseBody[]> => {
  const response = await session.agent.get(`${API_PREFIX}/posts/${postId}/comments`).expect(200);

  return response.body as CommentResponseBody[];
};

export const findCommentInThread = (
  comments: CommentResponseBody[],
  commentId: string,
): CommentResponseBody | null => {
  for (const comment of comments) {
    if (comment.id === commentId) {
      return comment;
    }

    const reply = findCommentInThread(comment.replies, commentId);

    if (reply) {
      return reply;
    }
  }

  return null;
};

export const waitFor = async <T>(
  assertion: () => Promise<T> | T,
  options: {
    timeoutMs?: number;
    intervalMs?: number;
  } = {},
): Promise<T> => {
  const timeoutMs = options.timeoutMs ?? 3000;
  const intervalMs = options.intervalMs ?? 25;
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await assertion();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Timed out waiting for condition.');
};

export const waitForCommentAnalysis = async (
  session: E2eSession,
  postId: string,
  commentId: string,
  expectedStatus: AiAnalysisStatus,
): Promise<CommentResponseBody> =>
  waitFor(async () => {
    const comments = await getComments(session, postId);
    const comment = findCommentInThread(comments, commentId);

    expect(comment?.analysis?.aiAnalysisStatus).toBe(expectedStatus);

    return comment as CommentResponseBody;
  });

export const waitForSummaryStatus = async (
  session: E2eSession,
  rootCommentId: string,
  expectedStatus: SummaryStatus,
): Promise<Record<string, unknown>> =>
  waitFor(async () => {
    const response = await session.agent
      .get(`${API_PREFIX}/comments/${rootCommentId}/summary`)
      .expect(200);
    const body = response.body as { status: SummaryStatus };

    expect(body.status).toBe(expectedStatus);

    return response.body as Record<string, unknown>;
  });

export const prepareVideoWithTranscript = async (
  dataSource: DataSource,
  videoId: string,
): Promise<void> => {
  await dataSource.getRepository(Video).update(videoId, {
    title: 'E2E 영상',
    channelName: 'Arena E2E',
    metadataStatus: MetadataStatus.SUCCESS,
    transcriptStatus: TranscriptStatus.SUCCESS,
    embeddingStatus: EmbeddingStatus.SUCCESS,
    metadataErrorCode: null,
    metadataErrorMessage: null,
    transcriptErrorCode: null,
    transcriptErrorMessage: null,
    embeddingErrorCode: null,
    embeddingErrorMessage: null,
    processingLockedUntil: null,
    processedAt: new Date(),
  });

  await dataSource.query(
    `
      INSERT INTO "transcript_chunks"
        ("id", "video_id", "chunk_index", "content", "start_time", "end_time", "embedding")
      VALUES
        ($1, $2, 0, $3, 0, 12, $4::vector)
    `,
    [
      ulid(),
      videoId,
      '이 영상은 E2E 테스트에서 fact 근거 후보로 검색되는 자막입니다.',
      vectorLiteral(),
    ],
  );
};
