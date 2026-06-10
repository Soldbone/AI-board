import { apiPost } from './client'

type SignupRequest = {
  email: string
  nickname: string
  password: string
}

type UserResponse = {
  id: number
  email: string
  nickname: string
  bio: string | null
  created_at: string
  updated_at: string
}

export function signup(data: SignupRequest) {
  return apiPost<UserResponse>('/auth/signup', data)
}