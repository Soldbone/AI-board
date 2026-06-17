# Local Runbook

> 목적: 처음 받는 사람이 로컬에서 Arena backend MVP를 실행하고 검증하는 절차를 정리한다.
> 기준: Phase 13 완료, frontend는 placeholder

---

## 1. 요구사항

```text
Node.js >= 24.16.0
pnpm >= 10.12.1
Docker Desktop
PowerShell
```

네이티브 backend(`pnpm.cmd dev:backend`)에서 실제 영상 자막 처리를 실행하려면 추가로 Python 3가 필요하다. Docker backend를 사용하면 Python과 transcript CLI는 이미지 안에 설치되므로 로컬 Python 설치가 필수는 아니다.

권장 준비:

```powershell
nvm install 24.16.0
nvm use 24.16.0
node -v

npm install --global corepack@latest
corepack enable pnpm
corepack prepare pnpm@10.12.1 --activate
pnpm.cmd -v
```

PowerShell에서 `pnpm.ps1` 실행이 막히면 `pnpm.cmd`를 사용한다.

---

## 2. 설치와 환경 변수

작업 루트:

```powershell
cd C:\Users\1472e\Desktop\jungle\AI-board\jiseob
pnpm.cmd install
Copy-Item .env.example .env
```

필수 로컬 기본값:

```env
NODE_ENV=development
PORT=3000
API_PREFIX=/api/v1
WEB_ORIGIN=http://localhost:5173

DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=arena
DATABASE_PASSWORD=arena_dev_password
DATABASE_NAME=arena
DATABASE_SSL=false

JWT_ACCESS_SECRET=replace-with-a-local-access-secret
REFRESH_TOKEN_EXPIRES_IN=7d
CSRF_SECRET=replace-with-a-local-csrf-secret
```

실 provider smoke test가 필요한 경우에만 설정:

```env
YOUTUBE_API_KEY=
OPENAI_API_KEY=
YOUTUBE_TRANSCRIPT_COMMAND=youtube_transcript_api
```

주의:

- 실제 API key를 문서, commit, 채팅에 남기지 않는다.
- `JWT_ACCESS_SECRET`, `CSRF_SECRET`은 로컬에서도 임의의 긴 문자열로 바꿔둔다.
- API key가 없어도 health check, unit test, E2E mock test는 가능하다.

---

## 2.1. Transcript CLI for Native Backend

`pnpm.cmd dev:backend`처럼 backend를 Windows에서 직접 실행하면 `youtube_transcript_api` CLI도 로컬에서 실행 가능해야 한다. 프로젝트는 Python 의존성을 `backend/requirements.txt`에 둔다.

권장 설치:

```powershell
cd C:\Users\1472e\Desktop\jungle\AI-board\jiseob
py -3 -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install --upgrade pip
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
backend\.venv\Scripts\youtube_transcript_api.exe --help
```

네이티브 backend가 venv 안의 CLI를 확실히 사용하게 하려면 `.env`에 절대 경로를 지정한다.

```env
YOUTUBE_TRANSCRIPT_COMMAND=C:\Users\1472e\Desktop\jungle\AI-board\jiseob\backend\.venv\Scripts\youtube_transcript_api.exe
```

PowerShell 세션에서만 임시로 PATH에 추가해도 된다.

```powershell
$env:Path = "C:\Users\1472e\Desktop\jungle\AI-board\jiseob\backend\.venv\Scripts;$env:Path"
pnpm.cmd dev:backend
```

`spawn youtube_transcript_api ENOENT`는 backend 프로세스가 이 CLI를 찾지 못한다는 뜻이다. 위 `--help` 명령과 `.env`의 `YOUTUBE_TRANSCRIPT_COMMAND`를 먼저 확인한다.

---

## 3. PostgreSQL / pgvector

PostgreSQL만 실행:

```powershell
pnpm.cmd db:up
```

상태 확인:

```powershell
docker compose ps
docker compose logs postgres
```

중지:

```powershell
pnpm.cmd db:down
```

DB 초기화 스크립트는 pgvector extension을 만든다.

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## 4. Migration

로컬 DB에 migration 적용:

```powershell
pnpm.cmd --filter @arena/backend migration:run
```

주의:

- TypeORM `synchronize`는 꺼져 있다.
- migration은 `backend/src/database/migrations` 기준이다.
- E2E는 별도 `arena_e2e` 계열 DB에 migration을 자동 실행한다.

---

## 5. 개발 서버 실행

Backend:

```powershell
pnpm.cmd dev:backend
```

Health check:

```text
http://localhost:3000/api/v1/health
http://localhost:3000/api/v1/health/db
```

Frontend placeholder:

```powershell
pnpm.cmd dev:frontend
```

Frontend 주소:

```text
http://localhost:5173
```

Backend와 frontend를 한 번에 실행:

```powershell
pnpm.cmd dev
```

---

## 6. Docker backend 실행

PostgreSQL과 backend container를 함께 실행:

```powershell
docker compose up -d --build backend
```

Docker backend image에는 transcript 처리용 Python venv와 `backend/requirements.txt` 기반 `youtube-transcript-api` CLI가 포함된다.

```powershell
docker compose exec backend youtube_transcript_api --help
```

---

## 7. 검증 명령

권장 최종 검증:

```powershell
pnpm.cmd typecheck
pnpm.cmd --filter @arena/backend test --runInBand
pnpm.cmd test:e2e
pnpm.cmd lint
pnpm.cmd format:check
```

E2E 전제:

- `pnpm.cmd db:up`으로 PostgreSQL이 켜져 있어야 한다.
- 기본 E2E DB 이름은 `arena_e2e`다.
- E2E helper는 `NODE_ENV=test`와 `arena_e2e` 계열 DB 이름일 때만 DB truncate를 수행한다.
- YouTube/OpenAI/LangChain provider는 Nest testing module에서 deterministic mock으로 override된다.

---

## 8. API key 없이 가능한 검증

가능:

- `/health`, `/health/db`
- signup/login/users/me
- 게시글/댓글 CRUD의 HTTP 정책
- unit test
- E2E mock test
- provider mock 기반 AI 분석/RAG/요약/Agent 정책 검증

제한:

- 실제 YouTube metadata 조회
- 실제 transcript CLI 실행 환경 검증
- 실제 OpenAI embedding/comment analysis/Agent/summary 호출

---

## 9. 실 provider smoke test 구분

실 provider smoke test는 자동 E2E와 분리한다.

필요 조건:

- `.env`에 `YOUTUBE_API_KEY`, `OPENAI_API_KEY` 설정
- transcript CLI 설치 또는 Docker backend 사용
- 외부 네트워크 접근 가능
- 비용과 rate limit을 감수할 수 있는 환경

권장 smoke 흐름:

1. `/auth/signup`, `/auth/login`으로 사용자 생성 및 token 확보
2. `/posts`로 YouTube URL 게시글 생성
3. `/videos/:videoId`로 metadata/transcript/embedding 상태 확인
4. 사실 주장 댓글 작성
5. `/comments/:commentId/evidences`로 근거 후보 상태 확인

실 provider smoke 실패는 기능 회귀와 구분한다. API key, 외부 provider 상태, transcript provider 차단 가능성을 먼저 확인한다.

---

## 10. 관리자 계정 준비

Admin 생성 API는 없다. 로컬/데모에서는 signup 후 DB에서 role을 변경한다.

```sql
UPDATE users
SET role = 'ADMIN'
WHERE email = 'admin@example.com'
  AND deleted_at IS NULL;
```

관리자 state-changing API는 일반 REST 정책과 동일하게 Bearer access token과 CSRF header를 요구한다.
