# Arena 구현 순서 문서

> 목적: Arena MVP를 실제로 구현할 때 어떤 순서로 만들지 정리한다.  
> 기준: React + Vite, NestJS, TypeScript, PostgreSQL, TypeORM, pgvector, JWT  
> 원칙: 기본 게시판 기능을 먼저 안정화하고, AI 기능은 상태값 기반으로 단계적으로 붙인다.

---

## 0. 구현 전략 요약

Arena는 처음부터 AI 기능을 구현하려고 하면 복잡해진다. 따라서 다음 순서로 구현한다.

```text
인증 없는 게시판 골격
→ 인증/권한
→ 댓글/대댓글
→ 영상 상태값
→ 자막/임베딩
→ AI 댓글 분석
→ RAG 근거 후보
→ MCP Agent Tool Server
→ MCP Protocol Alignment
→ AI Agent 추론 루프
→ 댓글 스레드 요약
→ 관리자 기능
→ 테스트/문서 정리
```

핵심 원칙은 다음과 같다.

```text
게시판 기능은 반드시 동작한다.
외부 API와 AI 기능은 실패해도 상태값으로 표현한다.
```

과제 요구사항의 AI 활용 기능은 다음처럼 대응한다.

```text
RAG
→ 영상 자막 chunk와 pgvector 기반 근거 후보 검색

MCP
→ Agent가 호출할 수 있는 tool server로 제공
→ 최소 1개 이상의 실제 외부 서비스는 YouTube Data API 기반 metadata tool로 충족
→ Phase 10 전에는 MCP tools 응답 shape를 공식 구조에 더 가깝게 정렬

AI Agent
→ LLM이 MCP tool을 선택하고 실행하는 제한된 추론 루프 구현
→ Function Calling, 상태 저장, 최대 step 제한, 예외 처리 정책 포함
```

---

## Phase 1. 프로젝트 초기 설정

### 목표

NestJS 백엔드 프로젝트를 실행 가능한 상태로 만든다.

### 작업 목록

- NestJS 프로젝트 생성
- ESLint / Prettier 설정 확인
- 환경 변수 구조 정의
- PostgreSQL 연결 준비
- TypeORM 설정
- Docker Compose로 PostgreSQL 실행
- Health check API 작성

### 완료 기준

- 서버가 로컬에서 실행된다.
- `/api/v1/health` 요청에 성공한다.
- PostgreSQL 연결이 정상적으로 된다.

### 직접 했다면 접근법

처음에는 비즈니스 로직을 만들지 말고 “서버가 켜지고 DB에 연결되는지”만 확인한다. 이 단계에서 인증, 게시글, AI를 동시에 시작하면 문제 원인을 분리하기 어렵다.

### 유의사항

- `.env`와 `.env.example`을 분리한다.
- 실제 API key를 Git에 올리지 않는다.
- TypeORM `synchronize: true`는 초반 로컬 실험에서만 사용하고, 팀 공유/제출용으로는 migration을 준비한다.

---

## Phase 2. 공통 기반 구현

### 목표

프로젝트 전체에서 반복해서 사용할 기반 코드를 만든다.

### 작업 목록

- 공통 `BaseModel` 또는 `BaseEntity` 작성
- ULID 생성 유틸 작성
- 공통 enum 정의
- 공통 응답/예외 처리 방식 정리
- 인증 Guard, Role Guard의 골격 준비

### 필요한 enum 예시

- UserRole
- MetadataStatus
- TranscriptStatus
- EmbeddingStatus
- CommentType
- AiAnalysisStatus
- RagStatus
- ModerationStatus
- SummaryStatus
- SummaryTargetType

### 완료 기준

- Entity에서 ULID를 자동 생성할 수 있다.
- 공통 상태값을 중복 없이 import해서 사용할 수 있다.

### 직접 했다면 접근법

먼저 enum을 전부 완벽하게 만들려고 하지 말고, 현재 문서에서 확정된 상태값만 만든다. 구현 중 새 상태가 필요해지면 추가한다.

### 유의사항

- TypeScript enum을 DB enum으로 직접 매핑할지, varchar로 저장할지 결정해야 한다.
- MVP에서는 DB enum보다 varchar + application enum이 migration 부담이 적을 수 있다.
- 단, 값이 흔들리지 않도록 코드 상수는 반드시 중앙에서 관리한다.

---

## Phase 3. User / Auth 구현

### 목표

로그인 기반 기능을 만들기 위한 인증 구조를 구현한다.

### API

```http
POST   /api/v1/auth/signup
POST   /api/v1/auth/login
GET    /api/v1/users/me
DELETE /api/v1/users/me
```

### 작업 목록

- User Entity 작성
- 회원가입 DTO 작성
- 비밀번호 해시 처리
- 로그인 구현
- JWT 발급
- JwtAuthGuard 구현
- 내 정보 조회 구현
- 회원탈퇴 soft delete 구현

### 테스트 기준

- 이메일 중복 가입은 실패한다.
- 비밀번호는 평문 저장되지 않는다.
- 로그인 성공 시 accessToken을 반환한다.
- 잘못된 비밀번호는 401을 반환한다.
- 토큰 없이 내 정보 조회 시 401을 반환한다.
- 탈퇴한 회원은 로그인할 수 없다.

### 직접 했다면 접근법

가장 먼저 “회원가입 → 로그인 → 내 정보 조회” 흐름 하나만 완성한다. 이 흐름이 안정되면 게시글/댓글 권한 검증을 붙이기 쉬워진다.

### 유의사항

- 응답에 passwordHash를 절대 포함하지 않는다.
- 로그인 실패 메시지는 이메일 존재 여부를 노출하지 않도록 통일한다.
- 회원탈퇴 후 기존 글의 작성자는 “탈퇴한 회원”으로 표시해야 한다.

---

## Phase 4. Post / Tag / Video 기본 구현

### 목표

유튜브 링크 기반 게시글을 작성하고 조회할 수 있게 만든다.

### API

```http
GET    /api/v1/posts
POST   /api/v1/posts
GET    /api/v1/posts/:postId
PATCH  /api/v1/posts/:postId
DELETE /api/v1/posts/:postId
POST   /api/v1/posts/:postId/views
POST   /api/v1/posts/:postId/like
DELETE /api/v1/posts/:postId/like
GET    /api/v1/tags
GET    /api/v1/videos/:videoId
```

### 작업 목록

- Post Entity 작성
- Video Entity 작성
- Tag Entity 작성
- PostTag 관계 작성
- PostLike 관계 작성
- 게시글 내부 파생 카운터 작성
  - commentCount
  - viewCount
  - likeCount
- 게시글 작성 구현
- 유튜브 URL에서 youtubeVideoId 추출
- 동일 youtubeVideoId의 Video 재사용
- 게시글 작성 시 Video 상태값 PENDING 반환
- 게시글 목록 조회 구현
- 게시글 상세 조회 구현
- 게시글 검색/태그 필터 구현
- 게시글 조회 수 증가 구현
- 게시글 좋아요 / 좋아요 취소 구현
- 게시글 수정/삭제 권한 구현

### 완료 기준

- 로그인 사용자는 게시글을 작성할 수 있다.
- 비회원은 게시글을 작성할 수 없다.
- 게시글 작성 시 Video가 생성되거나 재사용된다.
- 게시글 작성 API는 YouTube API를 기다리지 않는다.
- 게시글 작성 응답의 video 상태는 PENDING이다.
- 게시글 작성자만 수정/삭제할 수 있다.
- 게시글 목록/상세 응답에 commentCount, viewCount, likeCount가 포함된다.
- 같은 사용자는 같은 게시글을 한 번만 좋아요할 수 있다.
- 좋아요 취소 시 likeCount가 음수가 되지 않는다.

### 직접 했다면 접근법

처음에는 YouTube API를 붙이지 말고, URL 파싱과 Video row 생성까지만 구현한다. 그다음 영상 메타데이터 수집을 별도 service로 추가한다.

### 유의사항

- 게시글 작성 후 youtubeUrl 변경은 MVP에서 막는 것이 좋다.
- youtubeUrl 변경을 허용하면 Video, TranscriptChunk, RAG 결과를 다시 계산해야 한다.
- 목록 조회에서 content 전체, 댓글 전체, 자막 전체를 내려주지 않는다.
- `posts.comment_count`, `posts.view_count`, `posts.like_count`는 Arena 내부 게시글 카운터다.
- YouTube 영상의 외부 통계는 `videos.youtube_view_count`, `videos.youtube_like_count`, `videos.youtube_comment_count`처럼 별도 이름으로 둔다.
- 좋아요 수는 `post_likes`를 원본으로 두고, 카운터는 같은 transaction 안에서 증감한다.
- 조회수는 MVP에서는 별도 이벤트 테이블 없이 `posts.view_count`를 증가시키되, 중복 조회 방지와 봇 필터링은 추후 고도화 대상으로 둔다.
- 추후 중복 조회수 정책이 필요해지면 로그인 사용자는 `userId`, 비로그인 사용자는 IP/User-Agent hash와 시간 창을 기준으로 제한하고, 필요 시 `post_view_events` 원본 테이블을 도입한다.

---

## Phase 5. Comment / Reply 구현

### 목표

게시글에 댓글과 대댓글을 작성할 수 있게 만든다.

### API

```http
GET    /api/v1/posts/:postId/comments
POST   /api/v1/posts/:postId/comments
POST   /api/v1/comments/:commentId/replies
PATCH  /api/v1/comments/:commentId
DELETE /api/v1/comments/:commentId
```

### 작업 목록

- Comment Entity 작성
- 최상위 댓글 작성 구현
- 대댓글 작성 구현
- 대댓글 깊이 제한 구현
- 댓글 목록 조회 구현
- 댓글 수정 구현
- 댓글 soft delete 구현
- 삭제된 댓글 표시 정책 구현
- 댓글 작성/삭제 시 게시글 commentCount 증감 구현

### 완료 기준

- 로그인 사용자는 댓글을 작성할 수 있다.
- 로그인 사용자는 대댓글을 작성할 수 있다.
- 대댓글의 대댓글은 작성할 수 없다.
- 댓글 작성자만 수정/삭제할 수 있다.
- 삭제된 댓글의 대댓글은 유지된다.
- 삭제되지 않은 댓글과 대댓글 수가 게시글 commentCount에 반영된다.

### 직접 했다면 접근법

먼저 최상위 댓글만 구현하고, 그 다음 대댓글을 추가한다. 처음부터 무한 depth 트리를 구현하려고 하지 않는다.

### 유의사항

- 대댓글 작성 시 부모 댓글이 삭제되었는지 확인한다.
- 부모 댓글이 이미 대댓글이면 답글 생성을 막는다.
- 댓글 삭제는 실제 삭제가 아니라 soft delete다.

---

## Phase 6. 영상 메타데이터 / 자막 / 임베딩 처리

### 목표

게시글에 연결된 Video에 대해 외부 처리 상태를 관리한다.

### 작업 목록

- 영상 처리 provider adapter 구조 작성
- YouTube Data API v3 기반 메타데이터 수집 service 작성
- `youtube-transcript-api` CLI 기반 자막 수집 adapter 작성
- 자막 청킹 service 작성
- OpenAI embeddings 기반 임베딩 생성 service 작성
- TranscriptChunk 저장 구현
- pgvector extension migration 작성
- backend Docker 구성에 Python과 `youtube-transcript-api` CLI 설치 추가
- 게시글 작성 직후 영상 처리 비동기 자동 트리거 구현
- 영상 처리 retry API 구현
- 영상 처리 실패 시 상태값 업데이트

### 완료 기준

- 게시글 작성 후 영상 처리 상태가 PENDING으로 시작한다.
- 메타데이터 수집 성공 시 metadataStatus=SUCCESS가 된다.
- 메타데이터 수집 실패 시 metadataStatus=FAILED가 된다.
- 자막 없음은 transcriptStatus=NOT_AVAILABLE로 표현한다.
- 임베딩 완료 후 embeddingStatus=SUCCESS가 된다.
- 영상 처리 실패 시 사용자에게 노출 가능한 정제된 errorCode/errorMessage가 저장된다.
- backend Docker 환경에서 `youtube_transcript_api` CLI를 실행할 수 있다.
- 게시글 작성 성공 여부는 영상 처리 성공 여부와 분리된다.

### 직접 했다면 접근법

영상 처리는 provider adapter 뒤에 숨긴다. 메타데이터는 공식 YouTube Data API v3를 사용하고, 자막은 공식 API 한계 때문에 MVP에서 `youtube-transcript-api` CLI를 사용한다. 임베딩은 OpenAI embeddings API를 실제 호출한다.

### 유의사항

- MVP에서는 Redis 큐를 쓰지 않는다.
- 서버 내부 비동기 작업은 서버 재시작 시 유실될 수 있다.
- 실패한 작업은 상태값으로 남기고 관리자 재시도 또는 추후 PostgreSQL 작업 큐로 보완한다.
- pgvector column을 쓰기 전에 반드시 extension migration이 필요하다.
- `youtube-transcript-api`는 비공식 transcript provider이므로 차단, 응답 구조 변경, cloud IP 제한 가능성이 있다.
- 런타임에서는 mock transcript를 사용자에게 반환하지 않는다. 외부 호출 실패는 FAILED 또는 NOT_AVAILABLE 상태와 정제된 실패 사유로 표현한다.
- 테스트에서는 외부 API key와 YouTube 네트워크에 의존하지 않도록 provider adapter를 mock할 수 있다.
- raw provider error에는 API key, 내부 URL, stack trace가 섞일 수 있으므로 사용자 응답에는 그대로 노출하지 않는다.
- transcript 언어 기본값은 `ko,en`, chunk 기본값은 1000자와 overlap 200자로 시작한다.
- retry는 metadata, transcript, embedding 중 하나라도 `FAILED`일 때만 허용한다.
- `transcriptStatus=NOT_AVAILABLE`은 자막 부재가 확정된 상태이므로 retry 허용 조건에는 포함하지 않는다.
- 일반 REST retry API는 로그인 사용자와 CSRF를 요구하고, Phase 9 MCP retry tool은 Bearer JWT 기반 tool boundary로 처리한다.

---

## Phase 7. AI 댓글 분석 구현

### 목표

댓글 작성 후 댓글 유형 분석과 moderationStatus 판단을 수행한다.

### 작업 목록

- CommentAnalysis Entity 작성
- AiModule 작성
- 댓글 분석 service 작성
- 댓글 작성 후 분석 요청 연결
- 분석 성공 시 commentType 저장
- 분석 실패 시 aiAnalysisStatus=FAILED 저장
- 비난/욕설/인신공격 댓글이면 moderationStatus=NEEDS_REVIEW 처리

### 완료 기준

- 댓글 작성 직후 CommentAnalysis가 PENDING 상태로 생성된다.
- 분석 성공 시 commentType이 저장된다.
- 분석 실패 시 댓글은 유지되고 분석 상태만 FAILED가 된다.
- toxic 댓글은 자동 삭제되지 않고 주의 필요 상태가 된다.

### 직접 했다면 접근법

LLM API 호출은 provider adapter 뒤에 두고, API key 누락이나 외부 API 실패 시 rule-based analyzer로 fallback한다. 이렇게 하면 실제 API를 사용하면서도 댓글 작성 성공 여부와 AI 분석 성공 여부를 분리할 수 있다.

### 유의사항

- 댓글 작성 API가 AI 분석 완료를 기다리면 안 된다.
- 댓글 수정 시 기존 분석은 stale해진다.
- 댓글 수정 후 요약을 자동 재생성하지 않는다.

---

## Phase 8. RAG 근거 후보 구현

### 목표

사실 주장 댓글에 대해 영상 자막 청크를 검색해 근거 후보를 제공한다.

### API

```http
GET /api/v1/comments/:commentId/evidences
```

### 작업 목록

- RagEvidence Entity 작성
- CommentAnalysis 결과가 FACT_CLAIM인지 확인
- 해당 게시글의 Video와 TranscriptChunk 조회
- 댓글 내용을 embedding으로 변환
- pgvector similarity search 수행
- similarity threshold 이상인 상위 3개 근거 후보 저장
- evidenceCount를 댓글 목록에서 보여줄 수 있게 처리
- RAG 전용 errorCode/errorMessage 저장
- 댓글 수정 또는 영상 재처리 시 기존 RAG 근거 후보를 최신 상태로 초기화

### 완료 기준

- FACT_CLAIM 댓글에만 RAG 검색이 수행된다.
- 근거 후보가 있으면 RagEvidence가 저장된다.
- 근거 후보가 없으면 ragStatus=NO_RESULT로 처리된다.
- 의견/질문/잡담 댓글은 ragStatus=NOT_REQUIRED로 처리된다.
- 영상 embedding이 아직 처리 중이면 ragStatus=PENDING을 유지한다.
- 자막 없음이나 embedding 실패처럼 처리 불가 상태가 확정되면 ragStatus=FAILED로 처리된다.
- GET evidences API는 조회만 수행하고 RAG 생성이나 재실행을 트리거하지 않는다.

### 직접 했다면 접근법

기본 구현은 pgvector similarity search로 시작한다. 테스트에서는 외부 API key와 네트워크에 의존하지 않도록 embedding provider와 검색 결과를 mock할 수 있지만, 운영 런타임에서는 mock evidence를 사용자에게 반환하지 않는다.

### 유의사항

- RAG 결과를 fact verdict로 표현하지 않는다.
- 댓글 목록에는 근거 상세 전체를 포함하지 않는다.
- RAG 상세는 사용자가 펼쳐볼 때 별도 API로 조회한다.
- RAG는 댓글 분석 성공 후 서버 내부 비동기 작업으로 자동 실행한다.
- 사용자의 “근거 후보 보기” 버튼은 이미 생성된 evidence 조회만 담당한다.
- 기본 topK는 3개다.
- 기본 similarity threshold는 0.70이다.
- similarity는 `1 - cosineDistance`로 계산하고 score를 저장한다.
- 최신 결과만 유지하므로 재검색 또는 재분석 시 기존 evidence를 삭제하고 새 결과를 저장한다.
- 비회원은 이미 생성된 evidence 조회만 가능하다.
- 삭제된 댓글 또는 삭제된 게시글의 evidence는 노출하지 않는다.

### Smoke test 기준

자동 테스트는 실제 API key와 외부 네트워크에 의존하지 않는다. 실제 provider smoke test는 환경변수와 네트워크가 준비된 경우 별도로 수행한다.

```text
YouTube metadata smoke videoId: jNQXAC9IVRw
Transcript/RAG smoke videoId: uehJDFfKMpU
```

---

## Phase 9. MCP Agent Tool Server 구현

### 목표

MCP를 일반 백엔드 외부 API 호출 경로가 아니라, AI Agent가 사용할 수 있는 tool 계층으로 제공한다.

### 작업 목록

- McpModule 작성
- MCP JSON-RPC 요청/응답 처리 구조 작성
- `POST /api/v1/mcp` endpoint 작성
- tool registry 작성
- tool argument schema와 response schema 정의
- `youtube.fetchMetadata` tool 작성
- `video.getProcessingStatus` tool 작성
- `video.retryProcessing` tool 작성
- `post.getContext` tool 작성
- `transcript.searchChunks` tool 작성
- MCP tool 호출용 권한 context 설계
- API key와 provider raw error가 tool response에 노출되지 않도록 처리
- MCP tool 단위 테스트 작성

### 완료 기준

- Agent가 MCP tool 목록을 조회할 수 있다.
- Agent가 tool name과 arguments로 MCP tool을 호출할 수 있다.
- 최소 1개 이상의 tool이 실제 외부 서비스와 연동된다.
- YouTube API key는 환경변수에서만 읽고 tool argument나 response에 포함되지 않는다.
- 권한 없는 사용자는 write 성격의 tool을 호출할 수 없다.
- `video.retryProcessing`은 작성자 또는 관리자만 호출할 수 있고, metadata/transcript/embedding 중 하나라도 `FAILED`일 때만 허용된다.
- `transcript.searchChunks`는 pgvector similarity search를 사용하고 기본 limit 5, 최대 limit 10, threshold 0.70을 적용한다.
- provider 실패는 정제된 errorCode/errorMessage로 반환된다.

### 직접 했다면 접근법

Phase 6 provider adapter를 McpModule로 옮기지 않는다. 기존 제품 흐름은 VideosService와 VideoProcessingService가 계속 담당하고, McpModule은 Agent가 호출할 수 있는 얇은 tool wrapper를 제공한다. 모듈 의존성은 `McpModule -> VideosModule / PostsModule / AiModule` 방향으로 두고, `VideosModule -> McpModule` 순환을 만들지 않는다.

### 유의사항

- MCP는 사용자 공개 REST API가 아니라 Agent와 서버 사이의 tool boundary다.
- Phase 9 HTTP endpoint는 `POST /api/v1/mcp` 하나로 두고 JSON-RPC 2.0의 `tools/list`, `tools/call`을 처리한다.
- MCP endpoint는 `Authorization: Bearer` access token을 요구한다.
- 현재 access token은 cookie가 아니라 Authorization header에서만 읽으므로 MCP endpoint에는 CSRF guard를 적용하지 않는다.
- 브라우저 사용자 화면의 state-changing REST API는 기존처럼 `JwtAuthGuard + CsrfGuard`를 유지한다.
- tool은 allowlist 방식으로만 노출한다.
- raw API key, access token, cookie, stack trace는 tool response에 포함하지 않는다.
- `retryProcessing` 같은 write tool은 사용자 권한 또는 관리자 권한을 반드시 확인한다.
- `youtube.fetchMetadata`는 실제 YouTube Data API provider를 호출하지만 DB를 수정하지 않는다.
- 외부 URL fetch tool을 일반화하면 SSRF 위험이 생기므로 MVP에서는 YouTube videoId처럼 검증 가능한 입력으로 제한한다.

---

## Phase 10. AI Agent 추론 루프 구현

> 권장 선행 작업: Phase 9.5 `MCP Protocol Alignment`

### 목표

LLM이 MCP tool을 선택하고 실행하는 제한된 Agent를 구현한다.

### API

```http
POST /api/v1/posts/:postId/agent/runs
GET  /api/v1/agent/runs/:runId
```

### 작업 목록

- AgentRun Entity 작성
- AgentStep Entity 작성
- AgentService 작성
- LLM Function Calling 기반 tool 선택 구현
- MCP client 또는 MCP tool caller 작성
- post context를 Agent state에 주입
- tool execution trace 저장
- 최대 step 수, timeout, token budget 제한 구현
- tool 실패 시 Agent가 사용자에게 설명 가능한 결과를 반환하게 처리
- Agent run 조회 API 작성

### 완료 기준

- 로그인 사용자는 게시글 단위 Agent run을 생성할 수 있다.
- Agent는 최소 1개 이상의 MCP tool을 선택해 호출할 수 있다.
- Agent는 tool 결과를 바탕으로 게시글/댓글 맥락에 맞는 답변을 생성한다.
- Agent run은 최대 step 수를 넘기지 않는다.
- tool 실패가 무한 retry나 요청 실패 전체로 이어지지 않는다.
- Agent 답변에는 참/거짓 단정 대신 근거 후보와 한계를 함께 표현한다.

### 직접 했다면 접근법

처음에는 LangGraph 같은 무거운 프레임워크를 바로 도입하지 않고, `plan -> tool call -> observe -> answer` 형태의 작은 상태 머신으로 시작한다. 상태 머신으로 한계가 보이면 LangGraph 또는 유사 구조로 교체한다.

Agent는 domain service를 직접 호출하지 않고, `McpServerService.handleRequest()`에 JSON-RPC envelope을 넘겨 tool을 호출한다. HTTP self-call은 하지 않는다. 내부 메서드 호출이어도 JSON-RPC envelope, tool registry, argument validation, 권한 context, error sanitation 경계를 통과하므로 MCP 검증 목적을 충족한다.

Phase 10 MVP Agent는 게시글 상세 화면의 토론 보조자다. 요청 body는 우선 `{ "question": "..." }`로 시작하고, 생성 API는 `202 Accepted`와 `runId/status`를 반환한다. 결과는 `GET /api/v1/agent/runs/:runId`에서 `answer`, `usedTools`, `evidenceCandidates`, `limitations`와 함께 조회한다.

### 유의사항

- Agent가 사용자 대신 게시글, 댓글, 삭제 같은 write action을 자동 수행하지 않도록 한다.
- Phase 10 자동 loop의 기본 allowlist는 `post.getContext`, `video.getProcessingStatus`, `transcript.searchChunks`, `youtube.fetchMetadata`로 시작한다.
- `video.retryProcessing` 같은 write tool 실행은 명시적 사용자 요청, 권한 확인, 사용자 승인 UI가 준비된 뒤에 허용한다.
- Agent memory에는 API key나 refresh token 같은 credential을 저장하지 않는다.
- Agent 답변은 RAG 근거 후보를 인용할 수 있지만, AI가 사실 판정자처럼 보이면 안 된다.

### 상세 문서

- `phase9_5_mcp_protocol_alignment.md`
- `phase10_ai_agent_loop_plan.md`

---

## Phase 11. 댓글 스레드 요약 구현

### 목표

댓글 스레드가 충분히 길 때 사용자가 AI 요약을 생성할 수 있게 한다.

### API

```http
POST /api/v1/comments/:rootCommentId/summary
GET  /api/v1/comments/:rootCommentId/summary
```

### 작업 목록

- AiSummary Entity 작성
- rootComment 조회
- rootComment가 최상위 댓글인지 검증
- 루트 댓글 포함 전체 댓글 수 계산
- 댓글 수가 10개 이상인지 검증
- 로그인 사용자만 새 요약 생성 가능하게 구현
- 비회원은 기존 요약 조회만 가능하게 구현
- 요약 생성 이후 새 댓글 추가 시 isStale 계산

### 완료 기준

- 댓글 수 10개 미만이면 요약 생성이 실패한다.
- 댓글 수 10개 이상이면 요약 생성 요청이 가능하다.
- 비회원은 요약 생성 API를 호출할 수 없다.
- 비회원은 이미 생성된 요약은 조회할 수 있다.
- 요약 이후 댓글이 추가되면 stale 상태가 표시된다.

### 직접 했다면 접근법

처음에는 요약 생성 결과를 고정 문자열로 저장하는 mock부터 만든다. 그 다음 실제 LLM 요약을 붙인다.

### 유의사항

- 요약은 댓글을 대체하지 않는다.
- 삭제된 댓글은 요약 대상에서 제외하는 방향을 우선한다.
- 요약 재생성 이력을 남길지 최신 요약만 유지할지 구현 전에 정한다.

---

## Phase 12. 관리자 기능 구현

### 목표

MVP 기준 최소 관리자 기능을 구현한다.

### API

```http
GET    /api/v1/admin/comments?moderationStatus=NEEDS_REVIEW
DELETE /api/v1/admin/comments/:commentId
POST   /api/v1/admin/comments/:commentId/analysis/retry
```

### 작업 목록

- UserRole.ADMIN 권한 처리
- Admin Guard 구현
- 주의 필요 댓글 목록 조회
- 관리자 댓글 삭제 구현
- AI 분석 실패 댓글 재시도 구현

### 완료 기준

- 일반 사용자는 admin API를 호출할 수 없다.
- 관리자는 주의 필요 댓글을 조회할 수 있다.
- 관리자는 댓글을 관리자 삭제 상태로 만들 수 있다.
- AI 분석 재시도는 FAILED 상태에서만 가능하다.

### 직접 했다면 접근법

관리자 대시보드를 만들려고 하지 말고 API만 먼저 만든다. 프론트는 간단한 리스트와 버튼 정도면 충분하다.

### 유의사항

- 관리자 삭제와 사용자 삭제를 구분해야 한다.
- AI 분석 재시도는 비용이 발생할 수 있으므로 관리자만 허용한다.

---

## Phase 13. 테스트 정리

### 목표

MVP 정책이 실제로 깨지지 않는지 확인한다.

### 우선순위 높은 E2E 테스트

1. 회원가입 / 로그인 / 내 정보 조회
2. 비회원 게시글 작성 실패
3. 게시글 작성 시 video status PENDING 반환
4. 게시글 작성자만 수정/삭제 가능
5. 게시글 조회 수 증가
6. 게시글 좋아요 중복 방지와 취소
7. 댓글 작성 / 대댓글 작성
8. 댓글 작성/삭제에 따른 commentCount 증감
9. 대댓글의 대댓글 차단
10. 댓글 삭제 후 대댓글 유지
11. 댓글 작성 후 AI 분석 PENDING
12. AI 분석 실패 시 댓글 유지
13. FACT_CLAIM 댓글만 RAG 검색
14. 근거 상세 API 분리 조회
15. 요약 생성 최소 댓글 수 10개 검증
16. 비회원 요약 생성 차단
17. 비회원 기존 요약 조회 허용
18. 관리자만 AI 분석 재시도 가능

### 직접 했다면 접근법

성공 케이스보다 실패 케이스부터 테스트한다. 인증/권한/삭제/외부 API 실패가 MVP 품질을 결정한다.

### 유의사항

- AI/외부 API는 테스트에서 mock 처리한다.
- 실제 API key에 의존하는 테스트를 만들지 않는다.
- 테스트 데이터는 게시글 1개, 루트 댓글 1개, 대댓글 9개를 기본 seed로 둔다.

---

## Phase 14. 문서 정리

### 목표

구현 결과를 설명할 수 있는 문서를 준비한다.

### 작성할 문서

- README.md
- AGENTS.md
- API 설계 문서
- ERD 문서
- 실행 방법
- 환경 변수 예시
- 데모 시나리오
- 한계 및 개선 방향

### 직접 했다면 접근법

구현이 끝난 뒤 한 번에 README를 쓰지 말고, 구현하면서 결정한 내용을 바로 메모한다. 특히 실패 정책과 AI 한계는 면접/발표에서 질문이 나올 가능성이 높다.

### 유의사항

- “AI가 팩트체크한다”보다 “AI가 근거 후보를 제시한다”라고 표현한다.
- Redis 큐 미도입은 한계가 아니라 MVP 범위 조정으로 설명한다.
- 추후 확장으로 PostgreSQL 작업 큐 또는 Redis/BullMQ를 제시한다.
