import { apiPatch } from './client'
import type { UserResponse } from './authApi'

export type UserUpdatePayload = {
  nickname?: string | null
  bio?: string | null
}

export function updateMe(data: UserUpdatePayload, token: string) {
  return apiPatch<UserResponse>('/users/me', data, token)
}
