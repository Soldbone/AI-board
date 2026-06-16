import { Column, Entity, Index, OneToMany } from 'typeorm';
import { AuthSession } from '../../auth/entities/auth-session.entity';
import { BaseModel } from '../../common/entities/base.entity';
import { UserRole } from '../../common/enums/user-role.enum';

@Entity('users')
export class User extends BaseModel {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 50 })
  nickname: string;

  @Column({ type: 'varchar', length: 20, default: UserRole.USER })
  role: UserRole;

  @OneToMany(() => AuthSession, (session) => session.user)
  authSessions: AuthSession[];
}
