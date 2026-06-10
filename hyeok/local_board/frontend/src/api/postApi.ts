import { apiGet } from './client'

export type PostListItem = {
  id: number
  author_id: number
  title: string
  region: string | null
  store_name: string | null
  category: string | null
  created_at: string
}

export type PostListResponse = {
  items: PostListItem[]
  total_count: number
  page: number
  size: number
  total_pages: number
}

export function getPosts() {
  return apiGet<PostListResponse>('/posts?page=1&size=10')
}