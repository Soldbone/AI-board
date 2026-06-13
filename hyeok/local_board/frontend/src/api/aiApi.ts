import { apiPost } from './client'

export type SimilarPostRequest = {
  title: string
  content: string
  tag_names: string[]
  limit?: number
}

export type SimilarPostItem = {
  id: number
  title: string
  content_preview: string
  region: string | null
  store_name: string | null
  category: string | null
  comment_count: number
  score: number
  matched_keywords: string[]
  matched_fields: string[]
  created_at: string
}

type SimilarPostResponse = {
  items: SimilarPostItem[]
}

export function getSimilarPosts(data: SimilarPostRequest) {
  return apiPost<SimilarPostResponse>('/ai/similar-posts', data)
}

export type AiTagSuggestionRequest = {
  title: string
  content: string
  limit?: number
}

export type AiTagSuggestionItem = {
  name: string
  score: number
}

type AiTagSuggestionResponse = {
  items: AiTagSuggestionItem[]
}

export function getAiTagSuggestions(data: AiTagSuggestionRequest) {
  return apiPost<AiTagSuggestionResponse>('/ai/tag-suggestions', data)
}
