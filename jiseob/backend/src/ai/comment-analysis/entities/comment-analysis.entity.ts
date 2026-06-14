import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { Comment } from '../../../comments/entities/comment.entity';
import { BaseModel } from '../../../common/entities/base.entity';
import { AiAnalysisStatus, CommentType, RagStatus } from '../../../common/enums/ai-status.enum';

@Entity('comment_analyses')
export class CommentAnalysis extends BaseModel {
  @Index({ unique: true })
  @Column({ name: 'comment_id', type: 'char', length: 26 })
  commentId: string;

  @OneToOne(() => Comment, (comment) => comment.analysis, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'comment_id' })
  comment: Comment;

  @Column({ name: 'comment_type', type: 'varchar', length: 30, nullable: true })
  commentType?: CommentType | null;

  @Column({
    name: 'ai_analysis_status',
    type: 'varchar',
    length: 20,
    default: AiAnalysisStatus.PENDING,
  })
  aiAnalysisStatus: AiAnalysisStatus;

  @Column({ name: 'rag_status', type: 'varchar', length: 20, default: RagStatus.NOT_REQUIRED })
  ragStatus: RagStatus;

  @Column({ name: 'evidence_count', type: 'int', default: 0 })
  evidenceCount: number;

  @Column({ name: 'analyzed_at', type: 'timestamptz', nullable: true })
  analyzedAt?: Date | null;

  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true })
  errorCode?: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null;
}
