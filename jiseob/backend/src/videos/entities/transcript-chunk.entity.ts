import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../common/entities/base.entity';
import { Video } from './video.entity';

@Entity('transcript_chunks')
@Index(['videoId', 'chunkIndex'], { unique: true })
export class TranscriptChunk extends BaseModel {
  @Index()
  @Column({ name: 'video_id', type: 'char', length: 26 })
  videoId: string;

  @ManyToOne(() => Video, (video) => video.transcriptChunks, { nullable: false })
  @JoinColumn({ name: 'video_id' })
  video: Video;

  @Column({ name: 'chunk_index', type: 'int' })
  chunkIndex: number;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'start_time', type: 'float', nullable: true })
  startTime?: number | null;

  @Column({ name: 'end_time', type: 'float', nullable: true })
  endTime?: number | null;

  @Column('vector', { length: 1536, nullable: true })
  embedding?: number[] | null;
}
