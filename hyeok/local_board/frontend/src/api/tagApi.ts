import { apiGet } from './client'

export type TagRead = {
  id: number
  name: string
  created_at: string
}

export function getTags() {
  return apiGet<TagRead[]>('/tags')
}
