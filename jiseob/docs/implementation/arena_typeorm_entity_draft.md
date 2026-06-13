# Arena TypeORM Entity 초안

> 목적: Arena MVP 구현을 위한 TypeORM Entity 초안을 제공한다.  
> 주의: 이 문서는 “구현 출발점”이다. 실제 프로젝트의 TypeORM 버전, tsconfig, lint 설정, pgvector 설정에 따라 일부 타입/옵션은 조정해야 한다.

---

## 0. 전제

- 모든 주요 ID는 ULID를 사용한다.
- DB에는 `char(26)`으로 저장한다.
- 게시글, 댓글, 사용자 삭제는 soft delete를 사용한다.
- pgvector를 사용하기 위해 PostgreSQL에 `vector` extension을 활성화해야 한다.
- embedding dimension은 사용하는 embedding model에 맞춘다. 예시에서는 1536을 사용한다.

---

## 1. 패키지 후보

```bash
npm install ulid
npm install @nestjs/typeorm typeorm pg
```

pgvector를 쓰려면 PostgreSQL 쪽에 extension이 필요하다.

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## 2. 공통 ULID Base Entity

```ts
// src/common/entities/base.entity.ts
import {
  BeforeInsert,
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ulid } from 'ulid';

export abstract class BaseModel {
  @PrimaryColumn({ type: 'char', length: 26 })
  id: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = ulid();
    }
  }
}
```

`TranscriptChunk`처럼 soft delete가 필요 없는 Entity에도 BaseModel을 사용할 수는 있다. 다만 deletedAt이 불필요하다면 별도 `BaseTimeModel`을 두어도 된다.

---

## 3. Enum 초안

```ts
// src/common/enums/user-role.enum.ts
export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
}
```

```ts
// src/common/enums/video-status.enum.ts
export enum MetadataStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum TranscriptStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  NOT_AVAILABLE = 'NOT_AVAILABLE',
}

export enum EmbeddingStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}
```

```ts
// src/common/enums/comment-status.enum.ts
export enum ModerationStatus {
  NORMAL = 'NORMAL',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
  DELETED_BY_USER = 'DELETED_BY_USER',
  DELETED_BY_ADMIN = 'DELETED_BY_ADMIN',
}
```

```ts
// src/common/enums/ai-status.enum.ts
export enum CommentType {
  FACT_CLAIM = 'FACT_CLAIM',
  OPINION = 'OPINION',
  QUESTION = 'QUESTION',
  TOXIC = 'TOXIC',
  CHITCHAT = 'CHITCHAT',
}

export enum AiAnalysisStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum RagStatus {
  NOT_REQUIRED = 'NOT_REQUIRED',
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  NO_RESULT = 'NO_RESULT',
}

export enum SummaryStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum SummaryTargetType {
  COMMENT_THREAD = 'COMMENT_THREAD',
  POST = 'POST',
}
```

---

## 4. User Entity

```ts
// src/users/entities/user.entity.ts
import { Column, Entity, OneToMany } from 'typeorm';
import { BaseModel } from '../../common/entities/base.entity';
import { UserRole } from '../../common/enums/user-role.enum';
import { Post } from '../../posts/entities/post.entity';
import { Comment } from '../../comments/entities/comment.entity';
import { AiSummary } from '../../ai/summary/entities/ai-summary.entity';

@Entity('users')
export class User extends BaseModel {
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 50 })
  nickname: string;

  @Column({ type: 'varchar', length: 20, default: UserRole.USER })
  role: UserRole;

  @OneToMany(() => Post, (post) => post.author)
  posts: Post[];

  @OneToMany(() => Comment, (comment) => comment.author)
  comments: Comment[];

  @OneToMany(() => AiSummary, (summary) => summary.createdBy)
  summaries: AiSummary[];
}
```

---

## 5. Video Entity

```ts
// src/videos/entities/video.entity.ts
import { Column, Entity, OneToMany } from 'typeorm';
import { BaseModel } from '../../common/entities/base.entity';
import {
  EmbeddingStatus,
  MetadataStatus,
  TranscriptStatus,
} from '../../common/enums/video-status.enum';
import { Post } from '../../posts/entities/post.entity';
import { TranscriptChunk } from './transcript-chunk.entity';

@Entity('videos')
export class Video extends BaseModel {
  @Column({ name: 'youtube_video_id', type: 'varchar', length: 32, unique: true })
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

  @OneToMany(() => TranscriptChunk, (chunk) => chunk.video)
  transcriptChunks: TranscriptChunk[];
}
```

---

## 6. Post Entity

```ts
// src/posts/entities/post.entity.ts
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Video } from '../../videos/entities/video.entity';
import { Comment } from '../../comments/entities/comment.entity';
import { PostLike } from './post-like.entity';
import { PostTag } from './post-tag.entity';

@Entity('posts')
export class Post extends BaseModel {
  @Column({ name: 'author_id', type: 'char', length: 26 })
  authorId: string;

  @ManyToOne(() => User, (user) => user.posts, { nullable: false })
  @JoinColumn({ name: 'author_id' })
  author: User;

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

  @Column({ name: 'comment_count', type: 'int', default: 0 })
  commentCount: number;

  @Column({ name: 'view_count', type: 'int', default: 0 })
  viewCount: number;

  @Column({ name: 'like_count', type: 'int', default: 0 })
  likeCount: number;

  @OneToMany(() => Comment, (comment) => comment.post)
  comments: Comment[];

  @OneToMany(() => PostTag, (postTag) => postTag.post)
  postTags: PostTag[];

  @OneToMany(() => PostLike, (postLike) => postLike.post)
  postLikes: PostLike[];
}
```

---

## 7. Tag / PostTag / PostLike Entity

```ts
// src/tags/entities/tag.entity.ts
import { Column, Entity, OneToMany } from 'typeorm';
import { BaseModel } from '../../common/entities/base.entity';
import { PostTag } from '../../posts/entities/post-tag.entity';

@Entity('tags')
export class Tag extends BaseModel {
  @Column({ type: 'varchar', length: 50, unique: true })
  name: string;

  @OneToMany(() => PostTag, (postTag) => postTag.tag)
  postTags: PostTag[];
}
```

```ts
// src/posts/entities/post-like.entity.ts
import { CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Post } from './post.entity';

@Entity('post_likes')
export class PostLike {
  @PrimaryColumn({ name: 'post_id', type: 'char', length: 26 })
  postId: string;

  @PrimaryColumn({ name: 'user_id', type: 'char', length: 26 })
  userId: string;

  @ManyToOne(() => Post, (post) => post.postLikes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
```

`posts.like_count`는 화면 조회 성능을 위한 파생 값이고, 실제 좋아요 여부와 중복 방지의 원본은 `post_likes`다.

```ts
// src/posts/entities/post-tag.entity.ts
import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Post } from './post.entity';
import { Tag } from '../../tags/entities/tag.entity';

@Entity('post_tags')
export class PostTag {
  @PrimaryColumn({ name: 'post_id', type: 'char', length: 26 })
  postId: string;

  @PrimaryColumn({ name: 'tag_id', type: 'char', length: 26 })
  tagId: string;

  @ManyToOne(() => Post, (post) => post.postTags, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @ManyToOne(() => Tag, (tag) => tag.postTags, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tag_id' })
  tag: Tag;
}
```

---

## 8. Comment Entity

```ts
// src/comments/entities/comment.entity.ts
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import { BaseModel } from '../../common/entities/base.entity';
import { ModerationStatus } from '../../common/enums/comment-status.enum';
import { User } from '../../users/entities/user.entity';
import { Post } from '../../posts/entities/post.entity';
import { CommentAnalysis } from '../../ai/comment-analysis/entities/comment-analysis.entity';
import { RagEvidence } from '../../ai/rag/entities/rag-evidence.entity';
import { AiSummary } from '../../ai/summary/entities/ai-summary.entity';

@Entity('comments')
export class Comment extends BaseModel {
  @Column({ name: 'post_id', type: 'char', length: 26 })
  postId: string;

  @ManyToOne(() => Post, (post) => post.comments, { nullable: false })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @Column({ name: 'author_id', type: 'char', length: 26 })
  authorId: string;

  @ManyToOne(() => User, (user) => user.comments, { nullable: false })
  @JoinColumn({ name: 'author_id' })
  author: User;

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
  analysis?: CommentAnalysis;

  @OneToMany(() => RagEvidence, (evidence) => evidence.comment)
  evidences: RagEvidence[];

  @OneToMany(() => AiSummary, (summary) => summary.rootComment)
  summaries: AiSummary[];
}
```

### 대댓글 깊이 제한

Entity만으로 “대댓글의 대댓글 금지”를 완전히 표현하기는 어렵다. Service에서 다음 검증을 한다.

```ts
if (parentComment.parentCommentId) {
  throw new BadRequestException('대댓글에는 답글을 작성할 수 없습니다.');
}
```

---

## 9. TranscriptChunk Entity

```ts
// src/videos/entities/transcript-chunk.entity.ts
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../../common/entities/base.entity';
import { Video } from './video.entity';
import { RagEvidence } from '../../ai/rag/entities/rag-evidence.entity';

@Entity('transcript_chunks')
export class TranscriptChunk extends BaseModel {
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

  @OneToMany(() => RagEvidence, (evidence) => evidence.transcriptChunk)
  evidences: RagEvidence[];
}
```

주의:

- TypeORM의 vector column 지원은 사용하는 버전에 따라 설정이 필요할 수 있다.
- PostgreSQL에는 pgvector extension이 설치되어 있어야 한다.
- embedding dimension은 실제 embedding model에 맞춘다.

---

## 10. CommentAnalysis Entity

```ts
// src/ai/comment-analysis/entities/comment-analysis.entity.ts
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { BaseModel } from '../../../common/entities/base.entity';
import { AiAnalysisStatus, CommentType, RagStatus } from '../../../common/enums/ai-status.enum';
import { Comment } from '../../../comments/entities/comment.entity';

@Entity('comment_analyses')
export class CommentAnalysis extends BaseModel {
  @Column({ name: 'comment_id', type: 'char', length: 26, unique: true })
  commentId: string;

  @OneToOne(() => Comment, (comment) => comment.analysis, { nullable: false })
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

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null;
}
```

`ragStatus`와 `evidenceCount`를 CommentAnalysis에 둔 이유는 댓글 목록에서 RAG 상세를 모두 가져오지 않고도 “근거 후보가 있는지” 표시하기 위해서다.

---

## 11. RagEvidence Entity

```ts
// src/ai/rag/entities/rag-evidence.entity.ts
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../../common/entities/base.entity';
import { Comment } from '../../../comments/entities/comment.entity';
import { TranscriptChunk } from '../../../videos/entities/transcript-chunk.entity';

@Entity('rag_evidences')
export class RagEvidence extends BaseModel {
  @Column({ name: 'comment_id', type: 'char', length: 26 })
  commentId: string;

  @ManyToOne(() => Comment, (comment) => comment.evidences, { nullable: false })
  @JoinColumn({ name: 'comment_id' })
  comment: Comment;

  @Column({ name: 'transcript_chunk_id', type: 'char', length: 26 })
  transcriptChunkId: string;

  @ManyToOne(() => TranscriptChunk, (chunk) => chunk.evidences, { nullable: false })
  @JoinColumn({ name: 'transcript_chunk_id' })
  transcriptChunk: TranscriptChunk;

  @Column({ name: 'evidence_text', type: 'text' })
  evidenceText: string;

  @Column({ name: 'similarity_score', type: 'float', nullable: true })
  similarityScore?: number | null;
}
```

---

## 12. AiSummary Entity

```ts
// src/ai/summary/entities/ai-summary.entity.ts
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../../common/entities/base.entity';
import { SummaryStatus, SummaryTargetType } from '../../../common/enums/ai-status.enum';
import { User } from '../../../users/entities/user.entity';
import { Post } from '../../../posts/entities/post.entity';
import { Comment } from '../../../comments/entities/comment.entity';

@Entity('ai_summaries')
export class AiSummary extends BaseModel {
  @Column({ name: 'target_type', type: 'varchar', length: 30 })
  targetType: SummaryTargetType;

  @Column({ name: 'post_id', type: 'char', length: 26 })
  postId: string;

  @ManyToOne(() => Post, { nullable: false })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @Column({ name: 'root_comment_id', type: 'char', length: 26, nullable: true })
  rootCommentId?: string | null;

  @ManyToOne(() => Comment, (comment) => comment.summaries, { nullable: true })
  @JoinColumn({ name: 'root_comment_id' })
  rootComment?: Comment | null;

  @Column({ name: 'created_by_id', type: 'char', length: 26, nullable: true })
  createdById?: string | null;

  @ManyToOne(() => User, (user) => user.summaries, { nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy?: User | null;

  @Column({ name: 'summary_text', type: 'text', nullable: true })
  summaryText?: string | null;

  @Column({ name: 'summary_status', type: 'varchar', length: 20, default: SummaryStatus.PENDING })
  summaryStatus: SummaryStatus;

  @Column({ name: 'summarized_comment_count', type: 'int', default: 0 })
  summarizedCommentCount: number;

  @Column({ name: 'last_comment_id', type: 'char', length: 26, nullable: true })
  lastCommentId?: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null;
}
```

### isStale 계산

`isStale`은 DB 컬럼으로 저장하기보다 조회 시 계산해도 된다.

예시:

```text
현재 댓글 수 > summarizedCommentCount이면 isStale=true
또는 현재 마지막 댓글 id != lastCommentId이면 isStale=true
```

---

## 13. pgvector migration 예시

```ts
// src/database/migrations/0000000000000-create-pgvector-extension.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePgvectorExtension0000000000000 implements MigrationInterface {
  name = 'CreatePgvectorExtension0000000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 보통 extension drop은 신중히 처리한다.
    // await queryRunner.query(`DROP EXTENSION IF EXISTS vector`);
  }
}
```

---

## 14. 인덱스 후보

처음부터 모든 인덱스를 만들 필요는 없지만, 아래는 MVP에서 고려할 만하다.

```ts
@Index(['createdAt'])
@Index(['authorId'])
@Index(['videoId'])
```

추천 인덱스:

- users.email unique
- videos.youtubeVideoId unique
- posts.createdAt
- posts.authorId
- posts.videoId
- posts.comment_count
- posts.view_count
- posts.like_count
- post_likes.postId + userId primary key
- post_likes.userId
- comments.postId
- comments.parentCommentId
- comments.authorId
- transcript_chunks.videoId
- transcript_chunks.videoId + chunkIndex unique
- post_tags.postId + tagId primary key
- comment_analyses.commentId unique
- rag_evidences.commentId
- rag_evidences.transcriptChunkId
- ai_summaries.rootCommentId

pgvector 검색 인덱스는 데이터가 충분히 쌓인 뒤 HNSW 또는 IVFFlat을 고려한다. MVP에서는 exact search로 시작해도 된다.

---

## 15. 사람이 직접 설계했다면 접근법

처음부터 Entity 코드를 쓰지 말고 다음 순서로 접근하는 것이 좋다.

```text
1. 저장해야 하는 데이터 후보를 나열한다.
2. 각 데이터가 누구에게 소속되는지 정한다.
3. 1:N, N:M, 1:1 관계를 정한다.
4. 삭제 정책을 먼저 정한다.
5. 상태값이 필요한 데이터를 찾는다.
6. Entity 필드를 작성한다.
7. 실제 TypeORM decorator를 붙인다.
```

지금 프로젝트에서는 “AI 실패가 기본 기능을 막지 않는다”는 정책 때문에 상태값이 중요하다. Entity 설계에서도 status column을 빠뜨리면 나중에 API가 애매해진다.

---

## 16. 단계별 유의사항

### User

- email은 unique여야 한다.
- passwordHash는 응답에 노출하지 않는다.
- deletedAt이 있으면 로그인 시 탈퇴 회원을 막아야 한다.

### Post

- youtubeUrl 변경은 MVP에서 막는 것이 좋다.
- 목록 조회에서는 content preview만 내려준다.
- 삭제된 게시글은 목록/상세에서 제외한다.
- `commentCount`, `viewCount`, `likeCount`는 Arena 내부 게시글 카운터다.
- 카운터는 원본 데이터 변경과 같은 transaction 안에서 증감한다.
- 댓글 수는 삭제되지 않은 댓글과 대댓글 수를 의미한다.
- 좋아요 수는 `post_likes`를 원본으로 한다.

### Video

- youtubeVideoId는 unique여야 한다.
- Post마다 Video를 중복 생성하지 않는다.
- status가 PENDING/FAILED인 경우에도 게시글은 조회 가능해야 한다.
- `youtubeViewCount`, `youtubeLikeCount`, `youtubeCommentCount`는 YouTube 외부 통계다.
- Post 내부 `viewCount`, `likeCount`, `commentCount`와 이름과 의미를 섞지 않는다.

### Comment

- parentCommentId로 자기 참조 관계를 만든다.
- 대댓글의 대댓글 제한은 service에서 검증한다.
- soft delete 시 content 노출을 막는다.

### CommentAnalysis

- 댓글 하나에 최신 분석 결과 하나만 둔다.
- 분석 이력을 남기는 것은 MVP 이후 확장으로 둔다.
- 댓글 수정 시 재분석 대상으로 바꾼다.

### RagEvidence

- RAG는 FACT_CLAIM 댓글에만 수행한다.
- 근거 후보는 여러 개일 수 있다.
- 근거 후보를 참/거짓 판정으로 표현하지 않는다.

### AiSummary

- 요약 최소 조건은 루트 댓글 포함 10개 이상이다.
- 기존 요약이 최신 댓글을 반영하지 않을 수 있음을 표시해야 한다.
- 새 요약 생성 권한은 로그인 사용자에게만 있다.
