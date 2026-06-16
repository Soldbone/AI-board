# Arena

Arena는 유튜브 영상을 중심으로 토론하는 AI 보조 게시판 MVP입니다.

현재 기능 구현은 backend Phase 13까지 완료되어 있습니다. 인증/게시글/댓글/영상 처리/AI 댓글 분석/RAG/MCP/Agent/요약/Admin API와 backend E2E 테스트 하네스가 준비되어 있고, Phase 14에서는 실행, API, ERD, 데모, 한계 문서를 정리했습니다. 프론트엔드는 아직 placeholder 화면입니다.

## 기술 스택

- 런타임: Node.js 24.16.0
- 패키지 매니저: pnpm 10.12.1
- 백엔드: NestJS, TypeScript, TypeORM
- 프론트엔드: React, Vite, TypeScript
- UI: shadcn/ui, `frontend` 내부 컴포넌트로 관리
- 데이터베이스: PostgreSQL 17 + pgvector

## 문서 바로가기

- [Backend API](docs/api/backend_api.md)
- [ERD / 데이터 모델](docs/database/erd.md)
- [Local Runbook](docs/operations/local_runbook.md)
- [Demo Scenarios](docs/demo/demo_scenarios.md)
- [MVP 한계와 개선 방향](docs/implementation/mvp_limitations_and_next_steps.md)
- [Phase 14 구현 결과](docs/implementation/phase14_documentation_cleanup_implementation.md)

## 폴더 구조

```text
jiseob/
  frontend/           React/Vite 프론트엔드 placeholder
  backend/            NestJS 백엔드
  docker/             PostgreSQL 초기화 스크립트
  docs/               구현, API, 실행, 데모 문서
  README.md
  docker-compose.yml
```

shadcn/ui 컴포넌트는 `frontend/src/components/ui`에 둡니다. 별도 UI 패키지로 분리하지 않고 프론트엔드가 직접 소유합니다.

## 현재 구현 상태

- Phase 1~5: 백엔드 초기 설정, 공통 기반, 인증/CSRF, 게시글/태그/영상 기본 API, 댓글/대댓글 API
- Phase 6: YouTube metadata, transcript CLI, OpenAI embedding 기반 영상 처리와 retry 정책
- Phase 7: 댓글 작성/수정 후 AI 댓글 유형 분석과 moderation 상태 흐름
- Phase 8: FACT_CLAIM 댓글에 대한 pgvector 기반 RAG 근거 후보 검색 API
- Phase 9: Agent가 호출할 MCP JSON-RPC tool server
- Phase 9.5: MCP `tools/list`, `tools/call` 응답 shape를 `content`, `structuredContent`, `isError` 구조로 정렬
- Phase 10: MCP tool boundary를 사용하는 AI Agent 추론 루프
- Phase 10.1: LangChain `ChatOpenAI.withStructuredOutput()` 기반 Agent LLM adapter
- Phase 11: 댓글 스레드 AI 요약 생성/조회 API
- Phase 12: 관리자용 주의 필요 댓글 조회/삭제와 AI 댓글 분석 재시도 API
- Phase 13: backend HTTP E2E 테스트 하네스와 provider mock 기반 정책 테스트
- Phase 14: README/API/ERD/runbook/demo/한계 문서 정리

Frontend는 아직 실제 사용자 화면이 아니라 placeholder입니다. 현재 데모와 검증은 backend API 중심으로 진행합니다.

## 로컬 개발환경 요구사항

```powershell
nvm install 24.16.0
nvm use 24.16.0
node -v

npm install --global corepack@latest
corepack enable pnpm
corepack prepare pnpm@10.12.1 --activate
pnpm.cmd -v
```

PowerShell에서 `pnpm.ps1` 실행이 막히면 `pnpm.cmd`를 사용합니다.

PostgreSQL 실행을 위해 Docker Desktop이 필요합니다. 로컬 데이터베이스는 `pgvector/pgvector:pg17` 이미지를 사용합니다.

## .env 설정

루트의 `.env.example`을 복사해서 `.env`를 만듭니다.

```powershell
Copy-Item .env.example .env
```

로컬 기본값으로 health check와 mock 기반 테스트를 실행할 수 있습니다. 실제 YouTube/OpenAI 연동 smoke test가 필요한 경우에만 `YOUTUBE_API_KEY`, `OPENAI_API_KEY`를 설정합니다.

`JWT_ACCESS_SECRET`과 `CSRF_SECRET`은 로컬에서도 임의의 긴 문자열로 바꿔두는 편이 좋습니다. 실제 secret과 API key는 commit하지 않습니다.

자세한 환경 변수와 실행 절차는 [Local Runbook](docs/operations/local_runbook.md)을 참고합니다.

## 초기 설정

```powershell
cd C:\Users\1472e\Desktop\jungle\AI-board\jiseob
pnpm.cmd install
pnpm.cmd db:up
pnpm.cmd --filter @arena/backend migration:run
```

## 개발 서버 실행

백엔드:

```powershell
pnpm.cmd dev:backend
```

Health check:

```text
http://localhost:3000/api/v1/health
http://localhost:3000/api/v1/health/db
```

프론트엔드 placeholder:

```powershell
pnpm.cmd dev:frontend
```

프론트엔드 기본 주소:

```text
http://localhost:5173
```

전체 서버를 한 번에 실행:

```powershell
pnpm.cmd dev
```

## 데이터베이스 / migration

PostgreSQL 실행:

```powershell
pnpm.cmd db:up
```

Migration 실행:

```powershell
pnpm.cmd --filter @arena/backend migration:run
```

PostgreSQL 중지:

```powershell
pnpm.cmd db:down
```

Docker 초기화 스크립트는 pgvector extension을 활성화합니다.

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

E2E는 기본적으로 `arena_e2e` DB를 사용하며, helper가 migration을 실행하고 application table을 truncate합니다. 자세한 안전장치는 [Local Runbook](docs/operations/local_runbook.md)의 E2E 전제를 확인합니다.

## 확인 명령

PostgreSQL이 켜진 상태에서 실행합니다.

```powershell
pnpm.cmd typecheck
pnpm.cmd --filter @arena/backend test --runInBand
pnpm.cmd test:e2e
pnpm.cmd lint
pnpm.cmd format:check
```

## 핵심 기능

- 회원가입, 로그인, refresh token cookie, JWT access token, CSRF 보호
- YouTube URL 기반 게시글 작성과 Video row 재사용
- 서버 내부 비동기 영상 metadata/transcript/embedding 처리
- 댓글/대댓글 작성, 최대 2단계 댓글 구조, soft delete placeholder
- 댓글 작성/수정 후 AI 댓글 유형 분석과 moderation 상태 관리
- FACT_CLAIM 댓글에 대한 자막 기반 RAG 근거 후보 검색
- MCP JSON-RPC endpoint와 Agent tool boundary
- MCP tool을 사용하는 Agent run 생성/조회
- 루트 댓글 스레드 단위 AI 요약 생성/조회
- 관리자 주의 필요 댓글 조회/삭제와 실패한 AI 댓글 분석 retry
- backend E2E 테스트 하네스

AI 분석, RAG, Agent는 토론 맥락 이해를 돕는 보조 기능입니다. RAG 결과는 관련 있을 수 있는 자막 구간 후보이며 사실 여부를 최종 판정하지 않습니다.

## API

주요 endpoint:

```http
POST   /api/v1/auth/signup
POST   /api/v1/auth/login
GET    /api/v1/users/me
GET    /api/v1/posts
POST   /api/v1/posts
GET    /api/v1/posts/:postId/comments
POST   /api/v1/posts/:postId/comments
GET    /api/v1/comments/:commentId/evidences
POST   /api/v1/mcp
POST   /api/v1/posts/:postId/agent/runs
GET    /api/v1/agent/runs/:runId
POST   /api/v1/comments/:rootCommentId/summary
GET    /api/v1/admin/comments
```

상세 인증/CSRF/응답 shape는 [Backend API](docs/api/backend_api.md)를 참고합니다.

## 관리자 계정

관리자 endpoint는 `UserRole.ADMIN`만 접근할 수 있습니다. Admin 생성 public API는 만들지 않습니다. 로컬/데모 환경에서는 DB에서 role을 수동으로 변경합니다.

```sql
UPDATE users
SET role = 'ADMIN'
WHERE email = 'admin@example.com'
  AND deleted_at IS NULL;
```

지원 API:

```http
GET    /api/v1/admin/comments?moderationStatus=NEEDS_REVIEW&page=1&limit=20
DELETE /api/v1/admin/comments/:commentId
POST   /api/v1/admin/comments/:commentId/analysis/retry
```

GET 목록은 `JwtAuthGuard + RolesGuard`, DELETE/retry POST는 `JwtAuthGuard + CsrfGuard + RolesGuard`를 사용합니다.

## shadcn/ui 사용 방식

컴포넌트를 추가할 때는 `frontend/components.json`을 기준으로 실행합니다.

```powershell
pnpm.cmd shadcn:add button
pnpm.cmd shadcn:add dialog
```

프론트엔드에서는 `@/components/ui` 경로로 가져옵니다.

```tsx
import { Button } from '@/components/ui/button';
```

## MVP 한계

- 서버 내부 비동기 작업은 서버 재시작 시 유실될 수 있습니다.
- Redis/BullMQ는 MVP 범위에서 제외했고, 운영 고도화 시 PostgreSQL jobs table 또는 Redis/BullMQ를 검토합니다.
- frontend UI는 placeholder입니다.
- YouTube transcript provider는 비공식 CLI 기반이라 차단이나 변경 위험이 있습니다.
- 자동 E2E는 외부 provider를 mock하며, 실제 provider smoke test는 별도 환경에서 수행해야 합니다.

자세한 내용은 [MVP 한계와 개선 방향](docs/implementation/mvp_limitations_and_next_steps.md)을 참고합니다.
