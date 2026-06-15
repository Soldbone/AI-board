# Arena

AI 기반 유튜브 이슈 토론 게시판 MVP입니다.

현재 백엔드는 Phase 12까지 구현되어 있습니다. 게시글/댓글/영상 처리/RAG 근거 후보/MCP Agent Tool Server, AI Agent 추론 루프, 댓글 스레드 요약 API, 관리자 댓글 관리 API가 준비되어 있고, 다음 단계는 Phase 13 E2E 테스트 정리입니다. 프론트엔드는 아직 placeholder 화면입니다.

## 기술 스택

- 런타임: Node.js 24.16.0
- 패키지 매니저: pnpm 10.12.1
- 백엔드: NestJS, TypeScript, TypeORM
- 프론트엔드: React, Vite, TypeScript
- UI: shadcn/ui, `frontend` 내부 컴포넌트로 관리
- 데이터베이스: PostgreSQL 17 + pgvector

## 폴더 구조

```text
jiseob/
  frontend/           React/Vite 프론트엔드
  backend/            NestJS 백엔드
  docker/             PostgreSQL 초기화 스크립트
  docs/               구현 참고 문서
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

Phase 13 구현자는 `AGENTS.md`와 `docs/implementation/project_progress_audit_20260615.md`를 먼저 읽으면 됩니다.

## 로컬 개발환경 요구사항

먼저 로컬에서 Node.js와 pnpm을 준비합니다.

```powershell
nvm install 24.16.0
nvm use 24.16.0
node -v

npm install --global corepack@latest
corepack enable pnpm
corepack prepare pnpm@10.12.1 --activate
pnpm -v
```

PowerShell에서 `pnpm.ps1` 실행이 막히면 같은 명령을 `pnpm.cmd`로 실행하거나, 현재 사용자 범위에서 로컬 스크립트 실행을 허용합니다.

```powershell
pnpm.cmd -v
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

PostgreSQL 실행을 위해 Docker Desktop이 필요합니다. 로컬 데이터베이스는 `pgvector/pgvector:pg17` 이미지를 사용합니다.

## .env 설정

루트의 `.env.example`을 복사해서 `.env`를 만듭니다.

```powershell
Copy-Item .env.example .env
```

로컬 개발에서는 기본값으로 바로 시작할 수 있습니다.

```env
NODE_ENV=development
PORT=3000
API_PREFIX=/api/v1

WEB_ORIGIN=http://localhost:5173

POSTGRES_USER=arena
POSTGRES_PASSWORD=arena_dev_password
POSTGRES_DB=arena
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=arena
DATABASE_PASSWORD=arena_dev_password
DATABASE_NAME=arena
DATABASE_SSL=false

JWT_ACCESS_SECRET=replace-with-a-local-access-secret
JWT_ACCESS_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d
CSRF_SECRET=replace-with-a-local-csrf-secret

YOUTUBE_API_KEY=
OPENAI_API_KEY=
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSION=1536
COMMENT_ANALYSIS_MODEL=gpt-4.1-mini
COMMENT_ANALYSIS_TIMEOUT_MS=8000
AGENT_MODEL=gpt-4.1-mini
AGENT_TIMEOUT_MS=30000
AGENT_MAX_OUTPUT_TOKENS=1200
SUMMARY_MODEL=gpt-4.1-mini
SUMMARY_TIMEOUT_MS=30000
SUMMARY_MAX_OUTPUT_TOKENS=900
SUMMARY_MAX_INPUT_CHARS=700

YOUTUBE_TRANSCRIPT_COMMAND=youtube_transcript_api
TRANSCRIPT_LANGUAGES=ko,en
TRANSCRIPT_CHUNK_SIZE=1000
TRANSCRIPT_CHUNK_OVERLAP=200
```

`JWT_ACCESS_SECRET`과 `CSRF_SECRET`은 로컬에서도 임의의 긴 문자열로 바꿔두는 편이 좋습니다. `YOUTUBE_API_KEY`, `OPENAI_API_KEY`는 health check에는 필요하지 않지만 영상 metadata, embedding, 댓글 분석, RAG, MCP tool, Agent, 요약 smoke test에는 필요합니다.

영상 처리에서는 `youtube-transcript-api` Python CLI를 transcript provider로 사용합니다. 로컬에서 직접 backend를 실행한다면 Python 환경에 CLI를 설치해야 하고, Docker 실행 환경에서는 backend 이미지에 Python과 `youtube-transcript-api`를 설치해 컨테이너 안에서 `youtube_transcript_api` 명령을 실행할 수 있게 합니다.

## 초기 설정

```powershell
cd C:\Users\1472e\Desktop\jungle\AI-board\jiseob
pnpm.cmd install
pnpm.cmd db:up
```

## 개발 서버 실행

백엔드 서버를 실행합니다.

```powershell
pnpm.cmd dev:backend
```

백엔드가 켜져 있을 때 health check 주소에 접근할 수 있습니다.

- `http://localhost:3000/api/v1/health`

프론트엔드 서버는 별도 터미널에서 실행합니다.

```powershell
pnpm.cmd dev:frontend
```

프론트엔드 기본 주소는 다음과 같습니다.

- `http://localhost:5173`

전체 서버를 한 번에 실행할 수도 있습니다.

```powershell
pnpm.cmd dev
```

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

## 데이터베이스

PostgreSQL을 실행합니다.

```powershell
pnpm.cmd db:up
```

PostgreSQL과 backend 컨테이너를 함께 실행할 수도 있습니다. backend 이미지에는 Phase 6 영상 자막 처리를 위한 Python과 `youtube-transcript-api` CLI가 포함됩니다.

```powershell
docker compose up -d backend
```

backend 컨테이너 안에서 transcript CLI가 설치됐는지 확인합니다.

```powershell
docker compose exec backend youtube_transcript_api --help
```

PostgreSQL을 중지합니다.

```powershell
pnpm.cmd db:down
```

Docker 초기화 스크립트는 pgvector extension을 활성화합니다.

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## 확인 명령

```powershell
pnpm.cmd typecheck
pnpm.cmd --filter @arena/backend test --runInBand
pnpm.cmd lint
pnpm.cmd format:check
```

## MCP Agent Tool Server

MCP endpoint는 일반 사용자 공개 REST API가 아니라 AI Agent가 호출할 tool boundary입니다.

```http
POST /api/v1/mcp
Authorization: Bearer <accessToken>
```

지원 method:

- `tools/list`
- `tools/call`

등록된 tool:

- `post.getContext`
- `video.getProcessingStatus`
- `video.retryProcessing`
- `transcript.searchChunks`
- `youtube.fetchMetadata`

Phase 9.5 이후 `tools/list`는 `{ tools: [...] }`를 반환하고, `tools/call`은 `content`, `structuredContent`, `isError`를 포함한 MCP tool result를 반환합니다. malformed request, unknown method, unknown tool 같은 protocol 오류만 JSON-RPC error envelope로 반환하고, provider/business failure는 정제된 `isError: true` tool result로 반환합니다.

## AI Agent

Agent endpoint는 게시글 상세 화면의 토론 보조자 역할을 합니다.

```http
POST /api/v1/posts/:postId/agent/runs
GET  /api/v1/agent/runs/:runId
```

Agent는 `post.getContext`, `video.getProcessingStatus`, `transcript.searchChunks`, `youtube.fetchMetadata`를 기본 allowlist로 사용합니다. 사용자를 대신해 게시글이나 댓글을 작성하지 않고, 근거 후보와 한계를 함께 설명합니다.

## 댓글 스레드 요약

댓글 스레드 요약은 루트 댓글과 직계 대댓글이 충분히 길 때 사용자가 요청해서 생성합니다.

```http
POST /api/v1/comments/:rootCommentId/summary
GET  /api/v1/comments/:rootCommentId/summary
```

생성 API는 로그인 사용자와 CSRF를 요구하고, 조회 API는 비회원도 기존 요약을 볼 수 있습니다. 삭제되지 않은 댓글 수가 10개 미만이면 요약을 생성하지 않습니다.

## 관리자 기능

관리자 endpoint는 `UserRole.ADMIN`만 접근할 수 있습니다. Phase 12에서는 admin 생성 API를 만들지 않고, 로컬/데모 환경에서는 DB에서 role을 수동으로 변경합니다.

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

목록 조회는 `JwtAuthGuard + RolesGuard`를 사용하고, DELETE/retry POST는 `JwtAuthGuard + CsrfGuard + RolesGuard`를 사용합니다.

## 다음 구현 순서

`AGENTS.md`와 `docs/implementation/arena_implementation_plan.md` 기준으로 Phase 12 관리자 기능까지 구현되었습니다.

다음 단계는 Phase 13 E2E 테스트 정리입니다.

1. 정책형 E2E 테스트 범위 확정
2. 인증/CSRF/권한 실패 케이스 정리
3. 게시글/댓글/영상 처리/AI API 주요 happy path 정리
4. 테스트 실행 환경과 fixture 전략 문서화
