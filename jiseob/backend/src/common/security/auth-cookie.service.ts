import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

export const REFRESH_TOKEN_COOKIE = 'arena_refresh_token';
export const CSRF_TOKEN_COOKIE = 'arena_csrf_token';

@Injectable()
export class AuthCookieService {
  constructor(private readonly configService: ConfigService) {}

  setRefreshToken(response: Response, refreshToken: string, expiresAt: Date): void {
    response.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: 'lax',
      path: this.getRefreshCookiePath(),
      expires: expiresAt,
    });
  }

  clearRefreshToken(response: Response): void {
    response.clearCookie(REFRESH_TOKEN_COOKIE, {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: 'lax',
      path: this.getRefreshCookiePath(),
    });
  }

  setCsrfToken(response: Response, csrfToken: string): void {
    response.cookie(CSRF_TOKEN_COOKIE, csrfToken, {
      httpOnly: false,
      secure: this.isProduction(),
      sameSite: 'lax',
      path: this.getApiPrefix(),
    });
  }

  clearCsrfToken(response: Response): void {
    response.clearCookie(CSRF_TOKEN_COOKIE, {
      httpOnly: false,
      secure: this.isProduction(),
      sameSite: 'lax',
      path: this.getApiPrefix(),
    });
  }

  private getRefreshCookiePath(): string {
    return `${this.getApiPrefix()}/auth`;
  }

  private getApiPrefix(): string {
    const configuredPrefix = this.configService.get<string>('API_PREFIX') ?? '/api/v1';
    const normalizedPrefix = configuredPrefix.startsWith('/')
      ? configuredPrefix
      : `/${configuredPrefix}`;

    return normalizedPrefix.replace(/\/+$/, '');
  }

  private isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }
}
