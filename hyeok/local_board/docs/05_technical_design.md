# 기술설계서

## 1. 문서 목적

이 문서는 Local Board의 기술 스택, 폴더 구조, 백엔드/프론트엔드/MCP 서버의 역할, 주요 설계 결정을 정리합니다.

## 2. 기술 스택

### Frontend

| 기술 | 역할 |
| --- | --- |
| React | 화면 구성 |
| TypeScript | 타입 안정성 |
| Tailwind CSS | UI 스타일링 |
| Vite | 개발 서버와 빌드 |

### Backend

| 기술 | 역할 |
| --- | --- |
| FastAPI | REST API 서버 |
| SQLAlchemy | ORM |
| Pydantic | 요청/응답 스키마 |
| JWT | 인증 |
| passlib/bcrypt | 비밀번호 해싱 |

### Database

| 기술 | 역할 |
| --- | --- |
| PostgreSQL | 관계형 데이터 저장 |
| Docker Compose | 개발 DB 실행 |

### AI

| 기술 | 역할 |
| --- | --- |
| kiwipiepy | 한국어 명사 추출 |
| RAG | 내부 게시글/댓글 기반 검색 |
| LangChain | Agent 구성 |
| OpenAI Chat Model | Agent 판단과 요약 |
| MCP | 외부 도구 호출 프로토콜 |
| Naver Search API | 장소 검색 |

## 3. 전체 구조

```text
local_board
├─ backend
│  ├─ app
│  │  ├─ models
│  │  ├─ schemas
│  │  ├─ routers
│  │  ├─ services
│  │  ├─ core
│  │  ├─ database.py
│  │  ├─ config.py
│  │  └─ main.py
│  ├─ scripts
│  └─ requirements.txt
├─ frontend
│  ├─ src
│  │  ├─ api
│  │  ├─ pages
│  │  ├─ utils
│  │  └─ App.tsx
│  └─ package.json
├─ mcp_server
│  ├─ server.py
│  ├─ naver_client.py
│  ├─ config.py
│  └─ requirements.txt
├─ docs
└─ docker-compose.yml
```

## 4. Backend 계층 구조

### Router

HTTP 요청을 받는 계층입니다.

예:

- `routers/auth.py`
- `routers/posts.py`
- `routers/comments.py`
- `routers/ai.py`
- `routers/agent.py`

역할:

```text
요청 받기
→ 인증/의존성 주입
→ service 또는 DB 로직 호출
→ 응답 반환
```

### Schema

요청과 응답의 데이터 모양을 정의합니다.

예:

- `schemas/post.py`
- `schemas/comment.py`
- `schemas/ai.py`
- `schemas/agent.py`

역할:

```text
요청 데이터 검증
응답 데이터 형식 고정
Swagger 문서 자동화
```

### Model

DB 테이블 구조를 Python 클래스로 정의합니다.

예:

- `models/user.py`
- `models/post.py`
- `models/comment.py`
- `models/tag.py`

### Service

비즈니스 로직과 외부 연동 로직을 담당합니다.

예:

- `services/rag_service.py`
- `services/agent_service.py`
- `services/mcp_client_service.py`

## 5. 인증 설계

### JWT 선택 이유

- React와 FastAPI가 분리된 구조에서 사용하기 쉽습니다.
- 서버가 로그인 세션을 별도로 저장하지 않아도 됩니다.
- 인증이 필요한 API에서 토큰 검증만으로 사용자 식별이 가능합니다.

### 인증 흐름

```text
회원가입
→ 비밀번호 해싱 저장
→ 로그인
→ JWT 발급
→ 프론트엔드 토큰 저장
→ 인증 필요 API 호출 시 Bearer Token 전송
→ 백엔드가 토큰 검증 후 current_user 생성
```

## 6. 게시글 설계

게시글은 지역, 가게명, 분류를 함께 저장합니다.

이유:

- 지역은 AI 장소 추천과 검색에 사용됩니다.
- 가게명은 RAG에서 같은 가게 글만 추천하기 위한 핵심 기준입니다.
- 분류는 검색, 태그 추천, AI 키워드 생성에 사용됩니다.

## 7. 댓글 설계

댓글은 `parent_id`를 통해 대댓글 구조를 가집니다.

삭제 정책:

- 대화 흐름을 유지하기 위해 댓글 row를 바로 삭제하지 않습니다.
- 삭제된 댓글은 작성자와 내용을 숨기고 삭제 표시만 남깁니다.

## 8. RAG 설계

현재 RAG는 다음 필드를 검색 문맥으로 사용합니다.

```text
게시글 제목
게시글 본문
지역
가게명
분류
태그
댓글 일부
```

핵심 규칙:

- `kiwipiepy`로 명사 중심 키워드를 추출합니다.
- 불용어를 제거합니다.
- 가게명이 있으면 같은 가게명이 포함된 글만 추천 후보로 사용합니다.
- 제목, 가게명, 태그는 본문보다 높은 가중치를 가집니다.

## 9. Agent 설계

Agent는 LangChain 기반으로 구성합니다.

역할:

```text
사용자 요청 해석
→ RAG 기반 DB 평가 문맥 참고
→ 필요 시 MCP 장소 검색 도구 호출
→ DB 평가 + 장소 추천 반환
```

안정성:

- Agent 응답이 없거나 실패하면 MCP 직접 검색으로 fallback합니다.
- 타임아웃을 설정해 무한 대기를 방지합니다.

## 10. MCP 설계

MCP 서버는 백엔드와 분리된 별도 프로세스로 실행됩니다.

도구:

- `health_check`
- `make_map_search_url`
- `search_local_places`

MCP 서버가 담당하는 외부 API:

- Naver Local Search API
- Naver Image Search API

## 11. 환경변수 관리

### backend/.env

```text
DATABASE_URL=
SECRET_KEY=
OPENAI_API_KEY=
OPENAI_AGENT_MODEL=
OPENAI_AGENT_TIMEOUT_SECONDS=
```

### mcp_server/.env

```text
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
NAVER_LOCAL_SEARCH_URL=
NAVER_IMAGE_SEARCH_URL=
```

주의:

- `.env` 파일은 Git에 올리지 않습니다.
- API Key는 코드에 직접 작성하지 않습니다.

## 12. 주요 설계 결정

| 결정 | 이유 |
| --- | --- |
| React + FastAPI + PostgreSQL | 학습 난이도와 구현 속도, 포트폴리오 활용성 균형 |
| JWT 인증 | 프론트/백엔드 분리 구조에 적합 |
| 댓글 삭제 표시 | 대화 흐름 유지 |
| 가게명 기반 RAG 후보 제한 | 지역 키워드만으로 다른 가게 글이 섞이는 문제 해결 |
| MCP 서버 분리 | Agent가 외부 도구를 호출하는 구조를 명확히 보여주기 위함 |
| fallback 처리 | AI/MCP 실패 시에도 사용자에게 최소 결과 제공 |
