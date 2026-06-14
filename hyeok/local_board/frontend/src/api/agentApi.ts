import { apiPost } from './client'

export type AgentPlaceRecommendationRequest = {
  region: string
  title?: string
  content?: string
  keyword?: string | null
  display?: number
}

export type AgentRecommendedPlace = {
  title: string
  category: string
  road_address: string
  address: string
  link: string
  naver_map_url: string
  image_url: string
  image_source_url: string
}

export type AgentPlaceRecommendationResponse = {
  answer: string
  used_mcp: boolean
  query: string
  places: AgentRecommendedPlace[]
  fallback_map_url: string
  reasoning_summary: string
  tool_status: string
}

export function getAgentPlaceRecommendation(data: AgentPlaceRecommendationRequest) {
  return apiPost<AgentPlaceRecommendationResponse>('/agent/place-recommendation', data)
}
