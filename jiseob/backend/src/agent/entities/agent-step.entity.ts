import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../common/entities/base.entity';
import { AgentStepStatus, AgentStepType } from '../../common/enums/agent-status.enum';
import { AgentRun } from './agent-run.entity';

@Entity('agent_steps')
@Index(['runId', 'stepIndex'], { unique: true })
export class AgentStep extends BaseModel {
  @Index()
  @Column({ name: 'run_id', type: 'char', length: 26 })
  runId: string;

  @ManyToOne(() => AgentRun, (run) => run.steps, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'run_id' })
  run: AgentRun;

  @Column({ name: 'step_index', type: 'int' })
  stepIndex: number;

  @Column({ type: 'varchar', length: 20 })
  type: AgentStepType;

  @Column({ type: 'varchar', length: 20 })
  status: AgentStepStatus;

  @Column({ name: 'tool_name', type: 'varchar', length: 120, nullable: true })
  toolName?: string | null;

  @Column({ name: 'tool_arguments', type: 'jsonb', nullable: true })
  toolArguments?: Record<string, unknown> | null;

  @Column({ name: 'tool_result', type: 'jsonb', nullable: true })
  toolResult?: unknown | null;

  @Column({ name: 'model_output', type: 'jsonb', nullable: true })
  modelOutput?: unknown | null;

  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true })
  errorCode?: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt?: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date | null;
}
