export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export type ApiError = {
  status: number;
  message: string;
  code?: string;
};

export type ApiRequestOptions = {
  method?: ApiMethod;
  body?: unknown;
  auth?: boolean;
  authRefresh?: boolean;
  optionalAuth?: boolean;
  csrf?: boolean;
  headers?: HeadersInit;
  query?: Record<string, boolean | number | string | null | undefined>;
  signal?: AbortSignal;
};

export class ApiRequestError extends Error implements ApiError {
  status: number;
  code?: string;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'ApiRequestError';
    this.status = error.status;
    this.code = error.code;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';

let accessToken: string | null = null;
let csrfToken: string | null = null;
let authRefreshHandler: (() => Promise<void>) | null = null;

export const AUTH_EXPIRED_EVENT = 'arena-auth-expired';

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function clearAccessToken() {
  accessToken = null;
}

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export function getCsrfToken() {
  return csrfToken;
}

export function clearCsrfToken() {
  csrfToken = null;
}

export function clearApiSession() {
  clearAccessToken();
  clearCsrfToken();
}

export function setAuthRefreshHandler(handler: (() => Promise<void>) | null) {
  authRefreshHandler = handler;
}

export function notifyAuthExpired() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
}

export async function apiRequest<TResponse = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<TResponse> {
  const {
    method = 'GET',
    body,
    auth = false,
    authRefresh = true,
    optionalAuth = false,
    csrf = false,
    headers,
    query,
    signal,
  } = options;
  const requestHeaders = new Headers(headers);

  if (!requestHeaders.has('Accept')) {
    requestHeaders.set('Accept', 'application/json');
  }

  if (body !== undefined && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  if (auth && accessToken) {
    requestHeaders.set('Authorization', `Bearer ${accessToken}`);
  }

  if (csrf && csrfToken) {
    requestHeaders.set('X-CSRF-Token', csrfToken);
  }

  const response = await fetchApi(path, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'include',
    query,
    signal,
  });

  if (!response.ok) {
    const normalizedError = await normalizeApiError(response);

    if (auth && authRefresh && normalizedError.status === 401 && authRefreshHandler) {
      try {
        await authRefreshHandler();
        return apiRequest<TResponse>(path, {
          ...options,
          authRefresh: false,
        });
      } catch {
        clearApiSession();
        notifyAuthExpired();

        if (optionalAuth) {
          return apiRequest<TResponse>(path, {
            ...options,
            auth: false,
            authRefresh: false,
            optionalAuth: false,
          });
        }
      }
    }

    throw new ApiRequestError(normalizedError);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return parseApiResponse<TResponse>(response);
}

function buildApiUrl(
  path: string,
  query?: Record<string, boolean | number | string | null | undefined>,
) {
  const base = API_BASE_URL.replace(/\/$/, '');
  const pathname = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${base}${pathname}`, window.location.origin);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === null || value === undefined || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

async function fetchApi(
  path: string,
  options: RequestInit & {
    query?: Record<string, boolean | number | string | null | undefined>;
  },
) {
  const { query, ...fetchOptions } = options;

  try {
    return await fetch(buildApiUrl(path, query), fetchOptions);
  } catch (error) {
    throw new ApiRequestError({
      status: 0,
      message:
        error instanceof DOMException && error.name === 'AbortError'
          ? '요청이 취소되었습니다.'
          : '서버에 연결할 수 없습니다.',
      code:
        error instanceof DOMException && error.name === 'AbortError'
          ? 'REQUEST_ABORTED'
          : 'NETWORK_ERROR',
    });
  }
}

async function parseApiResponse<TResponse>(response: Response) {
  const contentLength = response.headers.get('content-length');
  if (contentLength === '0') {
    return undefined as TResponse;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as TResponse;
  }

  const text = await response.text();
  return (text || undefined) as TResponse;
}

async function normalizeApiError(response: Response): Promise<ApiError> {
  const fallback: ApiError = {
    status: response.status,
    message: response.statusText || '요청을 처리하지 못했습니다.',
  };

  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.includes('application/json')) {
    return fallback;
  }

  const payload = (await response.json().catch(() => null)) as {
    code?: unknown;
    error?: unknown;
    errorCode?: unknown;
    message?: unknown;
    statusCode?: unknown;
  } | null;

  if (!payload) return fallback;

  return {
    status: typeof payload.statusCode === 'number' ? payload.statusCode : response.status,
    message: normalizeMessage(payload.message) ?? fallback.message,
    code: normalizeCode(payload.code ?? payload.errorCode ?? payload.error),
  };
}

function normalizeMessage(message: unknown) {
  if (Array.isArray(message)) {
    return message.filter((item): item is string => typeof item === 'string').join(', ');
  }

  if (typeof message === 'string') {
    return message;
  }

  return undefined;
}

function normalizeCode(code: unknown) {
  if (typeof code === 'string' && code.length > 0) {
    return code;
  }

  return undefined;
}
