import { apiGet, apiPost } from './client'

export type CommentRead = {
  id: number
  post_id: number
  author_id: number | null
  author_nickname: string
  parent_id: number | null
  content: string
  is_anonymous: boolean
  created_at: string
  updated_at: string
}

export type CommentCreatePayload = {
  content: string
  is_anonymous?: boolean
  parent_id?: number | null
}

export function getComments(postId: number) {
  return apiGet<CommentRead[]>(`/posts/${postId}/comments`)
}

export function createComment(
  postId: number,
  data: CommentCreatePayload,
  token: string,
) {
  return apiPost<CommentRead>(`/posts/${postId}/comments`, data, token)
}