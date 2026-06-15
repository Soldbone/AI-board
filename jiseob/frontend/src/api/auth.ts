import { apiRequest, clearApiSession, getCsrfToken, setAccessToken, setCsrfToken } from './client';
import type {
  CsrfResponse,
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  SignupRequest,
  UserResponse,
} from './types';

export async function signup(body: SignupRequest) {
  return apiRequest<UserResponse>('/auth/signup', {
    method: 'POST',
    body,
  });
}

export async function login(body: LoginRequest) {
  const response = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body,
  });

  setAccessToken(response.accessToken);

  try {
    await prepareCsrfToken({ force: true });
  } catch (error) {
    clearApiSession();
    throw error;
  }

  return response;
}

export async function refresh() {
  await prepareCsrfToken();

  const response = await apiRequest<RefreshResponse>('/auth/refresh', {
    method: 'POST',
    csrf: true,
  });

  setAccessToken(response.accessToken);
  setCsrfToken(response.csrfToken);
  return response;
}

export async function logout() {
  await prepareCsrfToken({ force: true });

  await apiRequest<void>('/auth/logout', {
    method: 'POST',
    auth: true,
    csrf: true,
  });

  clearApiSession();
}

export async function getCsrf() {
  const response = await apiRequest<CsrfResponse>('/auth/csrf');
  setCsrfToken(response.csrfToken);
  return response;
}

export function getMe() {
  return apiRequest<UserResponse>('/users/me', {
    auth: true,
  });
}

export async function prepareCsrfToken(options: { force?: boolean } = {}) {
  const currentToken = getCsrfToken();

  if (currentToken && !options.force) {
    return currentToken;
  }

  const response = await getCsrf();
  return response.csrfToken;
}

export async function restoreSession() {
  try {
    await prepareCsrfToken({ force: true });
    await refresh();
    return await getMe();
  } catch (error) {
    clearApiSession();
    throw error;
  }
}
