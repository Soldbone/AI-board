# Phase 14. 문서 정리 구현 결과

> 구현 기준: `phase14_documentation_cleanup_harness.md`
> 구현 범위: README, AGENTS, API 문서, ERD, local runbook, demo scenario, MVP 한계 문서
> 제외 범위: frontend 구현, API response shape 변경, DB schema 변경

## 1. 구현 요약

Phase 14에서는 Phase 13까지 구현된 backend MVP 상태를 사람이 빠르게 이해하고 검증할 수 있도록 문서를 정리했다.

추가 문서:

```text
docs/api/backend_api.md
docs/database/erd.md
docs/operations/local_runbook.md
docs/demo/demo_scenarios.md
docs/implementation/mvp_limitations_and_next_steps.md
docs/implementation/phase14_documentation_cleanup_implementation.md
```

갱신 문서:

```text
README.md
AGENTS.md
docs/implementation/project_progress_audit_20260615.md
```

## 2. 주요 정리 내용

- README를 Phase 13 완료 기준 진입점으로 갱신했다.
- API 문서는 실제 controller/service response shape를 기준으로 인증, CSRF, 권한, 주요 실패 status, 정책 메모를 정리했다.
- ERD 문서는 TypeORM entity 관계, ULID `char(26)`, soft delete, pgvector, Agent trace, Summary 최신 1개 유지 정책을 정리했다.
- Local runbook은 `.env`, Docker PostgreSQL, migration, dev server, E2E mock 검증, 실 provider smoke test 구분을 담았다.
- Demo scenario는 frontend placeholder 상태를 전제로 backend API 중심 흐름으로 작성했다.
- MVP 한계 문서는 Redis/BullMQ 미도입, 서버 내부 비동기 작업 유실 가능성, transcript provider 리스크, AI/RAG 한계를 명시했다.
- 후속 안정화로 E2E cleanup deadlock 원인을 줄이기 위해 내부 background task drain을 추가했다.
- 게시글/댓글 생성 응답이 `PENDING` 상태를 안정적으로 반환하도록 응답 객체를 만든 뒤 background 작업을 enqueue하게 조정했다.

## 3. 검증 결과

최종 검증 결과:

```powershell
pnpm.cmd typecheck                              # 통과
pnpm.cmd --filter @arena/backend test --runInBand # 통과: 21 suites, 103 tests
pnpm.cmd test:e2e                               # 통과: 3 suites, 17 tests, 3회 연속 통과
pnpm.cmd lint                                   # 통과
pnpm.cmd format:check                           # 통과
```

E2E 전 `pnpm.cmd db:up`으로 PostgreSQL container를 실행했다.

E2E 안정화 메모:

- 원인: HTTP 응답 이후 내부 비동기로 실행되는 댓글 분석/RAG/요약 작업이 다음 테스트의 DB truncate와 겹칠 수 있었다.
- 보강: E2E app helper가 background task를 추적하고 각 테스트 전후로 drain한다.
- 보강: E2E에서 자동 video processing enqueue는 no-op으로 override해 provider 타이밍과 `PENDING` 응답 검증을 분리한다.
- 보강: `PostsService.createPost()`, `CommentsService.createComment()`, `createReply()`, `updateComment()`는 응답 객체를 먼저 만든 뒤 background 작업을 enqueue한다.

## 4. 정책 확인

- API shape, DTO, DB schema, env var 이름, test script는 변경하지 않았다.
- frontend가 placeholder라는 사실을 숨기지 않고 README/demo/runbook에 반영했다.
- RAG와 Agent는 사실 여부의 최종 판정이 아니라 근거 후보와 한계를 제공하는 기능으로 설명했다.
- 문서 예시에는 실제 API key, refresh token, cookie 값, password hash, raw provider error, stack trace를 포함하지 않았다.
