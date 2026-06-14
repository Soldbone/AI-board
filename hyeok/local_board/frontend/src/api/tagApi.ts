import { apiGet } from './client'

export type TagRead = {
  id: number
  name: string
  created_at: string
}

export type TagSuggestion = {
  id: number
  name: string
  count: number
}

export function getTags() {
  return apiGet<TagRead[]>('/tags')
}

export function getTagSuggestions(limit = 10) {
  return apiGet<TagSuggestion[]>(`/tags/suggestions?limit=${limit}`)
}
