# hyeok - Local Board

## 1. 프로젝트 개요

Local Board는 동네 주민들이 가게, 지역 장소, 생활 편의시설에 대해 질문하고 댓글로 실제 경험을 공유하는 Q&A 게시판입니다. 일반 게시판 기능을 기반으로 게시글과 댓글에 쌓인 내부 데이터를 검색 문맥으로 활용하고, 외부 장소 검색은 MCP 도구 서버로 분리해 Agent가 필요한 경우 호출하도록 구성했습니다.

핵심 목표는 "동네 가게에 대해 사람들이 실제로 남긴 후기와 댓글을 근거로 평가하고, 필요하면 외부 장소 후보까지 함께 추천하는 게시판"입니다.

## 2. 주요 구현 기능

- 회원가입, 로그인, JWT 기반 인증
- 내 정보 조회와 마이페이지 정보 수정
- 게시글 작성, 목록 조회, 상세 조회, 수정, 삭제
- 지역, 가게명, 분류, 태그 기반 게시글 관리
- 댓글, 대댓글, 익명 댓글, 삭제 댓글 표시
- 키워드, 태그, 정렬, 페이지네이션 기반 게시글 탐색
- 조회수, 댓글 수, 최신성을 반영한 유사 게시글 랭킹
- RAG 기반 비슷한 게시글 추천과 태그 추천
- MCP 기반 Naver 지역 장소 검색
- LangChain Agent 기반 DB 평가와 장소 추천
- Agent 실패 또는 빈 응답 시 MCP 직접 검색 fallback
- PostgreSQL `pgvector` 기반 게시글 임베딩 저장과 벡터 검색

## 3. 전체 아키텍처 구조

```text
hyeok/local_board
├─ frontend
│  └─ React + TypeScript + Vite
│     ├─ pages: 로그인, 회원가입, 게시글 목록/상세/작성/수정, 마이페이지
│     ├─ api: auth, users, posts, comments, tags, ai, agent client
│     └─ utils: token storage
├─ backend
│  └─ FastAPI + SQLAlchemy + Pydantic
│     ├─ routers: HTTP API 진입점
│     ├─ schemas: 요청/응답 모델
│     ├─ models: users, posts, comments, tags, post_embeddings
│     ├─ services: RAG, embedding, MCP client, Agent 로직
│     └─ scripts: seed, embedding backfill, RAG 점검 스크립트
├─ mcp_server
│  └─ FastMCP stdio 서버
│     ├─ search_local_places
│     ├─ make_map_search_url
│     └─ health_check
└─ docker-compose.yml
```

요청 흐름은 프론트엔드가 FastAPI API를 호출하고, 백엔드는 PostgreSQL에 게시판 데이터를 저장하거나 조회합니다. AI 기능이 필요한 API는 `services` 계층에서 내부 DB/RAG, OpenAI API, MCP 서버 호출을 조합해 응답합니다.

## 4. 각 AI 활용 기능, 기술, 아키텍처 구조

### RAG 기능

RAG 기능은 사용자가 작성 중이거나 조회 중인 글과 비슷한 내부 게시글을 찾는 데 사용됩니다.

- 주요 API
  - `POST /ai/similar-posts`
  - `POST /ai/vector-similar-posts`
  - `POST /ai/rag/similar-posts`
  - `POST /ai/tag-suggestions`
- 주요 파일
  - `backend/app/services/rag_service.py`
  - `backend/app/services/embedding_service.py`
  - `backend/app/models/post_embedding.py`
  - `backend/app/routers/ai.py`
- 사용 기술
  - `kiwipiepy` 한국어 명사 추출
  - OpenAI Embeddings
  - PostgreSQL `pgvector`
  - SQLAlchemy

RAG는 두 단계로 동작합니다. 먼저 게시글 제목, 본문, 지역, 가게명, 분류, 태그, 최근 댓글 요약을 하나의 검색 문맥으로 만들고 OpenAI 임베딩을 생성해 `post_embeddings`에 저장합니다. 이후 유사 글 검색 요청이 들어오면 입력 글을 임베딩해 `pgvector` cosine distance로 가까운 게시글을 찾습니다.

벡터 검색이 실패하거나 결과가 없을 때는 기존 키워드 기반 RAG로 fallback합니다. 키워드 기반 검색은 Kiwi 명사 추출, 불용어 제거, 필드별 가중치, 조회수/댓글 수/최신성 보너스를 반영합니다. 가게명이 있는 요청은 같은 가게명이 포함된 글을 우선 후보로 제한해 지역명만 같은 다른 가게 글이 섞이는 문제를 줄입니다.

```text
게시글/댓글 작성 또는 수정
→ BackgroundTasks로 게시글 임베딩 갱신
→ post_embeddings.source_text + embedding 저장
→ 유사 게시글 요청
→ pgvector 검색
→ 결과 없음/실패 시 키워드 RAG fallback
```

### MCP 기능

MCP 기능은 외부 장소 검색을 백엔드 본체에서 분리한 도구 서버로 제공합니다.

- 주요 도구
  - `health_check`: MCP 서버 상태 확인
  - `make_map_search_url`: Naver 지도 검색 URL 생성
  - `search_local_places`: Naver Local Search API 기반 장소 검색
- 주요 파일
  - `mcp_server/server.py`
  - `mcp_server/naver_client.py`
  - `backend/app/services/mcp_client_service.py`
  - `backend/app/routers/ai.py`
- 사용 기술
  - FastMCP
  - MCP stdio transport
  - Naver Local Search API
  - Naver Image Search API

백엔드는 MCP 클라이언트로 별도 Python 프로세스의 MCP 서버를 실행하고 `search_local_places` 도구를 호출합니다. MCP 서버는 지역과 키워드로 Naver 지역 검색 쿼리를 만들고, 장소명, 분류, 주소, 지도 URL, 이미지 후보를 구조화해 반환합니다.

```text
FastAPI /ai/place-search 또는 Agent
→ mcp_client_service
→ mcp_server/server.py stdio 실행
→ search_local_places 도구 호출
→ Naver Local/Image Search API
→ places + fallback_map_url 반환
```

### Agent 기능

Agent 기능은 내부 RAG 문맥과 외부 MCP 장소 검색을 함께 사용해 사용자에게 짧고 실용적인 추천 답변을 제공합니다.

- 주요 API
  - `POST /agent/place-recommendation`
- 주요 파일
  - `backend/app/services/agent_service.py`
  - `backend/app/schemas/agent.py`
  - `backend/app/routers/agent.py`
- 사용 기술
  - LangChain Agent
  - `langchain-openai`
  - `langchain-mcp-adapters`
  - OpenAI Chat Model
  - MCP place search tool

Agent는 먼저 요청의 제목, 본문, 지역, 키워드를 기준으로 내부 유사 게시글을 조회합니다. 관련 글과 댓글 샘플이 있으면 DB 기반 사전 평가와 RAG 참고 문맥을 만들고, 장소 추천이 필요한 경우 MCP의 `search_local_places` 도구를 호출합니다.

Agent 응답에는 다음 정보가 포함됩니다.

- `answer`: DB 기반 평가를 반영한 최종 답변
- `local_review_summary`: 관련 게시글과 댓글 수를 바탕으로 만든 내부 평가
- `places`: MCP 장소 검색 결과
- `query`: 실제 장소 검색 쿼리
- `fallback_map_url`: 직접 확인 가능한 Naver 지도 검색 URL
- `reasoning_summary`: RAG/MCP 사용 여부 설명
- `tool_status`: Agent 또는 fallback 도구 호출 상태

```text
사용자 요청
→ RAG로 관련 게시글/댓글 조회
→ local_review_summary 생성
→ LangChain Agent 실행
→ 필요 시 MCP search_local_places 호출
→ 답변 + 장소 후보 반환
→ Agent 실패/빈 결과 시 MCP 직접 검색 fallback
```
