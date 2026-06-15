import { apiRequest } from './client';
import type {
  CommentEvidencesResponse,
  CommentResponse,
  CreateCommentRequest,
  SummaryResponse,
  Ulid,
  UpdateCommentRequest,
} from './types';

export function listComments(postId: Ulid) {
  return apiRequest<CommentResponse[]>(`/posts/${postId}/comments`);
}

export function createComment(postId: Ulid, body: CreateCommentRequest) {
  return apiRequest<CommentResponse>(`/posts/${postId}/comments`, {
    method: 'POST',
    body,
    auth: true,
    csrf: true,
  });
}

export function createReply(commentId: Ulid, body: CreateCommentRequest) {
  return apiRequest<CommentResponse>(`/comments/${commentId}/replies`, {
    method: 'POST',
    body,
    auth: true,
    csrf: true,
  });
}

export function updateComment(commentId: Ulid, body: UpdateCommentRequest) {
  return apiRequest<CommentResponse>(`/comments/${commentId}`, {
    method: 'PATCH',
    body,
    auth: true,
    csrf: true,
  });
}

export function deleteComment(commentId: Ulid) {
  return apiRequest<void>(`/comments/${commentId}`, {
    method: 'DELETE',
    auth: true,
    csrf: true,
  });
}

export function getEvidences(commentId: Ulid) {
  return apiRequest<CommentEvidencesResponse>(`/comments/${commentId}/evidences`);
}

export function createSummary(rootCommentId: Ulid) {
  return apiRequest<SummaryResponse>(`/comments/${rootCommentId}/summary`, {
    method: 'POST',
    auth: true,
    csrf: true,
  });
}

export function getSummary(rootCommentId: Ulid) {
  return apiRequest<SummaryResponse>(`/comments/${rootCommentId}/summary`);
}
