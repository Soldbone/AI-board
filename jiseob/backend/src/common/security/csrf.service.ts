import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { CSRF_TOKEN_COOKIE } from './auth-cookie.service';

const CSRF_HEADER = 'x-csrf-token';

@Injectable()
export class CsrfService {
  constructor(private readonly configService: ConfigService) {}

  createToken(sessionId: string): string {
    const nonce = randomBytes(32).toString('base64url');
    const signature = this.sign(sessionId, nonce);

    return `${nonce}.${signature}`;
  }

  verifyRequest(request: Request, sessionId: string): void {
    this.verifyOrigin(request);

    const headerToken = this.getHeaderToken(request);
    const cookieToken = this.getCookieToken(request);

    if (!headerToken || !cookieToken || headerToken !== cookieToken) {
      throw new ForbiddenException('CSRF 토큰이 유효하지 않습니다.');
    }

    this.verifyToken(sessionId, headerToken);
  }

  verifyToken(sessionId: string, token: string): void {
    const [nonce, signature] = token.split('.');

    if (!nonce || !signature) {
      throw new ForbiddenException('CSRF 토큰 형식이 올바르지 않습니다.');
    }

    const expectedSignature = this.sign(sessionId, nonce);

    if (!this.safeEqual(signature, expectedSignature)) {
      throw new ForbiddenException('CSRF 토큰 서명이 유효하지 않습니다.');
    }
  }

  private verifyOrigin(request: Request): void {
    const origin = request.header('origin');

    if (!origin) {
      return;
    }

    const allowedOrigin = this.configService.get<string>('WEB_ORIGIN') ?? 'http://localhost:5173';

    if (origin !== allowedOrigin) {
      throw new ForbiddenException('허용되지 않은 요청 출처입니다.');
    }
  }

  private getHeaderToken(request: Request): string | undefined {
    const header = request.header(CSRF_HEADER);

    return header || undefined;
  }

  private getCookieToken(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, string | undefined>;

    return cookies?.[CSRF_TOKEN_COOKIE];
  }

  private sign(sessionId: string, nonce: string): string {
    const secret = this.configService.get<string>('CSRF_SECRET');

    if (!secret) {
      throw new UnauthorizedException('CSRF secret이 설정되지 않았습니다.');
    }

    return createHmac('sha256', secret).update(`${sessionId}.${nonce}`).digest('base64url');
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  }
}
