# Project Progress Audit — 2026-06-15

> 기준 문서: `AGENTS.md`, `arena_implementation_plan.md`, `arena_nestjs_module_structure.md`  
> 기준 코드: `backend/src`, `frontend/src`, `docs/implementation`  
> 목적: 현재 구현 상태와 문서/구조의 어긋남을 다음 구현자가 빠르게 파악하도록 정리한다.

---

## 1. 현재 진행 상태

현재 백엔드는 Phase 12 관리자 기능까지 구현되어 있다.

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

아직 남은 MVP backend phase:

- Phase 13: E2E 테스트 정리
- Phase 14: README/API/ERD/데모 문서 정리

Frontend 상태:

- `frontend/src/App.tsx`는 현재 placeholder 화면이다.
- MVP 사용자 화면은 아직 구현되지 않았다.
- 따라서 현재 프로젝트 진행 상태는 “backend MVP 기능 중심”으로 보는 것이 정확하다.

---

## 2. 구조 점검

### 정상으로 확인된 부분

- Backend module 구조는 문서의 큰 방향과 맞다.
  - `AuthModule`, `UsersModule`, `PostsModule`, `CommentsModule`, `VideosModule`, `TagsModule`, `AiModule`, `McpModule`, `AgentModule`, `AdminModule`이 존재한다.
- AI 기능은 `AiModule` 내부 하위 디렉터리로 분리되어 있다.
  - `comment-analysis`
  - `rag`
  - `summary`
- Agent는 `AgentModule`로 분리되어 있고, Summary는 Agent/MCP에 의존하지 않는다.
- MCP는 일반 REST endpoint가 아니라 `POST /api/v1/mcp` tool boundary로 유지되어 있다.
- 주요 Entity는 `BaseModel` 기반 ULID `char(26)` primary key 정책을 따른다.
- state-changing REST API는 대체로 `JwtAuthGuard + CsrfGuard`를 사용한다.
- Admin endpoint는 `RolesGuard`와 `@Roles(UserRole.ADMIN)`로 보호되어 있다.
- 테스트는 backend unit/controller 중심으로 21개 spec suite가 있다.

### 아직 없는 구조

- E2E 테스트 디렉터리와 정책형 integration test는 아직 없다.
- Frontend application screen은 아직 없다.

---

## 3. 문서와 코드의 어긋남

### README 진행 상태

`README.md`는 Phase 12 기준으로 최신화되어 있다. 다음 구현자는 Phase 13 하네스 문서를 우선 읽으면 된다.

정정 기준:

- 현재 구현 상태: Phase 12 관리자 기능까지 완료
- 다음 구현 순서: Phase 13 E2E 테스트 정리
- frontend는 placeholder 상태라고 명시

### Phase 13 하네스

Phase 13 구현 기준 문서로 `docs/implementation/phase13_e2e_test_harness.md`를 추가했다. 실제 PostgreSQL test DB, migrations, provider mock, 인증/CSRF helper, 정책형 E2E 시나리오를 기준으로 구현하면 된다.

### Branch 이름

현재 브랜치 이름은 `feature/jiseob/phase10-ai-agent-loop`지만 Phase 12 커밋까지 포함되어 있다. 코드 문제는 아니지만 PR 제목이나 후속 브랜치명에서는 실제 범위를 명확히 적는 편이 좋다.

---

## 4. 놓친 부분과 리스크

### E2E test DB safety

Phase 13에서 가장 큰 리스크는 test DB reset이 개발 DB를 지우는 것이다.

권장 기본값:

- E2E 전용 DB 이름은 `arena_e2e`로 둔다.
- truncate helper에는 `DATABASE_NAME === 'arena_e2e'` guard를 둔다.
- TypeORM `synchronize: true`를 쓰지 않고 migration을 실행한다.

### Provider mock 누락

E2E에서 mock provider override를 누락하면 YouTube/OpenAI API key나 네트워크 상태에 의존하게 된다.

Phase 13에서 mock할 대상:

- `YoutubeMetadataProvider`
- `YoutubeTranscriptProvider`
- `EmbeddingProvider`
- `CommentAnalyzerProvider`
- `SummaryProvider`
- `AgentLlmProvider`

### Frontend scope

MVP 문서에는 사용자 화면 요구가 있지만 현재 frontend는 placeholder다. 다음 backend Phase에서 frontend를 섞으면 컨텍스트가 커진다.

권장:

- Phase 12는 backend API와 tests만 구현한다.
- Admin UI는 Phase 12 범위에 포함하지 않는다.
- frontend는 backend MVP가 안정된 뒤 별도 Phase로 분리한다.

### README/API 문서 최신화

README와 API 문서가 구현 속도를 따라가지 못하면 다음 작업자의 진입 비용이 커진다.

권장:

- 각 Phase 완료 후 구현 결과 문서를 `docs/implementation/*_implementation.md`로 남긴다.
- README는 “현재 구현 상태”와 “다음 구현 순서”만 짧게 최신화한다.
- 상세 정책은 phase harness 문서에 둔다.

---

## 5. 다음 작업 기준

다음 구현자는 아래 문서만 먼저 읽고 Phase 13을 시작할 수 있어야 한다.

필수:

- `AGENTS.md`
- `docs/implementation/phase13_e2e_test_harness.md`
- `docs/implementation/project_progress_audit_20260615.md`

필요할 때만 참고:

- `docs/implementation/arena_nestjs_module_structure.md`
- `docs/implementation/phase11_comment_summary_implementation.md`
- `docs/implementation/phase12_admin_implementation.md`
- `docs/implementation/phase7_ai_comment_analysis.md`
- `docs/implementation/phase8_rag_evidence.md`

Phase 13이 끝나면 다음 문서를 추가하는 것이 좋다.

```text
docs/implementation/phase13_e2e_test_implementation.md
```
