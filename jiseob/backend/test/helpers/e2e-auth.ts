import request, { SuperAgentTest } from 'supertest';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/user-role.enum';
import { User } from '../../src/users/entities/user.entity';

const API_PREFIX = '/api/v1';
const CSRF_COOKIE_NAME = 'arena_csrf_token';

export type E2eSession = {
  agent: SuperAgentTest;
  userId: string;
  email: string;
  password: string;
  accessToken: string;
  csrfToken: string;
};

type SessionInput = {
  email: string;
  password?: string;
  nickname: string;
};

type AuthResponseBody = {
  accessToken: string;
  user: {
    id: string;
    email: string;
  };
};

const defaultPassword = 'password123';

const readCookie = (setCookie: string[] | string | undefined, name: string): string | null => {
  const cookieHeaders = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];

  for (const cookieHeader of cookieHeaders) {
    const [cookiePair] = cookieHeader.split(';');
    const [cookieName, cookieValue] = cookiePair.split('=');

    if (cookieName === name && cookieValue) {
      return decodeURIComponent(cookieValue);
    }
  }

  return null;
};

export const authHeader = (session: E2eSession): { Authorization: string } => ({
  Authorization: `Bearer ${session.accessToken}`,
});

export const csrfHeader = (session: E2eSession): { 'x-csrf-token': string } => ({
  'x-csrf-token': session.csrfToken,
});

export const signupUser = async (httpServer: unknown, input: SessionInput): Promise<void> => {
  await request(httpServer)
    .post(`${API_PREFIX}/auth/signup`)
    .send({
      email: input.email,
      password: input.password ?? defaultPassword,
      nickname: input.nickname,
    })
    .expect(201);
};

export const loginUser = async (httpServer: unknown, input: SessionInput): Promise<E2eSession> => {
  const agent = request.agent(httpServer);
  const password = input.password ?? defaultPassword;
  const loginResponse = await agent
    .post(`${API_PREFIX}/auth/login`)
    .send({
      email: input.email,
      password,
    })
    .expect(200);
  const body = loginResponse.body as AuthResponseBody;
  const csrfToken = readCookie(loginResponse.headers['set-cookie'], CSRF_COOKIE_NAME);

  if (!csrfToken) {
    throw new Error('Expected login response to set CSRF cookie.');
  }

  return {
    agent,
    userId: body.user.id,
    email: input.email,
    password,
    accessToken: body.accessToken,
    csrfToken,
  };
};

export const createSession = async (
  httpServer: unknown,
  input: SessionInput,
): Promise<E2eSession> => {
  await signupUser(httpServer, input);
  return loginUser(httpServer, input);
};

export const promoteToAdmin = async (dataSource: DataSource, userId: string): Promise<void> => {
  await dataSource.getRepository(User).update(userId, {
    role: UserRole.ADMIN,
  });
};

export const createAdminSession = async (
  httpServer: unknown,
  dataSource: DataSource,
  input: SessionInput,
): Promise<E2eSession> => {
  const session = await createSession(httpServer, input);

  await promoteToAdmin(dataSource, session.userId);

  return loginUser(httpServer, input);
};
