# AGENTS.md — Arena 구현 에이전트 지침

> 프로젝트: **Arena — AI 기반 유튜브 이슈 토론 게시판**  
> 목적: 사람 또는 AI 코딩 에이전트가 구현할 때 지켜야 할 프로젝트 규칙, 설계 결정, 작업 방식 정리  
> 기준 스택: React + Vite, NestJS, TypeScript, PostgreSQL, TypeORM, pgvector, JWT

---

## 1. 프로젝트 핵심 정의

Arena는 유튜브 영상을 중심으로 한 AI 기반 토론 게시판이다.

사용자는 유튜브 링크를 포함한 게시글을 작성하고, 다른 사용자는 댓글과 대댓글로 토론한다. 시스템은 유튜브 영상 메타데이터와 자막을 수집하고, 댓글이 사실 주장으로 분류되면 자막 기반 RAG 검색을 수행하여 관련 근거 후보를 보여준다. 댓글 스레드가 충분히 길어지면 사용자가 AI 요약을 요청할 수 있다.

이 프로젝트에서 AI는 사용자를 대신해 글을 쓰는 존재가 아니라, 토론 맥락 이해를 돕는 보조자다.

---

## 2. MVP 범위

### 반드시 구현할 기능

- 회원가입 / 로그인 / 내 정보 조회 / 회원탈퇴
- JWT 기반 인증
- 게시글 CRUD
- 게시글 목록 조회, 상세 조회, 검색, 페이지네이션
- 댓글 작성 / 수정 / 삭제
- 대댓글 작성
- 유튜브 URL 기반 게시글 작성
- 유튜브 영상 카드 표시
- 유튜브 메타데이터 수집 상태 관리
- 유튜브 자막 수집 상태 관리
- 자막 청킹 및 임베딩 저장
- 댓글 작성 후 AI 댓글 유형 분석
- 사실 주장 댓글에 대한 RAG 근거 후보 검색
- 댓글 스레드 AI 요약 생성 및 조회
- 관리자용 주의 필요 댓글 조회 및 삭제

### MVP에서 제외할 기능

- Redis + BullMQ 기반 작업 큐
- 실시간 알림
- WebSocket / SSE
- 소셜 로그인
- 관리자 대시보드 고도화
- 회원 정지 기능
- 자동 트렌딩 영상 수집
- 유튜브 인기 댓글 자동 수집 및 쟁점 요약
- AI의 참/거짓 자동 판정
- 자동 반박 댓글 생성
- 다국어 지원

---

## 3. 확정된 설계 결정

### 3-1. ID 정책

- 주요 리소스 ID는 UUID가 아니라 **ULID**를 사용한다.
- DB 타입은 `char(26)` 또는 `varchar(26)`을 사용한다.
- 서버에서 ID를 생성한다.
- 대상 리소스:
  - User
  - Post
  - Video
  - Comment
  - TranscriptChunk
  - Tag
  - CommentAnalysis
  - RagEvidence
  - AiSummary

### 3-2. 게시글 작성 정책

게시글 작성 API는 YouTube API를 기다리지 않는다.

```text
POST /api/v1/posts
→ Post 생성
→ Video 생성 또는 기존 Video 재사용
→ metadataStatus=PENDING
→ transcriptStatus=PENDING
→ embeddingStatus=PENDING
→ 201 Created 응답
→ 이후 서버 내부 비동기 작업으로 영상 처리 시도
```

외부 API 실패는 게시글 작성 실패로 처리하지 않는다.

### 3-3. 작업 큐 정책

- MVP에서는 Redis 기반 작업 큐를 사용하지 않는다.
- 서버 내부 비동기 작업과 DB 상태값으로 처리한다.
- 서버 재시작 시 작업 유실 가능성은 MVP 한계로 인정한다.
- 필요하면 PostgreSQL 기반 `jobs` 테이블을 도입한다.
- Redis/BullMQ는 스케일 아웃 또는 운영 고도화 단계로 남긴다.

### 3-4. 댓글 / 대댓글 정책

댓글과 대댓글 작성 API는 분리한다.

```http
POST /api/v1/posts/:postId/comments
POST /api/v1/comments/:commentId/replies
```

- 댓글은 게시글에 직접 달린다.
- 대댓글은 댓글에 달린다.
- 대댓글의 대댓글은 MVP에서 허용하지 않는다.
- 댓글 구조는 최대 2단계로 제한한다.

### 3-5. AI 댓글 분석 정책

- 댓글 작성 직후 AI 분석을 자동으로 시도한다.
- 댓글 작성 자체는 AI 분석 성공 여부와 분리한다.
- AI 분석 실패 시 댓글은 유지하고 `aiAnalysisStatus=FAILED`로 기록한다.
- 댓글 수정 시 기존 AI 분석 결과와 RAG 근거 후보는 최신 상태가 아니므로 재분석 대상으로 처리한다.
- 댓글 수정 후 즉시 다시 처리하는 대상은 Moderator / Agent 기능이다.
  - 댓글 유형 분류
  - moderationStatus 재판단
  - 사실 주장일 경우 RAG 검색
- 댓글 수정 후 댓글 스레드 요약은 자동 재생성하지 않는다.

### 3-6. AI 분석 재시도 정책

AI 분석 재시도는 관리자만 수행할 수 있다.

```http
POST /api/v1/admin/comments/:commentId/analysis/retry
```

허용 조건:

- 요청자는 관리자여야 한다.
- 대상 댓글의 `aiAnalysisStatus`가 `FAILED`여야 한다.

### 3-7. RAG 정책

- RAG 검색은 모든 댓글에 수행하지 않는다.
- AI가 `FACT_CLAIM`으로 분류한 댓글에 대해서만 수행한다.
- RAG 결과는 참/거짓 판정이 아니다.
- 사용자에게는 “근거 후보” 또는 “관련 있을 수 있는 자막 구간”으로 표현한다.
- 댓글 목록 응답에는 근거 상세 전체를 포함하지 않는다.
- 댓글 목록에는 AI 상태 요약만 포함한다.
  - commentType
  - aiAnalysisStatus
  - ragStatus
  - evidenceCount
  - moderationStatus
- 근거 후보 상세는 별도 API로 조회한다.

```http
GET /api/v1/comments/:commentId/evidences
```

### 3-8. 댓글 스레드 요약 정책

- 댓글 스레드 요약은 자동 생성하지 않는다.
- 로그인 사용자가 “AI 요약” 버튼을 눌렀을 때만 생성한다.
- 비회원은 이미 생성된 요약만 조회할 수 있다.
- 새 요약 생성은 로그인 사용자만 가능하다.
- 요약 생성 최소 조건은 루트 댓글 포함 전체 댓글 수 10개 이상이다.
- 댓글 수가 10개 미만이면 요약을 생성하지 않고 “요약할 댓글이 충분하지 않습니다”라고 안내한다.
- 요약 생성 이후 새 댓글이 추가되면 기존 요약은 유지하되 최신 상태가 아닐 수 있음을 표시한다.

### 3-9. 삭제 정책

- 게시글 삭제는 soft delete를 우선한다.
- 게시글이 삭제되면 연결된 댓글과 AI 결과는 사용자에게 노출하지 않는다.
- 댓글 삭제는 soft delete로 처리한다.
- 사용자가 댓글을 삭제한 경우 대댓글은 유지한다.
- 삭제된 댓글은 “삭제된 댓글입니다”로 표시한다.
- 관리자가 삭제한 댓글은 “관리자에 의해 삭제된 댓글입니다”로 표시한다.
- 회원 탈퇴 시 게시글과 댓글은 유지하고 작성자는 “탈퇴한 회원”으로 표시한다.

---

## 4. API 설계 규칙

### 4-1. Prefix

모든 API는 다음 prefix를 사용한다.

```http
/api/v1
```

### 4-2. REST 원칙

- URL은 리소스 중심으로 설계한다.
- 생성은 `POST`, 조회는 `GET`, 일부 수정은 `PATCH`, 삭제는 `DELETE`를 사용한다.
- 게시글/댓글 수정은 `PATCH`를 사용한다.
- AI 작업 생성처럼 처리 시간이 걸리는 요청은 `202 Accepted`를 고려한다.

### 4-3. 인증 / 권한 상태 코드

- 인증되지 않은 요청: `401 Unauthorized`
- 인증은 되었지만 권한이 없는 요청: `403 Forbidden`
- 존재하지 않거나 삭제되어 노출 불가한 리소스: `404 Not Found`
- 잘못된 입력: `400 Bad Request`
- 중복 리소스: `409 Conflict`

---

## 5. NestJS 구현 규칙

### 5-1. 기본 구조

- Controller는 요청/응답과 HTTP status에 집중한다.
- Service는 비즈니스 로직을 담당한다.
- Repository 또는 TypeORM Repository는 DB 접근을 담당한다.
- DTO는 요청 body와 query 검증에 사용한다.
- Entity는 DB 구조와 관계를 표현한다.
- Guard는 인증/권한 검증에 사용한다.

### 5-2. 모듈 분리

기본 모듈:

- AuthModule
- UsersModule
- PostsModule
- CommentsModule
- VideosModule
- TagsModule
- AiModule
- AdminModule
- CommonModule
- DatabaseModule
- McpModule

### 5-3. 순환 의존성 주의

- PostsModule이 CommentsModule 내부 구현을 직접 알지 않도록 한다.
- CommentsModule이 PostsService를 과도하게 호출하지 않도록 한다.
- AI 관련 로직은 CommentsService 안에 직접 넣지 않는다.
- 댓글 저장은 CommentsService가 담당하고, 댓글 분석 요청은 AiModule의 서비스에 위임한다.

---

## 6. TypeORM 구현 규칙

### 6-1. ID

모든 주요 Entity는 다음 형태의 ULID primary key를 가진다.

```ts
@PrimaryColumn({ type: 'char', length: 26 })
id: string;
```

`@BeforeInsert()`에서 id가 없으면 ULID를 생성한다.

### 6-2. 시간 컬럼

가능하면 공통 추상 클래스를 사용한다.

- id
- createdAt
- updatedAt
- deletedAt

단, `TranscriptChunk`처럼 삭제 개념이 필요 없는 데이터는 deletedAt을 생략할 수 있다.

### 6-3. soft delete

- 게시글, 댓글, 사용자에는 `deletedAt`을 둔다.
- TypeORM의 `@DeleteDateColumn()`을 사용한다.
- 조회 시 삭제된 데이터가 노출되지 않도록 service layer에서 명확히 처리한다.

### 6-4. 관계 로딩

- 목록 API에서 모든 relation을 한 번에 eager loading하지 않는다.
- 필요한 데이터만 join하거나 별도 조회한다.
- 댓글 목록에는 RAG 근거 상세 전체를 포함하지 않는다.

### 6-5. pgvector

- `TranscriptChunk.embedding`은 pgvector의 `vector` 타입을 사용한다.
- PostgreSQL에는 `CREATE EXTENSION IF NOT EXISTS vector;` migration이 필요하다.
- embedding dimension은 사용하는 embedding model에 맞춘다.
- 문서 예시에서는 1536을 사용하지만, 실제 모델이 바뀌면 반드시 조정한다.

---

## 7. 테스트 규칙

### 7-1. 테스트 우선순위

1. 인증 / 권한 테스트
2. 게시글 CRUD 테스트
3. 댓글 / 대댓글 테스트
4. soft delete 테스트
5. 영상 처리 상태 테스트
6. AI 분석 상태 테스트
7. RAG 근거 조회 테스트
8. 요약 최소 조건 테스트
9. 관리자 기능 테스트

### 7-2. 반드시 테스트할 정책

- 비회원은 게시글을 작성할 수 없다.
- 게시글 작성자는 자기 글만 수정/삭제할 수 있다.
- 다른 사용자의 게시글 수정은 403이다.
- 댓글 작성자는 자기 댓글만 수정/삭제할 수 있다.
- 대댓글의 대댓글은 허용하지 않는다.
- 게시글 작성 시 video 상태는 PENDING으로 반환된다.
- YouTube API 실패가 게시글 작성 실패로 이어지지 않는다.
- 댓글 작성 시 AI 분석 상태는 PENDING으로 시작한다.
- AI 분석 실패가 댓글 작성 실패로 이어지지 않는다.
- AI 분석 재시도는 관리자만 가능하다.
- AI 분석 재시도는 FAILED 상태에서만 가능하다.
- 댓글 스레드 요약은 댓글 수 10개 이상일 때만 가능하다.

---

## 8. 구현 시 금지할 것

- 비밀번호를 응답 body에 포함하지 않는다.
- AI 결과를 참/거짓 판정처럼 표현하지 않는다.
- 게시글 작성 API에서 YouTube API를 오래 기다리지 않는다.
- 댓글 작성 API에서 AI 분석을 await하여 댓글 작성 성공 여부와 묶지 않는다.
- 댓글 목록에 자막 청크 전체나 RAG 근거 상세를 모두 포함하지 않는다.
- TypeORM `synchronize: true`를 운영/공유 환경에서 사용하지 않는다.
- 대댓글의 대댓글을 MVP에서 허용하지 않는다.
- Redis/BullMQ를 MVP 필수 구현으로 추가하지 않는다.

---

## 9. 구현 순서 요약

1. 프로젝트 초기 설정
2. Config / Database 설정
3. 공통 BaseModel, ULID 유틸, enum 정의
4. User / Auth 구현
5. Post / Tag / Video 기본 구현
6. Comment / Reply 구현
7. soft delete 정책 구현
8. Video 상태값과 서버 내부 비동기 처리 구현
9. TranscriptChunk / pgvector migration 구현
10. AI 댓글 분석 상태 구현
11. RAG 근거 후보 구현
12. Summary 구현
13. Admin 기능 구현
14. E2E 테스트 정리
15. README / 실행 문서 정리

---

## 10. 사람이 직접 구현할 때 접근법

처음부터 AI 기능을 붙이지 않는다.

가장 좋은 접근은 다음 순서다.

```text
게시판 CRUD
→ 인증/권한
→ 댓글/대댓글
→ Video 상태값
→ 자막 저장
→ AI 분석 상태
→ RAG 근거 후보
→ 요약
→ 관리자 기능
```

AI 기능은 항상 기본 게시판 위에 얹는 방식으로 구현한다. 기본 게시판이 불안정한 상태에서 AI 기능을 붙이면 디버깅하기 어렵다.

---

## 11. 단계별 유의사항

- 요구사항 단계: 기능을 API나 테이블로 바로 바꾸지 않는다.
- 모델 설계 단계: “무엇을 저장해야 하는가”와 “관계가 무엇인가”를 먼저 본다.
- API 설계 단계: URL보다 실패 정책과 권한 정책을 먼저 본다.
- 구현 단계: Controller에 비즈니스 로직을 몰아넣지 않는다.
- 테스트 단계: 성공 케이스보다 권한 실패, 입력 실패, 외부 API 실패, AI 실패를 반드시 테스트한다.
