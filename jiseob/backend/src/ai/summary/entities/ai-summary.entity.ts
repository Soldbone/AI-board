import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Comment } from '../../../comments/entities/comment.entity';
import { BaseModel } from '../../../common/entities/base.entity';
import { SummaryStatus, SummaryTargetType } from '../../../common/enums/ai-status.enum';
import { Post } from '../../../posts/entities/post.entity';
import { User } from '../../../users/entities/user.entity';

@Entity('ai_summaries')
@Index(['rootCommentId'], { unique: true, where: '"deleted_at" IS NULL' })
export class AiSummary extends BaseModel {
  @Column({
    name: 'target_type',
    type: 'varchar',
    length: 30,
    default: SummaryTargetType.COMMENT_THREAD,
  })
  targetType: SummaryTargetType;

  @Index()
  @Column({ name: 'post_id', type: 'char', length: 26 })
  postId: string;

  @ManyToOne(() => Post, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @Index()
  @Column({ name: 'root_comment_id', type: 'char', length: 26 })
  rootCommentId: string;

  @ManyToOne(() => Comment, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'root_comment_id' })
  rootComment: Comment;

  @Column({ name: 'created_by_id', type: 'char', length: 26, nullable: true })
  createdById?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy?: User | null;

  @Column({ name: 'summary_text', type: 'text', nullable: true })
  summaryText?: string | null;

  @Index()
  @Column({
    name: 'summary_status',
    type: 'varchar',
    length: 20,
    default: SummaryStatus.PENDING,
  })
  summaryStatus: SummaryStatus;

  @Column({ name: 'summarized_comment_count', type: 'int', default: 0 })
  summarizedCommentCount: number;

  @Column({ name: 'last_comment_id', type: 'char', length: 26, nullable: true })
  lastCommentId?: string | null;

  @Column({ name: 'last_comment_updated_at', type: 'timestamptz', nullable: true })
  lastCommentUpdatedAt?: Date | null;

  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true })
  errorCode?: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null;

  @Column({ name: 'generated_at', type: 'timestamptz', nullable: true })
  generatedAt?: Date | null;
}
