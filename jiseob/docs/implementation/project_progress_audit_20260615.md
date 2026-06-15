# Project Progress Audit — 2026-06-15

> 기준 문서: `AGENTS.md`, `arena_implementation_plan.md`, `arena_nestjs_module_structure.md`  
> 기준 코드: `backend/src`, `frontend/src`, `docs/implementation`  
> 목적: 현재 구현 상태와 문서/구조의 어긋남을 다음 구현자가 빠르게 파악하도록 정리한다.

---

## 1. 현재 진행 상태

현재 백엔드는 Phase 11 댓글 스레드 요약까지 구현되어 있다.

완료된 주요 backend phase:

- Phase 1~3: NestJS 설정, 공통 기반, User/Auth/JWT/CSRF
- Phase 4~5: Post/Tag/Video 기본 API, Comment/Reply API, soft delete
- Phase 6: YouTube metadata, transcript CLI, transcript chunk, embedding, video retry
- Phase 7: 댓글 작성/수정 후 AI 댓글 분석과 moderation 상태
- Phase 8: FACT_CLAIM 댓글 대상 pgvector RAG 근거 후보
- Phase 9~9.5: MCP JSON-RPC tool server와 protocol-aligned tool result
- Phase 10~10.1: Agent run/step, MCP 기반 Agent loop, LangChain structured-output adapter
- Phase 11: 댓글 스레드 요약 생성/조회, OpenAI summary provider, stale 계산

아직 남은 MVP backend phase:

- Phase 12: 관리자 기능
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
  - `AuthModule`, `UsersModule`, `PostsModule`, `CommentsModule`, `VideosModule`, `TagsModule`, `AiModule`, `McpModule`, `AgentModule`이 존재한다.
- AI 기능은 `AiModule` 내부 하위 디렉터리로 분리되어 있다.
  - `comment-analysis`
  - `rag`
  - `summary`
- Agent는 `AgentModule`로 분리되어 있고, Summary는 Agent/MCP에 의존하지 않는다.
- MCP는 일반 REST endpoint가 아니라 `POST /api/v1/mcp` tool boundary로 유지되어 있다.
- 주요 Entity는 `BaseModel` 기반 ULID `char(26)` primary key 정책을 따른다.
- state-changing REST API는 대체로 `JwtAuthGuard + CsrfGuard`를 사용한다.
- 테스트는 backend unit/controller 중심으로 19개 spec suite가 있다.

### 아직 없는 구조

- `backend/src/admin/` 디렉터리와 `AdminModule`은 아직 없다.
- Admin endpoint도 아직 없다.
- `@Roles` decorator와 `RolesGuard`는 준비되어 있지만 실제 endpoint에는 아직 적용되지 않았다.
- 관리자 계정 생성/승격 방식은 아직 코드나 문서에서 확정되어 있지 않다.
- E2E 테스트 디렉터리와 정책형 integration test는 아직 없다.
- Frontend application screen은 아직 없다.

---

## 3. 문서와 코드의 어긋남

### README 진행 상태

`README.md`가 Phase 9.5 기준 설명에 머물러 있었다. 현재 구현은 Phase 11까지 진행되었으므로 README를 최신화해야 한다.

정정 기준:

- 현재 구현 상태: Phase 11 댓글 스레드 요약까지 완료
- 다음 구현 순서: Phase 12 관리자 기능
- frontend는 placeholder 상태라고 명시

### Phase 번호

`arena_implementation_plan.md`에서는 관리자 기능이 Phase 12다. `AGENTS.md`의 구현 순서 요약에서는 같은 작업을 16번째 “Admin 기능 구현”으로 부른다. 의미는 같지만, 다음 작업 문서에서는 `Phase 12 Admin`이라는 이름으로 통일하는 것이 좋다.

### Branch 이름

현재 브랜치 이름은 `feature/jiseob/phase10-ai-agent-loop`지만 Phase 11 커밋까지 포함되어 있다. 코드 문제는 아니지만 PR 제목이나 후속 브랜치명에서는 실제 범위를 명확히 적는 편이 좋다.

---

## 4. 놓친 부분과 리스크

### Admin role bootstrap

`UserRole.ADMIN`은 존재하지만, 실제 운영/로컬에서 첫 admin 사용자를 만드는 경로가 없다.

Phase 12 전에 결정할 것:

- 로컬/개발에서는 SQL 수동 업데이트로 admin을 만들지
- 별도 seed script를 둘지
- signup secret 기반 admin 생성은 MVP에서 제외할지

권장 기본값:

- MVP에서는 admin 생성 API를 만들지 않는다.
- 로컬/데모용으로 문서화된 SQL 또는 seed script만 제공한다.
- 일반 사용자 API로 role을 바꾸는 기능은 만들지 않는다.

### Admin delete와 commentCount

사용자 댓글 삭제는 `CommentsService.deleteComment()`에서 author 권한을 확인하고 `commentCount`를 감소시킨다. Admin delete는 같은 카운터 정책을 따라야 하지만 author check는 없어야 한다.

주의할 점:

- 이미 삭제된 댓글을 다시 삭제할 때 `commentCount`를 중복 감소시키면 안 된다.
- 관리자 삭제는 `moderationStatus=DELETED_BY_ADMIN`으로 표시해야 한다.
- active 댓글만 관리자 삭제 대상으로 보는 것이 가장 안전하다.

### AI analysis retry

`CommentAnalysisService.analyzeComment()`는 재분석 실행 기능은 있지만, admin retry 정책 자체는 아직 없다.

Phase 12에서 필요한 보강:

- 대상 댓글과 게시글이 active인지 검증
- `aiAnalysisStatus=FAILED`일 때만 허용
- retry 전에 `preparePendingAnalysis()`로 분석/RAG 상태를 초기화
- 기존 RAG evidence 삭제 정책 유지
- 일반 사용자는 403

### RolesGuard 사용 방식

`RolesGuard`는 metadata를 읽지만 아직 controller에서 사용되지 않는다.

권장 사용:

```ts
@UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
@Roles(UserRole.ADMIN)
```

GET admin API는 state-changing은 아니지만 admin 정보 노출 endpoint이므로 `JwtAuthGuard + RolesGuard`가 필요하다. DELETE/POST retry는 `JwtAuthGuard + CsrfGuard + RolesGuard`를 사용한다.

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

다음 구현자는 아래 문서만 먼저 읽고 Phase 12를 시작할 수 있어야 한다.

필수:

- `AGENTS.md`
- `docs/implementation/phase12_admin_harness.md`
- `docs/implementation/project_progress_audit_20260615.md`

필요할 때만 참고:

- `docs/implementation/arena_nestjs_module_structure.md`
- `docs/implementation/phase7_ai_comment_analysis.md`
- `docs/implementation/phase8_rag_evidence.md`
- `docs/implementation/phase11_comment_summary_implementation.md`

Phase 12가 끝나면 다음 문서를 추가하는 것이 좋다.

```text
docs/implementation/phase12_admin_implementation.md
```
