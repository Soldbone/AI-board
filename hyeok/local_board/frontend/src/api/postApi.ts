import { apiGet, apiPatch, apiPost } from './client'

export type PostListItem = {
  id: number
  author_id: number
  title: string
  region: string | null
  store_name: string | null
  category: string | null
  view_count: number
  comment_count: number
  created_at: string
}

export type PostRead = PostListItem & {
  content: string
  tag_names: string[]
  updated_at: string
}

export type PostListResponse = {
  items: PostListItem[]
  total_count: number
  page: number
  size: number
  total_pages: number
}

export type PostFormPayload = {
  title: string
  content: string
  region: string | null
  store_name: string | null
  category: string | null
  tag_names?: string[]
}

export type PostSort = 'latest' | 'views' | 'comments'

type PostListParams = {
  page?: number
  size?: number
  keyword?: string
  tag?: string
  sort?: PostSort
}

export function getPosts(params: PostListParams = {}) {
  const query = new URLSearchParams({
    page: String(params.page ?? 1),
    size: String(params.size ?? 10),
  })

  if (params.keyword) {
    query.set('keyword', params.keyword)
  }

  if (params.tag) {
    query.set('tag', params.tag)
  }

  if (params.sort) {
    query.set('sort', params.sort)
  }

  return apiGet<PostListResponse>(`/posts?${query.toString()}`)
}

export function getPost(postId: number) {
  return apiGet<PostRead>(`/posts/${postId}`)
}

export function createPost(data: PostFormPayload, token: string) {
  return apiPost<PostRead>('/posts', data, token)
}

export function updatePost(postId: number, data: PostFormPayload, token: string) {
  return apiPatch<PostRead>(`/posts/${postId}`, data, token)
}
