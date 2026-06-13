import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseModel } from '../../common/entities/base.entity';
import {
  EmbeddingStatus,
  MetadataStatus,
  TranscriptStatus,
} from '../../common/enums/video-status.enum';
import { Post } from '../../posts/entities/post.entity';

@Entity('videos')
export class Video extends BaseModel {
  @Index({ unique: true })
  @Column({ name: 'youtube_video_id', type: 'varchar', length: 32 })
  youtubeVideoId: string;

  @Column({ name: 'youtube_url', type: 'text' })
  youtubeUrl: string;

  @Column({ type: 'text', nullable: true })
  title?: string | null;

  @Column({ name: 'channel_name', type: 'varchar', length: 255, nullable: true })
  channelName?: string | null;

  @Column({ name: 'thumbnail_url', type: 'text', nullable: true })
  thumbnailUrl?: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'youtube_view_count', type: 'int', nullable: true })
  youtubeViewCount?: number | null;

  @Column({ name: 'youtube_like_count', type: 'int', nullable: true })
  youtubeLikeCount?: number | null;

  @Column({ name: 'youtube_comment_count', type: 'int', nullable: true })
  youtubeCommentCount?: number | null;

  @Column({ name: 'metadata_status', type: 'varchar', length: 20, default: MetadataStatus.PENDING })
  metadataStatus: MetadataStatus;

  @Column({
    name: 'transcript_status',
    type: 'varchar',
    length: 20,
    default: TranscriptStatus.PENDING,
  })
  transcriptStatus: TranscriptStatus;

  @Column({
    name: 'embedding_status',
    type: 'varchar',
    length: 20,
    default: EmbeddingStatus.PENDING,
  })
  embeddingStatus: EmbeddingStatus;

  @OneToMany(() => Post, (post) => post.video)
  posts: Post[];
}
