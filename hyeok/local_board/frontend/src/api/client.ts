const API_BASE_URL = 'http://127.0.0.1:8000'

type RequestMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

type RequestOptions = {
  method?: RequestMethod
  body?: unknown
  token?: string | null
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    const message = errorData?.detail ?? 'API 요청에 실패했습니다.'
    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

export function apiGet<T>(path: string, token?: string | null) {
  return request<T>(path, {
    method: 'GET',
    token,
  })
}

export function apiPost<T>(path: string, body: unknown, token?: string | null) {
  return request<T>(path, {
    method: 'POST',
    body,
    token,
  })
}

export function apiPatch<T>(path: string, body: unknown, token?: string | null) {
  return request<T>(path, {
    method: 'PATCH',
    body,
    token,
  })
}

export function apiDelete<T>(path: string, token?: string | null) {
  return request<T>(path, {
    method: 'DELETE',
    token,
  })
}
