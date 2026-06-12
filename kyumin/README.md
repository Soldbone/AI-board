# Potato maker

게임랩 학생들이 게임 아이디어와 직접 만든 게임 링크를 공유하고, 댓글/별점과 AI 피드백을 받을 수 있는 React + FastAPI 게시판 프로젝트입니다.

## 프로젝트 개요

- 목적: 게임 아이디어와 웹 게임 결과물을 한곳에 모아 서로 피드백하고, AI로 유사 글/유사 게임/개선 제안을 빠르게 확인합니다.
- 주요 사용자: 게임랩 학생, 미니게임 제작자, 다른 학생의 아이디어에 의견을 남기는 사용자.
- 해결하려는 문제: 아이디어 중복 확인, 기존 게임 비교, 구현 난이도와 개선점 정리를 게시판 흐름 안에서 처리합니다.

## 주요 구현 기능

- 회원가입/로그인: 이메일과 비밀번호로 가입하고, MVP에서는 인증코드를 서버 콘솔에 출력합니다.
- 회원 정보: 닉네임 수정, OpenAI API Key 등록/삭제, 회원 탈퇴를 지원합니다.
- 게시판: 게임 아이디어 게시판과 게임 리뷰 게시판을 탭으로 구분합니다.
- 게시글: 목록, 검색, 페이징, 작성, 상세, 수정, 삭제를 제공합니다.
- 댓글: 아이디어 게시판은 일반 댓글, 리뷰 게시판은 별점/좋았던 점/아쉬운 점/개선 제안을 함께 저장합니다.
- 태그/미디어: 게시글 태그와 리뷰 게시글의 게임 URL, 영상 URL, 이미지 URL을 저장합니다.
- RAG: 글 작성 중 제목 옆 `미리확인` 버튼으로 관련 게시글 3개를 추천합니다.
- MCP: 아이디어 상세에서 Video Games MCP Server를 호출해 비슷한 기존 게임을 최대 5개 보여줍니다.
- Agent: 아이디어 상세에서 RAG/MCP 결과를 참고해 한 줄 요약, 차별점, 난이도, 개선 제안 3개를 생성합니다.

## 전체 아키텍처

```txt
React 정적 프론트엔드
  -> FastAPI Backend
  -> PostgreSQL + pgvector

FastAPI Backend
  -> OpenAI Embeddings API
  -> OpenAI Text Model

FastAPI Backend
  -> stdio JSON-RPC
  -> BaranDev Video Games MCP Server
  -> RAWG Video Games Database API
```

프론트엔드는 React UMD, JavaScript, 기본 CSS, 브라우저 `fetch`만 사용합니다. 라우팅 라이브러리 없이 React state로 로그인, 게시판, 글쓰기, 상세, 마이페이지 화면을 전환합니다.

백엔드는 FastAPI 라우터를 `/auth`, `/users/me`, `/posts`, `/comments`, `/tags`, `/ai` 단위로 나누고, SQLAlchemy로 PostgreSQL에 접근합니다.

## AI 활용 구조

### RAG

1. 사용자가 글쓰기 화면에서 제목을 입력합니다.
2. `미리확인` 버튼을 누릅니다.
3. 백엔드가 사용자 OpenAI API Key로 제목 embedding을 생성합니다.
4. 기존 게시글 후보 중 embedding이 없는 글을 현재 사용자 Key로 backfill합니다.
5. PostgreSQL `pgvector` cosine distance로 관련 게시글 3개를 반환합니다.

### MCP

1. 사용자가 아이디어 게시글을 저장합니다.
2. 상세 화면에서 `비슷한 기존 게임` 조회 버튼을 누릅니다.
3. 백엔드가 BaranDev Video Games MCP Server를 로컬 Python 프로세스로 실행합니다.
4. stdio transport로 JSON-RPC `initialize`, `notifications/initialized`, `tools/call`을 주고받습니다.
5. MCP 서버가 RAWG API를 조회하고, 백엔드는 이름/출시일/평점/플랫폼/장르/이미지를 최대 5개로 정리합니다.

참고 MCP 서버: [BaranDev/videogames-mcp-server](https://github.com/BaranDev/videogames-mcp-server)

### Agent

1. 사용자가 아이디어 상세 화면에서 `AI 분석` 버튼을 누릅니다.
2. Agent가 최대 3단계 안에서 RAG 결과와 최신 MCP 결과를 수집합니다.
3. OpenAI 텍스트 모델이 아이디어 요약, 차별점, 구현 난이도, 개선 제안 3개를 JSON으로 생성합니다.
4. 결과는 `ai_analysis_results`에 저장하고 화면에 표시합니다.

## 실행 방법

### 1. Python 의존성 설치

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

프론트엔드는 `frontend/index.html`에서 React UMD CDN을 사용하므로 별도 npm 설치가 없습니다.

### 2. PostgreSQL 준비

PostgreSQL에 `potato_maker` DB를 만들고 pgvector 확장을 사용할 수 있어야 합니다.

Docker Desktop을 사용한다면 아래 명령이 가장 간단합니다.

```bash
docker compose up -d db
```

Docker를 쓰지 않고 로컬 PostgreSQL을 직접 쓰는 경우:

```bash
createdb potato_maker
psql -d potato_maker -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

이미 DB가 있다면 위 DB 생성 명령은 건너뛰어도 됩니다. Docker를 사용할 때는 `docker-compose.yml`의 로컬 개발용 계정 `postgres/postgres`와 `.env.example`의 `DATABASE_URL`이 맞춰져 있습니다.

### 3. 환경변수 설정

```bash
cp .env.example .env
```

`.env`에서 아래 값을 채웁니다. 실제 비밀값은 README나 코드에 쓰지 않습니다.

```bash
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/potato_maker
JWT_SECRET=직접_생성한_문자열
API_KEY_ENCRYPTION_SECRET=Fernet_키
OPENAI_MODEL=gpt-5-nano
EMBEDDING_MODEL=text-embedding-3-small
RAWG_API_KEY=RAWG_API_Key
VIDEO_GAMES_MCP_COMMAND=/절대경로/videogames-mcp-server/.venv/bin/python
VIDEO_GAMES_MCP_ARGS=/절대경로/videogames-mcp-server/main.py
VIDEO_GAMES_MCP_CWD=/절대경로/videogames-mcp-server
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

비밀값 생성 예시:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### 4. DB 마이그레이션

```bash
alembic upgrade head
```

### 5. 데모 데이터 넣기

```bash
python scripts/seed_demo_data.py
```

생성되는 데모 계정:

- `demo@example.com` / `password123`
- `reviewer@example.com` / `password123`

### 6. 백엔드 서버 실행

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

헬스 체크:

```bash
curl http://127.0.0.1:8000/health
```

### 7. 프론트엔드 서버 실행

다른 터미널에서 실행합니다.

```bash
python3 -m http.server 5173 --directory frontend --bind 127.0.0.1
```

브라우저에서 엽니다.

```txt
http://127.0.0.1:5173
```

## MCP 서버 준비

MCP 기능을 실제로 테스트하려면 BaranDev 서버를 별도 폴더에 설치합니다.

```bash
git clone https://github.com/BaranDev/videogames-mcp-server.git
cd videogames-mcp-server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

MCP 서버 `.env`에는 `RAWG_API_KEY`를 넣습니다. 이 프로젝트의 `.env`에는 MCP 서버의 Python 실행 파일, `main.py`, 작업 폴더 절대경로를 `VIDEO_GAMES_MCP_COMMAND`, `VIDEO_GAMES_MCP_ARGS`, `VIDEO_GAMES_MCP_CWD`로 넣습니다.

## 테스트

```bash
pytest
```

테스트 범위:

- 인증, 현재 사용자 조회, 닉네임 수정, API Key 암호화 저장.
- 게시글 목록/검색/작성, 댓글, 리뷰 별점, 작성자 권한 체크.
- RAG/MCP/Agent 라우터 응답 형식. 외부 OpenAI/RAWG 호출은 mock으로 대체합니다.

## 데모 시나리오

### 시나리오 1: 게임 아이디어와 AI 피드백

1. `demo@example.com`으로 로그인합니다.
2. 마이페이지에서 본인의 OpenAI API Key를 등록합니다.
3. 게임 아이디어 게시판에서 글쓰기를 누릅니다.
4. 제목에 `감자를 키우는 로그라이크`처럼 입력하고 `미리확인`으로 RAG 추천을 확인합니다.
5. 글을 저장한 뒤 상세 화면으로 이동합니다.
6. `비슷한 기존 게임` 조회 버튼으로 MCP 결과를 확인합니다.
7. `AI 분석` 버튼으로 Agent 분석 결과를 확인합니다.

### 시나리오 2: 게임 리뷰와 별점 댓글

1. 게임 리뷰 게시판으로 이동합니다.
2. 게임 URL, 영상 URL, 이미지 URL, 설명을 입력해 리뷰 글을 저장합니다.
3. 다른 계정으로 로그인해 별점과 리뷰 댓글을 남깁니다.
4. 상세 화면에서 평균 별점과 리뷰 개수를 확인합니다.

## 주요 API

- `POST /auth/register/request-code`
- `POST /auth/register/verify`
- `POST /auth/login`
- `GET /auth/me`
- `PATCH /users/me/nickname`
- `GET /users/me/api-key`
- `PUT /users/me/api-key`
- `DELETE /users/me/api-key`
- `GET /posts`
- `POST /posts`
- `GET /posts/{post_id}`
- `PATCH /posts/{post_id}`
- `DELETE /posts/{post_id}`
- `POST /posts/{post_id}/comments`
- `PATCH /comments/{comment_id}`
- `DELETE /comments/{comment_id}`
- `POST /ai/rag/recommend-posts`
- `POST /ai/mcp/similar-games`
- `POST /ai/agent/review-idea`

## 회고와 한계점

- 배운 점: React state만으로도 게시판 화면 흐름을 만들 수 있고, FastAPI dependency override를 사용하면 외부 API 없이 핵심 API를 테스트할 수 있습니다.
- 어려웠던 점: RAG, MCP, Agent가 모두 API Key와 외부 서비스에 의존하므로 실패 상태와 mock 테스트를 분리해야 했습니다.
- 한계점: 이메일 인증은 실제 SMTP가 아니라 서버 콘솔 출력입니다. 게임 URL/영상/사진 자체를 AI가 분석하는 기능은 MVP에서 보류했습니다. Steam 출시 여부는 필수 검증이 아니라 가능한 경우의 보조 정보입니다.
- 개선 아이디어: SMTP 발송, 관리자 화면, 이미지 파일 업로드, AI 결과 재조회 UI, CI 테스트 자동화, Docker Compose 기반 PostgreSQL 실행 스크립트를 추가하면 제출과 배포가 더 안정적입니다.
