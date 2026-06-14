import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import { CommentAnalysis } from '../../ai/comment-analysis/entities/comment-analysis.entity';
import { BaseModel } from '../../common/entities/base.entity';
import { ModerationStatus } from '../../common/enums/comment-status.enum';
import { Post } from '../../posts/entities/post.entity';
import { User } from '../../users/entities/user.entity';

@Entity('comments')
export class Comment extends BaseModel {
  @Index()
  @Column({ name: 'post_id', type: 'char', length: 26 })
  postId: string;

  @ManyToOne(() => Post, (post) => post.comments, { nullable: false })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @Index()
  @Column({ name: 'author_id', type: 'char', length: 26 })
  authorId: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Index()
  @Column({ name: 'parent_comment_id', type: 'char', length: 26, nullable: true })
  parentCommentId?: string | null;

  @ManyToOne(() => Comment, (comment) => comment.replies, { nullable: true })
  @JoinColumn({ name: 'parent_comment_id' })
  parentComment?: Comment | null;

  @OneToMany(() => Comment, (comment) => comment.parentComment)
  replies: Comment[];

  @Column({ type: 'text' })
  content: string;

  @Column({
    name: 'moderation_status',
    type: 'varchar',
    length: 30,
    default: ModerationStatus.NORMAL,
  })
  moderationStatus: ModerationStatus;

  @OneToOne(() => CommentAnalysis, (analysis) => analysis.comment)
  analysis?: CommentAnalysis | null;
}
