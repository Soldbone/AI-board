import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Comment } from '../../../comments/entities/comment.entity';
import { BaseModel } from '../../../common/entities/base.entity';
import { TranscriptChunk } from '../../../videos/entities/transcript-chunk.entity';

@Entity('rag_evidences')
@Index(['commentId', 'similarityScore'])
export class RagEvidence extends BaseModel {
  @Index()
  @Column({ name: 'comment_id', type: 'char', length: 26 })
  commentId: string;

  @ManyToOne(() => Comment, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comment_id' })
  comment: Comment;

  @Index()
  @Column({ name: 'transcript_chunk_id', type: 'char', length: 26 })
  transcriptChunkId: string;

  @ManyToOne(() => TranscriptChunk, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transcript_chunk_id' })
  transcriptChunk: TranscriptChunk;

  @Column({ name: 'evidence_text', type: 'text' })
  evidenceText: string;

  @Column({ name: 'similarity_score', type: 'float' })
  similarityScore: number;
}
