# 실행 / 배포 가이드

## 1. 문서 목적

이 문서는 Local Board 프로젝트를 로컬에서 실행하고, 추후 배포할 때 필요한 구성 요소를 정리합니다.

## 2. 실행 구성 요소

로컬 개발 환경에서는 다음 4개 구성 요소가 필요합니다.

| 구성 요소 | 설명 |
| --- | --- |
| PostgreSQL | 게시글/댓글/사용자 데이터 저장 |
| FastAPI Backend | REST API 서버 |
| React Frontend | 사용자 화면 |
| MCP Server | Agent가 호출하는 외부 장소 검색 도구 서버 |

## 3. 환경변수

### backend/.env

```text
DATABASE_URL=postgresql://local_board:local_board_pw@localhost:5432/local_board_db
SECRET_KEY=your-secret-key
OPENAI_API_KEY=your-openai-api-key
OPENAI_AGENT_MODEL=gpt-4o-mini
OPENAI_AGENT_TIMEOUT_SECONDS=12
```

### mcp_server/.env

```text
NAVER_CLIENT_ID=your-naver-client-id
NAVER_CLIENT_SECRET=your-naver-client-secret
NAVER_LOCAL_SEARCH_URL=https://openapi.naver.com/v1/search/local.json
NAVER_IMAGE_SEARCH_URL=https://openapi.naver.com/v1/search/image
```

주의:

- `.env` 파일은 Git에 커밋하지 않습니다.
- API Key는 코드에 직접 작성하지 않습니다.

## 4. PostgreSQL 실행

위치:

```text
local_board/docker-compose.yml
```

명령:

```powershell
docker compose up -d
```

확인:

```powershell
docker ps
```

## 5. Backend 실행

위치:

```text
local_board/backend
```

가상환경 활성화:

```powershell
.\.venv\Scripts\Activate.ps1
```

패키지 설치:

```powershell
python -m pip install -r requirements.txt
```

서버 실행:

```powershell
python -m uvicorn app.main:app --reload
```

확인:

```text
http://127.0.0.1:8000/docs
```

## 6. Frontend 실행

위치:

```text
local_board/frontend
```

패키지 설치:

```powershell
npm install
```

개발 서버 실행:

```powershell
npm run dev
```

확인:

```text
http://localhost:5173
```

## 7. MCP 서버

현재 백엔드의 `mcp_client_service.py`는 MCP 서버 스크립트를 stdio 방식으로 실행하도록 구성되어 있습니다.

즉, 일반 사용 흐름에서는 MCP 서버를 사용자가 별도로 터미널에서 계속 켜둘 필요 없이, 백엔드가 Agent 실행 시 MCP 서버 스크립트를 호출합니다.

단독 테스트가 필요하면 `mcp_server/manual_test.py`를 사용할 수 있습니다.

## 8. 테스트데이터 생성

실제 가게명 기반 테스트데이터 생성:

```powershell
cd C:\jungle6\week15\hyeok\local_board\backend
.\.venv\Scripts\python.exe scripts\seed_real_place_test_data.py
```

생성 결과:

| 지역 | 게시글 수 |
| --- | ---: |
| 용인 처인구 | 50 |
| 창원 성산구 | 100 |
| 사당역 | 100 |

주의:

- 기존 게시글/댓글/태그 데이터가 삭제됩니다.
- 실제 가게명은 네이버 지역검색 API로 수집합니다.
- 댓글은 발표용 샘플 데이터입니다.

## 9. 로컬 검증 명령

### Backend 문법 검사

```powershell
cd C:\jungle6\week15\hyeok\local_board\backend
python -m compileall app
```

### RAG 테스트

```powershell
.\.venv\Scripts\python.exe scripts\check_rag_flow.py
```

### Frontend 빌드

```powershell
cd C:\jungle6\week15\hyeok\local_board\frontend
npm run build
```

## 10. 배포 시 고려사항

### 단일 EC2 배포 예시

소규모 발표용 배포는 EC2 한 대에서 다음을 함께 실행할 수 있습니다.

```text
Nginx
React build 정적 파일
FastAPI backend
PostgreSQL
MCP server script
```

### 실서비스 확장 구조

트래픽을 더 고려한다면 다음처럼 분리합니다.

```text
Frontend: S3 + CloudFront
Backend: EC2 또는 ECS
Database: RDS PostgreSQL
MCP Server: 별도 EC2 또는 컨테이너
Cache: Redis
Reverse Proxy: Nginx
```

## 11. 10만 트래픽 고려 시 개선점

| 영역 | 개선 방향 |
| --- | --- |
| Backend | Gunicorn/Uvicorn worker 구성 |
| DB | RDS 분리, 인덱스 최적화, connection pool |
| RAG | 검색 결과 캐싱, pgvector 인덱스 |
| Agent | 요청 제한, 결과 캐싱, 큐 기반 비동기 처리 |
| MCP | 별도 서버/컨테이너로 분리 |
| Frontend | CDN 적용 |

## 12. 배포 전 체크리스트

| 항목 | 확인 |
| --- | --- |
| `.env` 커밋 여부 확인 | 필요 |
| API Key 노출 확인 | 필요 |
| CORS 운영 도메인 설정 | 필요 |
| DB 초기 데이터 준비 | 필요 |
| README 실행 방법 검증 | 필요 |
| 프론트 build 성공 | 필요 |
| 백엔드 서버 실행 확인 | 필요 |
| AI 추천 fallback 확인 | 필요 |
