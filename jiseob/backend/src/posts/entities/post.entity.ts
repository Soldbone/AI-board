import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { Comment } from '../../comments/entities/comment.entity';
import { BaseModel } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Video } from '../../videos/entities/video.entity';
import { PostLike } from './post-like.entity';
import { PostTag } from './post-tag.entity';

@Entity('posts')
export class Post extends BaseModel {
  @Index()
  @Column({ name: 'author_id', type: 'char', length: 26 })
  authorId: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Index()
  @Column({ name: 'video_id', type: 'char', length: 26 })
  videoId: string;

  @ManyToOne(() => Video, (video) => video.posts, { nullable: false })
  @JoinColumn({ name: 'video_id' })
  video: Video;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'youtube_url', type: 'text' })
  youtubeUrl: string;

  @Index()
  @Column({ name: 'comment_count', type: 'int', default: 0 })
  commentCount: number;

  @Index()
  @Column({ name: 'view_count', type: 'int', default: 0 })
  viewCount: number;

  @Index()
  @Column({ name: 'like_count', type: 'int', default: 0 })
  likeCount: number;

  @OneToMany(() => PostTag, (postTag) => postTag.post)
  postTags: PostTag[];

  @OneToMany(() => PostLike, (postLike) => postLike.post)
  postLikes: PostLike[];

  @OneToMany(() => Comment, (comment) => comment.post)
  comments: Comment[];
}
