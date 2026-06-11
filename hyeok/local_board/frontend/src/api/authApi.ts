import { apiGet, apiPost } from './client'

export type SignupRequest = {
  email: string
  nickname: string
  password: string
}

export type UserResponse = {
  id: number
  email: string
  nickname: string
  bio: string | null
  created_at: string
  updated_at: string
}

export type LoginRequest = {
  email: string
  password: string
}

export type TokenResponse = {
  access_token: string
  token_type: string
}

export function signup(data: SignupRequest) {
  return apiPost<UserResponse>('/auth/signup', data)
}

export function login(data: LoginRequest) {
  return apiPost<TokenResponse>('/auth/login', data)
}

export function getMe(token: string) {
  return apiGet<UserResponse>('/auth/me', token)
}
