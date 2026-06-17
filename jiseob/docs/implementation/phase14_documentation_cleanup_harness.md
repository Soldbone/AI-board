# Phase 14. 문서 정리 하네스

> 기준 단계: `arena_implementation_plan.md`의 Phase 14  
> 선행 단계: Phase 13 E2E 테스트 하네스 구현 완료  
> 목표: Arena MVP의 구현 결과, 실행 방법, API, 데이터 모델, 데모 흐름, 한계를 사람이 빠르게 이해하고 검증할 수 있게 문서화한다.

---

## 0. 현재 기준 상태

현재 코드 기준:

- 백엔드는 Phase 13까지 구현되어 있다.
- 인증/게시글/댓글/영상 처리/AI 댓글 분석/RAG/MCP/Agent/요약/Admin API가 구현되어 있다.
- backend E2E 테스트 하네스가 `backend/test/`에 추가되어 있다.
- `pnpm.cmd test:e2e`로 정책형 E2E 테스트를 실행할 수 있다.
- 프론트엔드는 아직 placeholder 상태다.
- README 일부 문구는 Phase 12/13 기준으로 남아 있어 Phase 14에서 최신화해야 한다.

Phase 14는 기능 추가가 아니라 문서 정리 단계다. 코드 변경은 문서와 실행 편의성을 위해 꼭 필요한 경우로 제한한다.

---

## 1. 범위와 결정사항

포함:

- README 최신화
- AGENTS.md 최신화
- API 문서 작성
- ERD / 데이터 모델 문서 작성
- 실행 방법 / 환경 변수 / 테스트 명령 정리
- 데모 시나리오 작성
- MVP 한계와 개선 방향 정리
- 구현 상태와 문서 간 불일치 제거

제외:

- 신규 backend 기능 구현
- frontend 화면 구현
- API response shape 변경
- DB schema 변경
- 테스트 coverage 확장
- 실제 운영 배포 자동화

확정 기본값:

- AI가 사실 여부를 최종 판정한다고 쓰지 않는다.
- RAG는 “근거 후보” 또는 “관련 있을 수 있는 자막 구간”으로 설명한다.
- Redis/BullMQ 미도입은 MVP 범위 결정과 한계로 설명한다.
- 외부 API 실패가 게시글/댓글 작성 실패로 이어지지 않는 정책을 문서 전반에 일관되게 반영한다.
- 프론트엔드는 placeholder라고 명확히 적고, 현재 데모는 backend API 중심으로 설명한다.

---

## 2. 작성 / 갱신할 문서

### README.md

README는 처음 보는 사람이 로컬에서 실행하고 검증할 수 있는 최상위 문서로 정리한다.

필수 반영:

- 현재 구현 상태를 Phase 13 완료 기준으로 갱신한다.
- 다음 단계가 Phase 13이라고 되어 있는 문구를 제거한다.
- `pnpm.cmd test:e2e`를 확인 명령에 포함한다.
- PostgreSQL/pgvector 실행, migration, 테스트 DB 사용 방식을 분리해서 설명한다.
- backend 기능과 frontend placeholder 상태를 분명히 구분한다.
- AI 기능 설명에서 참/거짓 판정처럼 보이는 표현을 피한다.
- 관리자 계정 생성은 public API가 아니라 DB role update 방식임을 적는다.

권장 구성:

```text
프로젝트 소개
기술 스택
현재 구현 상태
로컬 개발환경 요구사항
.env 설정
초기 설정
개발 서버 실행
데이터베이스 / migration
확인 명령
핵심 기능 설명
API 문서 링크
데모 시나리오 링크
MVP 한계와 개선 방향 링크
```

### AGENTS.md

AGENTS는 구현 에이전트와 사람이 공유하는 규칙 문서로 유지한다.

필수 반영:

- Phase 13 이후 확정된 E2E 테스트 정책을 반영한다.
- 브랜치 관리 전략과 작업 단위 커밋 규칙이 현재 내용과 맞는지 확인한다.
- 구현 순서 요약이 실제 Phase 번호와 충돌하지 않게 정리한다.
- Phase 14 이후에는 README/API/ERD/데모 문서 정리를 다음 작업으로 안내한다.

### API 문서

새 문서 예시:

```text
docs/api/backend_api.md
```

필수 API 그룹:

- Health
- Auth / Users
- Posts / Tags / Videos
- Comments / Replies
- RAG evidences
- MCP JSON-RPC endpoint
- Agent runs
- Comment summaries
- Admin comments

각 API는 다음을 포함한다.

```text
Method / Path
인증 / CSRF 필요 여부
권한 조건
Request body 또는 query
성공 status와 response 예시
주요 실패 status
정책 메모
```

주의:

- response 예시는 실제 코드 shape를 기준으로 작성한다.
- 비밀번호, refresh token, raw provider error, stack trace가 response에 포함되지 않는다는 정책을 강조한다.
- MCP endpoint는 일반 사용자 공개 REST API가 아니라 Agent tool boundary라고 설명한다.

### ERD / 데이터 모델 문서

새 문서 예시:

```text
docs/database/erd.md
```

필수 포함:

- 주요 entity 목록과 책임
- 관계 요약
- soft delete 대상
- ULID `char(26)` 정책
- 파생 카운터 정책
- pgvector / transcript chunk / RAG evidence 관계
- AgentRun / AgentStep과 MCP tool trace 관계
- AiSummary 최신 1개 유지 정책

ERD는 Mermaid `erDiagram`으로 작성해도 된다. 다만 DB column 전체를 모두 나열하기보다 발표와 인수인계에 필요한 핵심 관계를 우선한다.

### 실행 / 검증 문서

새 문서 예시:

```text
docs/operations/local_runbook.md
```

필수 포함:

- Node.js / pnpm 버전
- Docker PostgreSQL 실행
- `.env` 작성 방법
- backend / frontend 실행 명령
- migration 실행 명령
- 전체 검증 명령
- E2E 테스트 실행 전제
- API key 없이 가능한 검증과 API key가 필요한 smoke test 구분

최종 검증 명령:

```powershell
pnpm.cmd typecheck
pnpm.cmd --filter @arena/backend test --runInBand
pnpm.cmd test:e2e
pnpm.cmd lint
pnpm.cmd format:check
```

### 데모 시나리오 문서

새 문서 예시:

```text
docs/demo/demo_scenarios.md
```

필수 시나리오:

1. 회원가입 / 로그인 / 내 정보 조회
2. YouTube URL 게시글 작성
3. 영상 처리 상태 확인
4. 댓글과 대댓글 작성
5. 사실 주장 댓글 작성 후 AI 분석 / RAG 상태 확인
6. 근거 후보 조회
7. 댓글 10개 이상 스레드 요약 생성 / 조회
8. toxic 댓글 작성 후 admin 목록 조회
9. admin 댓글 삭제
10. 실패한 AI 댓글 분석 retry
11. Agent run 생성 / 조회

주의:

- 프론트가 placeholder이므로 backend API 호출 기준으로 작성한다.
- 실제 OpenAI/YouTube API key가 없는 환경에서는 provider 관련 흐름을 E2E mock 검증과 구분한다.

### 한계 / 개선 방향 문서

새 문서 예시:

```text
docs/implementation/mvp_limitations_and_next_steps.md
```

필수 포함:

- 서버 내부 비동기 작업은 서버 재시작 시 유실될 수 있다.
- Redis/BullMQ는 MVP 범위에서 제외했다.
- frontend UI는 placeholder 상태다.
- YouTube transcript provider는 비공식 CLI 기반이므로 차단/변경 위험이 있다.
- AI 분석과 RAG는 보조 정보이며 참/거짓 최종 판정이 아니다.
- 운영 고도화 시 PostgreSQL jobs table 또는 Redis/BullMQ를 검토한다.
- E2E는 외부 네트워크를 mock하지만 실제 provider smoke test는 별도 환경에서 수행해야 한다.

---

## 3. 구현 순서

1. `AGENTS.md`의 브랜치 전략에 따라 Phase 13 완료 지점에서 `feature/jiseob/phase14-docs-cleanup` 브랜치를 만든다.
2. README의 현재 구현 상태와 다음 단계 문구를 Phase 13 완료 기준으로 갱신한다.
3. API 문서를 작성하고 실제 controller/service response shape와 대조한다.
4. ERD / 데이터 모델 문서를 작성하고 entity 관계와 soft delete 정책을 대조한다.
5. local runbook을 작성하고 명령어가 README와 충돌하지 않게 맞춘다.
6. backend API 중심 데모 시나리오를 작성한다.
7. MVP 한계와 개선 방향 문서를 작성한다.
8. README에서 새 문서들을 링크한다.
9. `pnpm.cmd format:check`를 실행한다.
10. 가능하면 최종 검증 명령 전체를 다시 실행하고 결과를 Phase 14 구현 결과 문서에 남긴다.
11. 작업 단위별로 커밋한다.
    - README / AGENTS 갱신
    - API / ERD 문서
    - 실행 / 데모 / 한계 문서
    - Phase 14 구현 결과 문서

완료 후 구현 결과 문서 예시:

```text
docs/implementation/phase14_documentation_cleanup_implementation.md
```

---

## 4. 수용 기준

Phase 14 완료 기준:

- README가 Phase 13 완료 상태를 정확히 설명한다.
- README에서 실행, 검증, API, ERD, 데모, 한계 문서로 이동할 수 있다.
- AGENTS.md가 현재 구현/테스트/브랜치 운영 규칙과 모순되지 않는다.
- API 문서가 주요 backend endpoint의 인증/CSRF/권한/실패 정책을 설명한다.
- ERD 문서가 핵심 entity 관계와 soft delete / pgvector / Agent trace / Summary 관계를 설명한다.
- local runbook만 보고 개발 서버와 테스트를 실행할 수 있다.
- demo scenario 문서가 backend API 기준으로 MVP 흐름을 설명한다.
- MVP 한계 문서가 AI 기능의 범위와 운영상 한계를 과장 없이 설명한다.
- 문서 전체에서 AI가 사실 여부를 최종 판정한다는 표현을 사용하지 않는다.
- `pnpm.cmd format:check`가 통과한다.

권장 최종 검증:

```powershell
pnpm.cmd typecheck
pnpm.cmd --filter @arena/backend test --runInBand
pnpm.cmd test:e2e
pnpm.cmd lint
pnpm.cmd format:check
```

---

## 5. 주의사항

- Phase 14에서 API나 DB schema를 문서에 맞추기 위해 바꾸지 않는다. 문서는 현재 구현을 기준으로 작성한다.
- 문서와 코드가 다르면 우선 코드를 확인하고, 구현이 의도와 다를 때만 별도 fix phase 또는 버그 작업으로 분리한다.
- README에 모든 세부 내용을 넣지 않는다. README는 진입점이고, 자세한 내용은 하위 문서로 분리한다.
- 실제 API key 값을 문서에 쓰지 않는다.
- raw provider error, token, cookie, password hash 같은 민감 정보는 예시 response에도 넣지 않는다.
- Mermaid ERD가 너무 커지면 핵심 도메인별로 나눈다.
- 현재 frontend가 placeholder라는 사실을 숨기지 않는다.
