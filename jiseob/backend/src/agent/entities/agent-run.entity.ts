import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../../common/entities/base.entity';
import { AgentRunStatus } from '../../common/enums/agent-status.enum';
import { Post } from '../../posts/entities/post.entity';
import { User } from '../../users/entities/user.entity';
import { AgentStep } from './agent-step.entity';

@Entity('agent_runs')
export class AgentRun extends BaseModel {
  @Index()
  @Column({ name: 'post_id', type: 'char', length: 26 })
  postId: string;

  @ManyToOne(() => Post, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @Index()
  @Column({ name: 'user_id', type: 'char', length: 26 })
  userId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'text' })
  question: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: AgentRunStatus.PENDING })
  status: AgentRunStatus;

  @Column({ type: 'text', nullable: true })
  answer?: string | null;

  @Column({ name: 'evidence_candidates', type: 'jsonb', default: () => "'[]'::jsonb" })
  evidenceCandidates: unknown[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  limitations: string[];

  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true })
  errorCode?: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  model?: string | null;

  @Column({ name: 'max_steps', type: 'int', default: 4 })
  maxSteps: number;

  @Column({ name: 'step_count', type: 'int', default: 0 })
  stepCount: number;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt?: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date | null;

  @OneToMany(() => AgentStep, (step) => step.run)
  steps: AgentStep[];
}
