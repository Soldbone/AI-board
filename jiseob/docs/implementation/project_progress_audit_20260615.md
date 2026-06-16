# Project Progress Audit — 2026-06-15

> 기준 문서: `AGENTS.md`, `arena_implementation_plan.md`, Phase 13/14 구현 문서
> 기준 코드: `backend/src`, `backend/test`, `frontend/src`, `docs`
> 목적: 현재 구현 상태와 다음 작업자가 먼저 볼 문서를 빠르게 정리한다.

---

## 1. 현재 진행 상태

현재 backend 기능 구현은 Phase 13까지 완료되어 있다.

완료된 주요 backend phase:

- Phase 1~3: NestJS 설정, 공통 기반, User/Auth/JWT/CSRF
- Phase 4~5: Post/Tag/Video 기본 API, Comment/Reply API, soft delete
- Phase 6: YouTube metadata, transcript CLI, transcript chunk, embedding, video retry
- Phase 7: 댓글 작성/수정 후 AI 댓글 분석과 moderation 상태
- Phase 8: FACT_CLAIM 댓글 대상 pgvector RAG 근거 후보
- Phase 9~9.5: MCP JSON-RPC tool server와 protocol-aligned tool result
- Phase 10~10.1: Agent run/step, MCP 기반 Agent loop, LangChain structured-output adapter
- Phase 11: 댓글 스레드 요약 생성/조회, OpenAI summary provider, stale 계산
- Phase 12: 관리자용 주의 필요 댓글 조회/삭제, 실패한 AI 댓글 분석 재시도
- Phase 13: backend HTTP E2E 테스트 하네스와 provider mock 기반 정책 테스트
- Phase 14: README/API/ERD/runbook/demo/한계 문서 정리

Frontend 상태:

- `frontend/src/App.tsx`는 placeholder 화면이다.
- MVP 사용자 화면은 아직 구현되지 않았다.
- 현재 데모와 검증은 backend API 중심으로 진행한다.

---

## 2. 구조 점검

정상으로 확인된 부분:

- Backend module 구조는 MVP 방향과 맞다.
  - `AuthModule`, `UsersModule`, `PostsModule`, `CommentsModule`, `VideosModule`, `TagsModule`, `AiModule`, `McpModule`, `AgentModule`, `AdminModule`
- AI 기능은 `AiModule` 하위로 분리되어 있다.
  - `comment-analysis`
  - `rag`
  - `summary`
- Agent는 `AgentModule`로 분리되어 있고, Summary는 Agent/MCP에 의존하지 않는다.
- MCP는 일반 REST endpoint가 아니라 `POST /api/v1/mcp` tool boundary로 유지되어 있다.
- 주요 Entity는 `BaseModel` 기반 ULID `char(26)` primary key 정책을 따른다.
- state-changing REST API는 `JwtAuthGuard + CsrfGuard`를 사용한다.
- MCP endpoint는 Bearer access token 기반이며 CSRF guard를 적용하지 않는다.
- Admin endpoint는 `RolesGuard`와 `@Roles(UserRole.ADMIN)`로 보호된다.
- backend E2E 테스트는 `backend/test/`에 있으며 `pnpm.cmd test:e2e`로 실행한다.

아직 없는 구조:

- 실제 frontend application screen
- Redis/BullMQ 또는 durable job queue
- provider smoke test 자동화
- 운영용 observability/dashboard

---

## 3. 문서 상태

최신 진입점:

- `README.md`
- `docs/api/backend_api.md`
- `docs/database/erd.md`
- `docs/operations/local_runbook.md`
- `docs/demo/demo_scenarios.md`
- `docs/implementation/mvp_limitations_and_next_steps.md`

구현 결과 문서:

- `docs/implementation/phase13_e2e_test_implementation.md`
- `docs/implementation/phase14_documentation_cleanup_implementation.md`

오래된 phase harness 문서는 당시 구현 계획을 이해하기 위한 참고 자료다. 실제 현재 상태는 최신 구현 결과 문서와 코드를 우선한다.

---

## 4. E2E 기준 상태

Phase 13 E2E 하네스는 다음 정책으로 동작한다.

- 실제 `AppModule`을 부팅한다.
- `arena_e2e` 계열 PostgreSQL DB를 사용한다.
- migration을 실행하고 application table을 truncate한다.
- truncate helper는 `NODE_ENV=test`와 안전한 DB 이름을 확인한다.
- YouTube/OpenAI/LangChain provider는 deterministic mock으로 override한다.

검증 범위:

- 인증, CSRF, 권한 실패
- 게시글 생성과 video `PENDING`
- 댓글/대댓글, soft delete placeholder, `commentCount`
- AI 분석 실패와 RAG evidence endpoint
- 댓글 스레드 요약 최소 조건
- admin 목록/삭제/retry 정책

---

## 5. 남은 리스크

- 서버 내부 비동기 작업은 서버 재시작 시 유실될 수 있다.
- Redis/BullMQ는 MVP 범위에서 제외되어 있다.
- transcript provider는 `youtube-transcript-api` CLI 기반이라 외부 변경에 취약할 수 있다.
- AI 분석/RAG/Agent/요약은 provider 비용, timeout, rate limit, 모델 변경 영향을 받는다.
- frontend가 placeholder라 실제 사용자 workflow 검증은 아직 불가능하다.

---

## 6. 다음 작업 기준

다음 기능 phase를 시작하는 구현자는 아래 문서를 먼저 확인한다.

필수:

- `AGENTS.md`
- `README.md`
- `docs/api/backend_api.md`
- `docs/database/erd.md`
- `docs/operations/local_runbook.md`
- `docs/implementation/mvp_limitations_and_next_steps.md`

데모 또는 발표 준비:

- `docs/demo/demo_scenarios.md`
- `docs/implementation/phase13_e2e_test_implementation.md`
- `docs/implementation/phase14_documentation_cleanup_implementation.md`

코드와 문서가 다르면 코드를 우선 확인하고, 기능 변경이 필요한 경우 별도 fix phase로 분리한다.
