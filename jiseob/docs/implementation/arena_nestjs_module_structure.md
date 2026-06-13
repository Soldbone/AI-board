# Arena NestJS 모듈 구조 설계

> 목적: Arena MVP를 NestJS로 구현할 때 모듈을 어떻게 나눌지 정리한다.  
> 원칙: 도메인별 모듈을 분리하고, Controller는 얇게 유지하며, AI/외부 API 로직은 핵심 CRUD 로직과 분리한다.

---

## 1. 모듈 설계 원칙

NestJS에서는 기능 단위로 모듈을 나누고, 각 모듈은 controller, service, provider, entity 등을 묶는다. Arena에서는 다음 기준으로 나눈다.

```text
Auth: 인증
Users: 회원
Posts: 게시글
Comments: 댓글/대댓글
Videos: 유튜브 영상 및 처리 상태
Tags: 태그
Mcp: YouTube 외부 도구 인터페이스
Ai: 댓글 분석, RAG, 요약
Admin: 관리자 기능
Common: 공통 유틸, guard, decorator, enum
Database: TypeORM 연결, migration 관련 설정
```

---

## 2. 추천 디렉터리 구조

```text
src/
├── app.module.ts
├── main.ts
│
├── common/
│   ├── constants/
│   │   └── pagination.constant.ts
│   ├── decorators/
│   │   ├── current-user.decorator.ts
│   │   └── roles.decorator.ts
│   ├── entities/
│   │   └── base.entity.ts
│   ├── enums/
│   │   ├── user-role.enum.ts
│   │   ├── video-status.enum.ts
│   │   ├── comment-status.enum.ts
│   │   └── ai-status.enum.ts
│   ├── filters/
│   │   └── http-exception.filter.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   └── roles.guard.ts
│   ├── interceptors/
│   │   └── response.interceptor.ts
│   └── utils/
│       ├── ulid.util.ts
│       └── youtube-url.util.ts
│
├── config/
│   ├── config.module.ts
│   └── configuration.ts
│
├── database/
│   ├── database.module.ts
│   ├── typeorm.config.ts
│   └── migrations/
│       └── 0000000000000-create-pgvector-extension.ts
│
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── dto/
│   │   ├── signup.dto.ts
│   │   └── login.dto.ts
│   └── strategies/
│       └── jwt.strategy.ts
│
├── users/
│   ├── users.module.ts
│   ├── users.controller.ts
│   ├── users.service.ts
│   ├── entities/
│   │   └── user.entity.ts
│   └── dto/
│       └── update-user.dto.ts
│
├── posts/
│   ├── posts.module.ts
│   ├── posts.controller.ts
│   ├── posts.service.ts
│   ├── entities/
│   │   ├── post.entity.ts
│   │   ├── post-tag.entity.ts
│   │   └── post-like.entity.ts
│   └── dto/
│       ├── create-post.dto.ts
│       ├── update-post.dto.ts
│       └── find-posts-query.dto.ts
│
├── comments/
│   ├── comments.module.ts
│   ├── comments.controller.ts
│   ├── comments.service.ts
│   ├── entities/
│   │   └── comment.entity.ts
│   └── dto/
│       ├── create-comment.dto.ts
│       ├── create-reply.dto.ts
│       └── update-comment.dto.ts
│
├── videos/
│   ├── videos.module.ts
│   ├── videos.controller.ts
│   ├── videos.service.ts
│   ├── video-processing.service.ts
│   ├── transcript.service.ts
│   ├── embedding.service.ts
│   ├── entities/
│   │   ├── video.entity.ts
│   │   └── transcript-chunk.entity.ts
│   └── dto/
│       └── video-response.dto.ts
│
├── tags/
│   ├── tags.module.ts
│   ├── tags.controller.ts
│   ├── tags.service.ts
│   └── entities/
│       └── tag.entity.ts
│
├── mcp/
│   ├── mcp.module.ts
│   ├── youtube-tool.service.ts
│   └── dto/
│       └── youtube-metadata.dto.ts
│
├── ai/
│   ├── ai.module.ts
│   ├── comment-analysis/
│   │   ├── comment-analysis.service.ts
│   │   └── entities/
│   │       └── comment-analysis.entity.ts
│   ├── rag/
│   │   ├── rag.service.ts
│   │   └── entities/
│   │       └── rag-evidence.entity.ts
│   ├── summary/
│   │   ├── summary.controller.ts
│   │   ├── summary.service.ts
│   │   └── entities/
│   │       └── ai-summary.entity.ts
│   └── llm/
│       ├── llm.service.ts
│       └── prompts/
│           ├── comment-classifier.prompt.ts
│           └── thread-summary.prompt.ts
│
└── admin/
    ├── admin.module.ts
    ├── admin-comments.controller.ts
    └── admin-comments.service.ts
```

---

## 3. 모듈별 책임

## 3-1. CommonModule

### 책임

- 공통 decorator
- 공통 guard
- 공통 enum
- ULID 유틸
- YouTube URL parsing 유틸
- 공통 exception/filter/interceptor

### 주의사항

CommonModule에 비즈니스 로직을 넣지 않는다. Common은 어디서든 재사용 가능한 코드만 가진다.

---

## 3-2. ConfigModule

### 책임

- 환경 변수 로딩
- 환경 변수 validation
- DB 연결 정보 제공
- JWT secret 제공
- 외부 API key 제공

### 주요 환경 변수

```text
NODE_ENV
PORT
DATABASE_HOST
DATABASE_PORT
DATABASE_USERNAME
DATABASE_PASSWORD
DATABASE_NAME
JWT_SECRET
JWT_EXPIRES_IN
YOUTUBE_API_KEY
OPENAI_API_KEY
EMBEDDING_MODEL
EMBEDDING_DIMENSION
YOUTUBE_TRANSCRIPT_COMMAND
TRANSCRIPT_LANGUAGES
TRANSCRIPT_CHUNK_SIZE
TRANSCRIPT_CHUNK_OVERLAP
```

### 주의사항

API key를 코드에 직접 쓰지 않는다. `.env.example`에는 실제 값이 아니라 placeholder만 둔다.

---

## 3-3. DatabaseModule

### 책임

- TypeORM 설정
- PostgreSQL 연결
- Entity 등록
- Migration 관리
- pgvector extension migration 관리

### 주의사항

- TypeORM synchronize는 공유 환경에서 끈다.
- pgvector를 쓰려면 `CREATE EXTENSION IF NOT EXISTS vector;` migration이 필요하다.
- Entity 변경 후 migration 생성 절차를 문서화한다.

---

## 3-4. AuthModule

### 책임

- 회원가입
- 로그인
- JWT 발급
- JWT 검증 전략

### 의존성

- UsersModule
- JwtModule

### Controller

```http
POST /api/v1/auth/signup
POST /api/v1/auth/login
```

### 주의사항

AuthModule이 User Entity를 직접 과도하게 다루기보다 UsersService를 통해 회원을 조회/생성한다.

---

## 3-5. UsersModule

### 책임

- 회원 정보 조회
- 회원탈퇴 soft delete
- 관리자/일반 사용자 role 관리의 기반 제공

### Controller

```http
GET    /api/v1/users/me
DELETE /api/v1/users/me
```

### 주의사항

회원탈퇴 시 작성 글과 댓글은 유지한다. 조회 시 작성자 표시만 “탈퇴한 회원”으로 처리한다.

---

## 3-6. PostsModule

### 책임

- 게시글 작성
- 게시글 목록 조회
- 게시글 상세 조회
- 게시글 수정
- 게시글 삭제
- 게시글과 Tag 연결
- 게시글과 Video 연결
- 게시글 내부 카운터 관리
  - commentCount
  - viewCount
  - likeCount
- 게시글 좋아요 / 좋아요 취소

### 의존성

- VideosModule
- TagsModule
- UsersModule

### Controller

```http
GET    /api/v1/posts
POST   /api/v1/posts
GET    /api/v1/posts/:postId
PATCH  /api/v1/posts/:postId
DELETE /api/v1/posts/:postId
POST   /api/v1/posts/:postId/views
POST   /api/v1/posts/:postId/like
DELETE /api/v1/posts/:postId/like
```

### 게시글 작성 흐름

```text
1. 인증 사용자 확인
2. DTO validation
3. youtubeUrl에서 youtubeVideoId 추출
4. Video 조회 또는 생성
5. Post 생성
6. Tag 생성 또는 재사용
7. PostTag 연결
8. VideoProcessingService에 영상 처리 요청
9. 201 Created 응답
```

### 주의사항

PostsService 안에서 YouTube API를 직접 호출하지 않는다. 영상 처리는 VideosModule 또는 McpModule로 분리한다.

게시글 카운터는 원본 데이터와 함께 다룬다. 좋아요는 `post_likes`를 원본으로 두고, `posts.like_count`는 같은 transaction 안에서 증감한다. 댓글 수는 CommentsModule에서 댓글 생성/삭제 transaction 안에 `posts.comment_count`를 증감한다.

---

## 3-7. VideosModule

### 책임

- Video 조회
- Video 생성 또는 재사용
- 영상 메타데이터 상태 관리
- 자막 수집 상태 관리
- 임베딩 상태 관리
- TranscriptChunk 저장
- 영상 처리 provider adapter 조립
- 영상 처리 retry API 제공

### 의존성

- McpModule
- AiModule 또는 LlmService 일부

### Controller

```http
GET  /api/v1/videos/:videoId
POST /api/v1/videos/:videoId/processing/retry
```

### 주의사항

MVP에서는 Redis queue를 쓰지 않으므로, video 처리 작업은 DB 상태값을 먼저 PENDING으로 만들고 서버 내부 비동기 함수로 처리한다. 실패하면 FAILED 상태로 남긴다.

Phase 6 MVP에서는 메타데이터 provider로 YouTube Data API v3를 사용하고, transcript provider로 `youtube-transcript-api` CLI adapter를 사용한다. backend Docker 이미지에는 Python과 `youtube-transcript-api` CLI를 설치해 런타임 환경 차이를 줄인다.

provider 오류는 그대로 사용자에게 전달하지 않는다. 서버 로그에는 raw error를 남길 수 있지만, DB와 API 응답에는 정제된 errorCode/errorMessage만 저장하고 노출한다.

---

## 3-8. McpModule

### 책임

- 외부 도구 인터페이스 제공
- YouTube API 호출
- YouTube URL parsing 보조
- 영상 메타데이터 구조화
- 자막 수집 도구 제공 가능

### 주요 Service

```text
YoutubeMetadataProvider
- fetchMetadata(youtubeVideoId)

YoutubeTranscriptProvider
- fetchTranscript(youtubeVideoId, languages)

EmbeddingProvider
- embedTexts(texts)
```

### 주의사항

McpModule은 외부 API 세부 구현을 감싸는 계층이다. PostsService나 VideosService가 YouTube API client의 세부사항을 직접 알지 않도록 한다.

비공식 transcript provider는 반드시 adapter 뒤에 둔다. `youtube-transcript-api`가 차단되거나 깨지면 `yt-dlp`, hosted transcript API, STT provider로 교체할 수 있어야 한다.

---

## 3-9. CommentsModule

### 책임

- 댓글 조회
- 최상위 댓글 작성
- 대댓글 작성
- 댓글 수정
- 댓글 삭제
- 댓글 soft delete
- 게시글 commentCount 증감 요청

### 의존성

- PostsModule 또는 PostRepository
- AiModule
- UsersModule

### Controller

```http
GET    /api/v1/posts/:postId/comments
POST   /api/v1/posts/:postId/comments
POST   /api/v1/comments/:commentId/replies
PATCH  /api/v1/comments/:commentId
DELETE /api/v1/comments/:commentId
```

### 댓글 작성 흐름

```text
1. postId 확인
2. 댓글 생성
3. 게시글 commentCount 증가
4. CommentAnalysis PENDING 생성 요청
5. AI 분석 비동기 시도
6. 201 Created 응답
```

### 대댓글 작성 흐름

```text
1. parent comment 확인
2. parent comment가 최상위 댓글인지 확인
3. parent comment가 삭제되지 않았는지 확인
4. parent의 postId를 따라 대댓글 생성
5. 게시글 commentCount 증가
6. AI 분석 비동기 시도
7. 201 Created 응답
```

### 주의사항

대댓글 작성 API에서 postId를 body로 받지 않는다. parent comment의 postId를 사용한다. 이렇게 해야 잘못된 postId와 parentCommentId 조합을 막을 수 있다.

---

## 3-10. AiModule

### 책임

- 댓글 유형 분석
- moderationStatus 판단
- RAG 검색
- 댓글 스레드 요약
- LLM API 호출 래핑

### 하위 구조

```text
ai/
├── comment-analysis/
├── rag/
├── summary/
└── llm/
```

### Controller

요약 조회/생성은 AiModule 또는 SummaryController에서 담당한다.

```http
POST /api/v1/comments/:rootCommentId/summary
GET  /api/v1/comments/:rootCommentId/summary
GET  /api/v1/comments/:commentId/analysis
GET  /api/v1/comments/:commentId/evidences
```

### 주의사항

AiModule이 CommentsModule의 내부 로직을 과도하게 알면 순환 의존성이 생긴다. 필요한 경우 ID 기반으로 repository를 사용하거나, service 간 의존 방향을 명확히 정한다.

---

## 3-11. TagsModule

### 책임

- 태그 조회
- 게시글 작성 시 태그 생성 또는 재사용

### Controller

```http
GET /api/v1/tags
```

### 주의사항

MVP에서는 별도 태그 생성 API 없이 게시글 작성 시 태그를 자동 생성/재사용해도 충분하다.

---

## 3-12. AdminModule

### 책임

- 주의 필요 댓글 목록 조회
- 관리자 댓글 삭제
- AI 분석 실패 댓글 재시도

### Controller

```http
GET    /api/v1/admin/comments?moderationStatus=NEEDS_REVIEW
DELETE /api/v1/admin/comments/:commentId
POST   /api/v1/admin/comments/:commentId/analysis/retry
```

### 주의사항

관리자 기능을 MVP에서 너무 크게 만들지 않는다. 회원 정지, 전체 게시글 관리, 대시보드 고도화는 확장 기능으로 둔다.

---

## 4. AppModule 연결 예시

```ts
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    CommonModule,
    AuthModule,
    UsersModule,
    PostsModule,
    CommentsModule,
    VideosModule,
    TagsModule,
    McpModule,
    AiModule,
    AdminModule,
  ],
})
export class AppModule {}
```

실제 구현에서는 CommonModule을 전역 모듈로 만들지 여부를 신중히 결정한다. 초보 단계에서는 명시적으로 import하는 방식이 의존성을 이해하기 좋다.

---

## 5. 의존성 방향 추천

```text
AuthModule → UsersModule
PostsModule → VideosModule, TagsModule
VideosModule → McpModule
CommentsModule → AiModule
AiModule → VideosModule 또는 TranscriptChunk Repository
AdminModule → CommentsModule, AiModule
```

주의할 점은 `PostsModule ↔ VideosModule`, `CommentsModule ↔ AiModule` 같은 양방향 의존이 생기기 쉽다는 것이다.

가능하면 다음 방식으로 줄인다.

```text
Controller → Service → Repository
다른 도메인 작업은 공개된 Service 메서드만 호출
AI/외부 API는 별도 Module로 위임
```

---

## 6. 사람이 직접 설계했다면 접근법

모듈 구조를 짤 때는 “테이블 하나당 모듈 하나”로 생각하면 안 된다. 더 좋은 기준은 “기능 책임”이다.

예를 들어 `TranscriptChunk`는 Entity지만 별도 TranscriptChunkModule까지 만들 필요는 없다. 영상 처리의 하위 개념이므로 VideosModule 안에 두는 것이 자연스럽다.

반대로 AI 분석, RAG, 요약은 모두 AI 관련이지만 책임이 크기 때문에 AiModule 내부 하위 디렉터리로 분리하는 것이 좋다.

---

## 7. 단계별 유의사항

### 모듈 설계 시

- 너무 많은 모듈을 만들지 않는다.
- Controller가 없는 내부 모듈도 가능하다.
- 외부 API 호출은 도메인 service 안에 직접 넣지 않는다.

### Service 설계 시

- PostsService는 게시글을 책임진다.
- CommentsService는 댓글을 책임진다.
- AiService는 AI 판단과 결과 저장을 책임진다.
- 하나의 Service가 너무 많은 도메인을 직접 수정하면 분리한다.

### DTO 설계 시

- Request DTO와 Response DTO를 구분한다.
- Entity를 그대로 응답으로 내보내지 않는다.
- passwordHash 같은 민감 정보가 response에 섞이지 않게 한다.

### 테스트 설계 시

- Module 단위 unit test보다 우선 e2e 흐름을 잡는다.
- 인증/권한/삭제 정책은 반드시 e2e로 확인한다.
- AI/YouTube API는 mock한다.
