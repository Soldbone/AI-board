import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AuthSession } from '../auth/entities/auth-session.entity';
import { UserRole } from '../common/enums/user-role.enum';
import { User } from './entities/user.entity';

export type PublicUser = {
  id: string;
  email: string;
  nickname: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
};

type CreateUserParams = {
  email: string;
  passwordHash: string;
  nickname: string;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(AuthSession)
    private readonly authSessionsRepository: Repository<AuthSession>,
  ) {}

  async create(params: CreateUserParams): Promise<PublicUser> {
    const existingUser = await this.findByEmailWithDeleted(params.email);

    if (existingUser) {
      throw new ConflictException('이미 가입된 이메일입니다.');
    }

    const user = this.usersRepository.create({
      email: params.email,
      passwordHash: params.passwordHash,
      nickname: params.nickname,
      role: UserRole.USER,
    });

    const savedUser = await this.usersRepository.save(user);

    return this.toPublicUser(savedUser);
  }

  async findActiveByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email },
    });
  }

  async findByEmailWithDeleted(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email },
      withDeleted: true,
    });
  }

  async findActiveById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
    });
  }

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.findActiveById(userId);

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    return this.toPublicUser(user);
  }

  async softDeleteMe(userId: string, sessionId: string): Promise<void> {
    const user = await this.findActiveById(userId);

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    await this.usersRepository.softDelete(userId);
    await this.authSessionsRepository.update(
      { id: sessionId, userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
