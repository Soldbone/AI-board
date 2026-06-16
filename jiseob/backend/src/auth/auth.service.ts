import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { Request, Response } from 'express';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { AuthCookieService, REFRESH_TOKEN_COOKIE } from '../common/security/auth-cookie.service';
import { CsrfService } from '../common/security/csrf.service';
import { PublicUser, UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { AuthSession } from './entities/auth-session.entity';
import { JwtPayload } from './interfaces/jwt-payload.interface';

type AuthTokens = {
  accessToken: string;
  csrfToken: string;
};

type AuthResponse = {
  accessToken: string;
  user: PublicUser;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly authCookieService: AuthCookieService,
    private readonly csrfService: CsrfService,
    @InjectRepository(AuthSession)
    private readonly authSessionsRepository: Repository<AuthSession>,
  ) {}

  async signup(signupDto: SignupDto): Promise<PublicUser> {
    const passwordHash = await bcrypt.hash(signupDto.password, 12);

    return this.usersService.create({
      email: this.normalizeEmail(signupDto.email),
      passwordHash,
      nickname: signupDto.nickname,
    });
  }

  async login(loginDto: LoginDto, request: Request, response: Response): Promise<AuthResponse> {
    const user = await this.usersService.findActiveByEmail(this.normalizeEmail(loginDto.email));

    if (!user) {
      throw this.invalidCredentials();
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw this.invalidCredentials();
    }

    const tokens = await this.createSessionAndTokens(user.id, request, response);

    return {
      accessToken: tokens.accessToken,
      user: this.usersService.toPublicUser(user),
    };
  }

  async refresh(request: Request, response: Response): Promise<AuthTokens> {
    const refreshToken = this.getRefreshTokenFromCookie(request);
    const session = await this.findValidSessionByRefreshToken(refreshToken);

    this.csrfService.verifyRequest(request, session.id);

    const nextRefreshToken = this.createOpaqueToken();
    const expiresAt = this.createRefreshTokenExpiry();

    session.refreshTokenHash = this.hashToken(nextRefreshToken);
    session.rotatedAt = new Date();
    session.expiresAt = expiresAt;

    await this.authSessionsRepository.save(session);

    const accessToken = await this.signAccessToken({
      sub: session.user.id,
      email: session.user.email,
      role: session.user.role,
      sessionId: session.id,
    });
    const csrfToken = this.csrfService.createToken(session.id);

    this.authCookieService.setRefreshToken(response, nextRefreshToken, expiresAt);
    this.authCookieService.setCsrfToken(response, csrfToken);

    return { accessToken, csrfToken };
  }

  async issueCsrfToken(
    request: Request,
    response: Response,
  ): Promise<{
    csrfToken: string;
  }> {
    const refreshToken = this.getRefreshTokenFromCookie(request);
    const session = await this.findValidSessionByRefreshToken(refreshToken);
    const csrfToken = this.csrfService.createToken(session.id);

    this.authCookieService.setCsrfToken(response, csrfToken);

    return { csrfToken };
  }

  async logout(user: AuthenticatedUser, response: Response): Promise<void> {
    await this.revokeSession(user.id, user.sessionId);
    this.authCookieService.clearRefreshToken(response);
    this.authCookieService.clearCsrfToken(response);
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await this.authSessionsRepository.update(
      { id: sessionId, userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private async createSessionAndTokens(
    userId: string,
    request: Request,
    response: Response,
  ): Promise<AuthTokens> {
    const user = await this.usersService.findActiveById(userId);

    if (!user) {
      throw this.invalidCredentials();
    }

    const refreshToken = this.createOpaqueToken();
    const expiresAt = this.createRefreshTokenExpiry();
    const session = this.authSessionsRepository.create({
      userId: user.id,
      refreshTokenHash: this.hashToken(refreshToken),
      expiresAt,
      userAgent: request.header('user-agent') ?? null,
      ipAddress: this.getIpAddress(request),
    });
    const savedSession = await this.authSessionsRepository.save(session);
    const accessToken = await this.signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId: savedSession.id,
    });
    const csrfToken = this.csrfService.createToken(savedSession.id);

    this.authCookieService.setRefreshToken(response, refreshToken, expiresAt);
    this.authCookieService.setCsrfToken(response, csrfToken);

    return { accessToken, csrfToken };
  }

  private async findValidSessionByRefreshToken(refreshToken: string): Promise<AuthSession> {
    const session = await this.authSessionsRepository.findOne({
      where: { refreshTokenHash: this.hashToken(refreshToken) },
      relations: { user: true },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      session.user.deletedAt
    ) {
      throw new UnauthorizedException('인증 세션이 유효하지 않습니다.');
    }

    return session;
  }

  private async signAccessToken(payload: JwtPayload): Promise<string> {
    const secret = this.configService.get<string>('JWT_ACCESS_SECRET');

    if (!secret) {
      throw new UnauthorizedException('JWT access secret이 설정되지 않았습니다.');
    }

    return this.jwtService.signAsync(payload, {
      secret,
      expiresIn: this.parseDurationSeconds(
        this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
      ),
    });
  }

  private getRefreshTokenFromCookie(request: Request): string {
    const cookies = request.cookies as Record<string, string | undefined>;
    const refreshToken = cookies?.[REFRESH_TOKEN_COOKIE];

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh Token이 없습니다.');
    }

    return refreshToken;
  }

  private createOpaqueToken(): string {
    return randomBytes(64).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private createRefreshTokenExpiry(): Date {
    const expiresIn = this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN') ?? '7d';

    return new Date(Date.now() + this.parseDurationMs(expiresIn));
  }

  private parseDurationMs(value: string): number {
    const match = value.match(/^(\d+)([smhd])$/);

    if (!match) {
      throw new UnauthorizedException('Refresh Token 만료 시간 형식이 올바르지 않습니다.');
    }

    const amount = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return amount * multipliers[unit];
  }

  private parseDurationSeconds(value: string): number {
    return Math.floor(this.parseDurationMs(value) / 1000);
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private getIpAddress(request: Request): string | null {
    const forwardedFor = request.header('x-forwarded-for');

    if (forwardedFor) {
      return forwardedFor.split(',')[0]?.trim() ?? null;
    }

    return request.ip ?? null;
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
  }
}
