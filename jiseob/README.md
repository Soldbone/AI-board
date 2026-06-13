# Arena

AI 기반 유튜브 이슈 토론 게시판 MVP입니다.

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

YOUTUBE_TRANSCRIPT_COMMAND=youtube_transcript_api
TRANSCRIPT_LANGUAGES=ko,en
TRANSCRIPT_CHUNK_SIZE=1000
TRANSCRIPT_CHUNK_OVERLAP=200
```

`JWT_ACCESS_SECRET`과 `CSRF_SECRET`은 로컬에서도 임의의 긴 문자열로 바꿔두는 편이 좋습니다. `YOUTUBE_API_KEY`, `OPENAI_API_KEY`는 Phase 1 health check에는 필요하지 않고, 영상 처리나 AI 기능을 붙일 때 설정하면 됩니다.

Phase 6 영상 처리에서는 `youtube-transcript-api` Python CLI를 transcript provider로 사용할 계획입니다. 로컬에서 직접 backend를 실행한다면 Python 환경에 CLI를 설치해야 하고, Docker 실행 환경에서는 backend 이미지에 Python과 `youtube-transcript-api`를 설치해 컨테이너 안에서 `youtube_transcript_api` 명령을 실행할 수 있게 합니다.

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
pnpm.cmd lint
pnpm.cmd format:check
```

## 다음 구현 순서

`AGENTS.md`와 `docs/implementation/arena_implementation_plan.md` 기준으로 Phase 5까지 완료되었고, 다음 단계는 Phase 6 영상 메타데이터 / 자막 / 임베딩 처리입니다.

1. Phase 5 브랜치 push 및 Phase 6 작업 브랜치 생성
2. backend Docker 구성에 Python과 `youtube-transcript-api` CLI 설치 추가
3. YouTube Data API v3 metadata adapter 구현
4. `youtube-transcript-api` CLI transcript adapter 구현
5. TranscriptChunk / pgvector migration 추가
6. OpenAI embeddings adapter 구현
7. 게시글 작성 직후 video processing 자동 트리거 연결
8. 영상 처리 retry API와 실패 상태 문서화
