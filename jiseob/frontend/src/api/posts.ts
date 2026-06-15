import { apiRequest } from './client';
import type {
  CreatePostRequest,
  LikePostResponse,
  ListPostsQuery,
  PaginatedResponse,
  PostListItemResponse,
  PostResponse,
  PostViewResponse,
  TagResponse,
  UpdatePostRequest,
  Ulid,
} from './types';

export function listPosts(query: ListPostsQuery = {}) {
  return apiRequest<PaginatedResponse<PostListItemResponse>>('/posts', {
    auth: true,
    optionalAuth: true,
    query,
  });
}

export function listTags() {
  return apiRequest<TagResponse[]>('/tags');
}

export function getPost(postId: Ulid) {
  return apiRequest<PostResponse>(`/posts/${postId}`, {
    auth: true,
    optionalAuth: true,
  });
}

export function createPost(body: CreatePostRequest) {
  return apiRequest<PostResponse>('/posts', {
    method: 'POST',
    body,
    auth: true,
    csrf: true,
  });
}

export function updatePost(postId: Ulid, body: UpdatePostRequest) {
  return apiRequest<PostResponse>(`/posts/${postId}`, {
    method: 'PATCH',
    body,
    auth: true,
    csrf: true,
  });
}

export function deletePost(postId: Ulid) {
  return apiRequest<void>(`/posts/${postId}`, {
    method: 'DELETE',
    auth: true,
    csrf: true,
  });
}

export function incrementPostView(postId: Ulid) {
  return apiRequest<PostViewResponse>(`/posts/${postId}/views`, {
    method: 'POST',
  });
}

export function likePost(postId: Ulid) {
  return apiRequest<LikePostResponse>(`/posts/${postId}/like`, {
    method: 'POST',
    auth: true,
    csrf: true,
  });
}

export function unlikePost(postId: Ulid) {
  return apiRequest<void>(`/posts/${postId}/like`, {
    method: 'DELETE',
    auth: true,
    csrf: true,
  });
}
