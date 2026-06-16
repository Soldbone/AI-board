import { apiRequest } from './client';
import type {
  AdminCommentResponse,
  ListAdminCommentsQuery,
  PaginatedResponse,
  RetryCommentAnalysisResponse,
  Ulid,
} from './types';

export function listAdminComments(query: ListAdminCommentsQuery = {}) {
  return apiRequest<PaginatedResponse<AdminCommentResponse>>('/admin/comments', {
    auth: true,
    query,
  });
}

export function deleteAdminComment(commentId: Ulid) {
  return apiRequest<void>(`/admin/comments/${commentId}`, {
    method: 'DELETE',
    auth: true,
    csrf: true,
  });
}

export function retryCommentAnalysis(commentId: Ulid) {
  return apiRequest<RetryCommentAnalysisResponse>(`/admin/comments/${commentId}/analysis/retry`, {
    method: 'POST',
    auth: true,
    csrf: true,
  });
}
