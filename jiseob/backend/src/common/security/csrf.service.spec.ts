import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { CSRF_TOKEN_COOKIE } from './auth-cookie.service';
import { CsrfService } from './csrf.service';

const createConfigService = (): ConfigService =>
  ({
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        CSRF_SECRET: 'test-csrf-secret',
        WEB_ORIGIN: 'http://localhost:5173',
      };

      return values[key];
    }),
  }) as unknown as ConfigService;

const createRequest = (csrfToken: string, origin = 'http://localhost:5173'): Request =>
  ({
    cookies: {
      [CSRF_TOKEN_COOKIE]: csrfToken,
    },
    header: jest.fn((key: string) => {
      const headers: Record<string, string> = {
        origin,
        'x-csrf-token': csrfToken,
      };

      return headers[key.toLowerCase()];
    }),
  }) as unknown as Request;

describe('CsrfService', () => {
  it('verifies a token signed for the current session', () => {
    const service = new CsrfService(createConfigService());
    const token = service.createToken('session-1');

    expect(() => service.verifyRequest(createRequest(token), 'session-1')).not.toThrow();
  });

  it('rejects a token signed for a different session', () => {
    const service = new CsrfService(createConfigService());
    const token = service.createToken('session-1');

    expect(() => service.verifyRequest(createRequest(token), 'session-2')).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a request from an unexpected origin', () => {
    const service = new CsrfService(createConfigService());
    const token = service.createToken('session-1');

    expect(() =>
      service.verifyRequest(createRequest(token, 'https://evil.example'), 'session-1'),
    ).toThrow(ForbiddenException);
  });
});
