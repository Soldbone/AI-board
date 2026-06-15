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
- RAG 검색은 댓글 분석 성공 직후 서버 내부 비동기 작업으로 자동 시도한다.
- 사용자의 “근거 후보 보기” 동작은 이미 생성된 근거 후보 조회만 담당하고, MVP에서는 새 RAG 작업을 트리거하지 않는다.
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

검색 기준:

- 기본 검색은 pgvector cosine distance 기반 similarity search를 사용한다.
- `similarity = 1 - cosineDistance`로 계산한다.
- 기본 `topK`는 3개다.
- 기본 similarity threshold는 0.70이다.
- threshold 미만 결과는 사용자에게 노출하지 않는다.
- similarity score는 근거 후보에 저장한다.
- 운영 런타임에서는 mock evidence를 사용자에게 반환하지 않는다.
- mock provider는 자동 테스트 또는 명시적인 로컬 검증용으로만 사용한다.

상태 정책:

- 사실 주장으로 분류되면 `ragStatus=PENDING`으로 시작한다.
- 영상 embedding이 아직 처리 중이면 `PENDING`을 유지한다.
- 근거 후보가 저장되면 `SUCCESS`로 처리한다.
- threshold 이상 결과가 없으면 `NO_RESULT`로 처리한다.
- 자막 없음, embedding 실패, provider 실패처럼 처리 불가 상태가 확정되면 `FAILED`로 처리한다.
- RAG 실패 사유는 AI 댓글 분석 실패 사유와 분리해서 저장한다.

### 3-8. MCP Agent Tool 정책

MCP는 일반 사용자 공개 REST API가 아니라 AI Agent가 호출할 tool boundary다.

```http
POST /api/v1/mcp
```

- Phase 9에서는 HTTP JSON-RPC 2.0 endpoint 하나로 `tools/list`, `tools/call`을 처리한다.
- MCP endpoint는 `Authorization: Bearer` access token을 요구한다.
- Access token은 cookie가 아니라 Authorization header에서만 읽으므로 MCP endpoint에는 CSRF guard를 적용하지 않는다.
- 일반 사용자 화면의 state-changing REST API는 기존처럼 `JwtAuthGuard + CsrfGuard`를 유지한다.
- tool은 allowlist 방식으로만 노출한다.
- tool argument로 API key, access token, cookie 값을 받지 않는다.
- tool response에는 raw API key, access token, cookie, provider raw error, stack trace를 포함하지 않는다.
- `youtube.fetchMetadata`는 실제 YouTube Data API provider를 호출하지만 DB를 수정하지 않는다.
- `transcript.searchChunks`는 pgvector similarity search를 사용하고 기본 `limit=5`, 최대 `limit=10`, similarity threshold `0.70`을 적용한다.
- `video.retryProcessing`은 write 성격의 tool이므로 게시글 작성자 또는 관리자만 호출할 수 있다.
- `video.retryProcessing`은 `metadataStatus`, `transcriptStatus`, `embeddingStatus` 중 하나라도 `FAILED`일 때만 허용한다.
- `NOT_AVAILABLE`은 자막 부재가 확정된 상태이므로 retry 허용 조건에는 포함하지 않는다.

Agent가 MCP tool을 호출할 때는 JSON-RPC envelope을 사용한다.

```json
{
  "jsonrpc": "2.0",
  "id": "run-step-1",
  "method": "tools/call",
  "params": {
    "name": "transcript.searchChunks",
    "arguments": {
      "postId": "01J00000000000000000000000",
      "query": "이 주장이 영상에서 언급되나요?",
      "limit": 5
    }
  }
}
```

이 envelope은 일반 domain service 호출을 모두 대체하는 구조가 아니다. 일반 제품 흐름은 기존 service를 직접 호출하고, Agent가 tool을 사용할 때만 `McpServerService.handleRequest()`를 통해 MCP boundary를 지난다.

Phase 9.5 이후 MCP 응답 shape는 공식 MCP tools 구조에 더 가깝게 정렬되어 있다.

- `tools/list` result는 `{ tools: [...] }` 형태로 반환한다.
- `tools/call` result는 `content`, `structuredContent`, `isError`를 포함한다.
- protocol 오류는 JSON-RPC error envelope로 반환한다.
- provider/business failure는 정제된 `isError: true` tool result로 반환한다.

### 3-9. AI Agent 정책

MVP Agent는 게시글 상세 화면의 토론 보조자다.

- Phase 10 구현자는 `docs/implementation/phase10_ai_agent_loop_plan.md`의 구현 하네스를 기준으로 작업한다.
- Agent는 사용자 대신 게시글이나 댓글을 작성하지 않는다.
- Agent는 참/거짓 최종 판정자가 아니다.
- Agent는 게시글 맥락, 영상 처리 상태, 자막 검색 결과를 바탕으로 근거 후보와 한계를 설명한다.
- Agent run 생성 API는 `POST /api/v1/posts/:postId/agent/runs`로 둔다.
- 요청 body는 우선 `{ "question": "..." }`로 시작한다.
- Agent run 조회 API는 `GET /api/v1/agent/runs/:runId`로 둔다.
- 생성 API는 로그인 사용자와 CSRF를 요구한다.
- Phase 10 MVP에서 run 조회는 생성자 본인만 허용한다.
- Agent는 domain service를 직접 호출하지 않고 MCP envelope으로 tool을 호출한다.
- 자동 Agent loop의 기본 allowlist는 `post.getContext`, `video.getProcessingStatus`, `transcript.searchChunks`, `youtube.fetchMetadata`로 시작한다.
- `video.retryProcessing`은 별도 확인 UI나 사용자 승인 흐름이 생기기 전까지 자동 Agent loop allowlist에 넣지 않는다.
- Agent run은 `PENDING`, `RUNNING`, `SUCCESS`, `FAILED` 상태를 가진다.
- Agent step은 tool call과 tool result를 저장하되 API key, token, cookie, raw provider error, stack trace를 저장하지 않는다.
- 초기 loop 제한은 `maxSteps=4`, 전체 timeout 30초, tool timeout 10초로 시작한다.
- LangChain 요구를 반영할 때는 `docs/implementation/phase10_langchain_adapter_plan.md`를 따른다.
- LangChain은 Agent LLM decision provider 내부 adapter로만 사용하고, Agent 상태 머신과 MCP JSON-RPC tool boundary는 유지한다.
- Phase 10.1 이후 `OpenAiAgentLlmProvider`는 `ChatOpenAI.withStructuredOutput()` 기반 LangChain adapter다.
- Agent에는 LangChain AgentExecutor, LangGraph, LangChain tool calling을 도입하지 않는다.
- Agent 자동 테스트는 실제 OpenAI API key나 네트워크 호출을 사용하지 않고 provider를 mock한다.

### 3-10. 댓글 스레드 요약 정책

- Phase 11 구현자는 `docs/implementation/phase11_comment_summary_plan.md`의 구현 하네스를 기준으로 작업한다.
- Phase 11 구현자는 Phase 10.1 LangChain adapter까지 완료된 상태를 전제로 한다.
- 댓글 스레드 요약은 자동 생성하지 않는다.
- 로그인 사용자가 “AI 요약” 버튼을 눌렀을 때만 생성한다.
- 비회원은 이미 생성된 요약만 조회할 수 있다.
- 새 요약 생성은 로그인 사용자만 가능하다.
- 요약 생성 최소 조건은 루트 댓글 포함 전체 댓글 수 10개 이상이다.
- 댓글 수가 10개 미만이면 요약을 생성하지 않고 “요약할 댓글이 충분하지 않습니다”라고 안내한다.
- 삭제된 댓글은 요약 대상 댓글 수와 LLM 입력에서 제외한다.
- Phase 11 MVP는 루트 댓글 스레드당 최신 요약 1개만 유지한다.
- 요약 가능한 LLM 입력은 최대 700자로 제한한다.
- 요약 생성 이후 새 댓글이 추가되면 기존 요약은 유지하되 최신 상태가 아닐 수 있음을 표시한다.
- stale 요약을 재생성할 때는 전체 댓글을 다시 보내지 않고 기존 요약과 새 댓글만 사용해 갱신한다.
- Summary는 Agent loop가 아니므로 `AgentService`, `McpServerService`, MCP tool boundary에 의존하지 않는다.

### 3-11. 삭제 정책

- 게시글 삭제는 soft delete를 우선한다.
- 게시글이 삭제되면 연결된 댓글과 AI 결과는 사용자에게 노출하지 않는다.
- 댓글 삭제는 soft delete로 처리한다.
- 사용자가 댓글을 삭제한 경우 대댓글은 유지한다.
- 삭제된 댓글은 “삭제된 댓글입니다”로 표시한다.
- 관리자가 삭제한 댓글은 “관리자에 의해 삭제된 댓글입니다”로 표시한다.
- 회원 탈퇴 시 게시글과 댓글은 유지하고 작성자는 “탈퇴한 회원”으로 표시한다.

### 3-12. 파생 카운터 정책

게시글 목록과 상세 화면에서 반복적으로 필요한 카운터는 `posts` 테이블에 denormalized column으로 둔다.

대상:

- `commentCount`: 삭제되지 않은 댓글과 대댓글 수
- `viewCount`: Arena 내부 게시글 조회 수
- `likeCount`: Arena 내부 게시글 좋아요 수

원칙:

- 카운터는 조회 성능을 위한 파생 값이며, 가능한 한 원본 데이터를 따로 둔다.
- 댓글 수의 원본은 `comments` 테이블이다.
- 좋아요 수의 원본은 `post_likes` 테이블이다.
- 조회수는 MVP에서는 `posts.view_count`를 직접 증가시키는 단순 정책으로 시작할 수 있다.
- 중복 조회수 방지 정책은 MVP 이후 수립한다. 필요하면 사용자 ID, IP/User-Agent hash, 시간 창, `post_view_events` 원본 테이블을 조합해 처리한다.
- YouTube 영상의 조회수/좋아요/댓글 수는 Arena 게시글 카운터와 구분한다. 영상 외부 통계 DB 컬럼은 `videos.youtube_view_count`, `videos.youtube_like_count`, `videos.youtube_comment_count`처럼 명확한 이름을 사용한다.
- 카운터 증감은 원본 데이터 변경과 같은 transaction 안에서 처리한다.
- 카운터 값은 음수가 되면 안 된다.
- 카운터 불일치 가능성을 인정하고, 운영 고도화 단계에서는 원본 테이블 기준 재계산 작업을 둘 수 있다.

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
- 게시글 좋아요는 로그인 사용자만 할 수 있고, 같은 사용자가 같은 게시글을 중복 좋아요할 수 없다.
- 댓글 작성자는 자기 댓글만 수정/삭제할 수 있다.
- 대댓글의 대댓글은 허용하지 않는다.
- 댓글 작성/삭제 시 게시글 댓글 수가 일관되게 증감한다.
- 게시글 작성 시 video 상태는 PENDING으로 반환된다.
- YouTube API 실패가 게시글 작성 실패로 이어지지 않는다.
- 댓글 작성 시 AI 분석 상태는 PENDING으로 시작한다.
- AI 분석 실패가 댓글 작성 실패로 이어지지 않는다.
- AI 분석 재시도는 관리자만 가능하다.
- AI 분석 재시도는 FAILED 상태에서만 가능하다.
- MCP tool은 allowlist로만 호출할 수 있다.
- MCP write tool은 권한과 실패 상태 조건을 모두 검증한다.
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
12. MCP Agent Tool Server 구현
13. MCP Protocol Alignment
14. AI Agent 추론 루프 구현
15. Summary 구현
16. Admin 기능 구현
17. E2E 테스트 정리
18. README / 실행 문서 정리

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
→ MCP Agent Tool Server
→ MCP Protocol Alignment
→ AI Agent 추론 루프
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
