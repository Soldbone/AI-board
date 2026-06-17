# yoonji - Figure Community

## 1. 프로젝트 개요

Figure Community는 피규어 수집가를 위한 게시판 서비스입니다. 사용자는 후기, 정보, 질문, 구매 도움 게시판에 글을 작성하고, 이미지와 피규어 정보를 함께 관리할 수 있습니다. AI 기능은 게시판에 쌓인 후기와 질문 답변을 근거로 유사 후기 추천, 구매 판단 요약, 질문 답변, 공식 상품 후보 검색을 제공하도록 구성했습니다.

핵심 목표는 "피규어 커뮤니티의 후기와 댓글 데이터를 근거로 구매 판단과 질문 해결을 돕고, 외부 상품 검색은 MCP 도구로 분리해 안전하게 보조하는 게시판"입니다.

## 2. 주요 구현 기능

- FastAPI 백엔드와 React 프론트엔드 분리 구조
- 회원가입, 로그인, JWT 기반 인증
- 게시판 목록, 게시글 목록, 게시글 상세 조회
- 후기, 정보, 질문, 구매 도움 게시판 분리
- 게시글 작성, 수정, 삭제와 작성자 권한 검사
- 이미지 업로드, 로컬 파일 저장, 썸네일 생성
- 피규어명, 제조사, 피규어 타입, 가격대, 만족도 등 후기 전용 정보 저장
- 태그 생성, 태그 필터, 게시판 내부 검색, 정렬, 페이지네이션
- 댓글 작성, 수정, 삭제와 질문 댓글 인덱싱
- RAG 기반 비슷한 후기글 추천
- RAG + LLM 기반 구매 도움 요약
- 게시글 맥락 Agent 답변과 질문글 후속 질문 흐름
- MCP 기반 Naver Shopping / Good Smile Company SmartStore 상품 후보 검색
- AI 결과를 `AiOutput`으로 비동기 생성, 저장, 조회
- 내부 인덱싱 API와 전체 재인덱싱 스크립트

## 3. 전체 아키텍처 구조

```text
yoonji
├─ frontend
│  └─ React + Vite
│     ├─ routes: 홈, 게시판, 검색, 글쓰기/수정, 마이페이지
│     ├─ api: auth, posts, comments, images, tags, ai, product enrichment
│     ├─ hooks: 게시글, 댓글, 인증, AI 결과 polling
│     └─ components: post, comment, common, ai, product
├─ backend
│  └─ FastAPI + SQLAlchemy + Pydantic
│     ├─ api/routes: HTTP API 진입점
│     ├─ services: 비즈니스 로직과 AI 요청 orchestration
│     ├─ repositories: DB 조회와 저장
│     ├─ models: users, boards, posts, comments, images, tags, content_chunks, ai_outputs
│     ├─ ai/rag: 문서 로딩, chunking, embedding, vector search, RAG chain
│     ├─ ai/agent: tool schema, tool 실행, Agent loop
│     └─ mcp: MCP JSON-RPC client와 상품 후보 검증 보조 로직
├─ mcp-server
│  └─ FastMCP streamable HTTP 서버
│     ├─ search_gsc_smartstore_products
│     ├─ search_naver_shopping_products
│     └─ fetch_gsc_product_metadata
├─ scripts
│  └─ seed, smoke test, RAG reindex script
└─ docker-compose.yml
```

백엔드는 `/api/v1` 아래에 인증, 게시판, 게시글, 댓글, 이미지, 태그, 검색, AI API를 제공합니다. 게시글과 댓글이 생성되거나 수정되면 `BackgroundTasks`로 RAG 인덱싱을 예약하고, AI 요청은 즉시 긴 답변을 생성하지 않고 `AiOutput` 요청 row를 만든 뒤 background task에서 처리합니다. 프론트엔드는 AI 결과가 `REQUESTED`, `PROCESSING`, `GENERATED`, `FAILED` 상태로 바뀌는 흐름을 polling해 화면에 표시합니다.

## 4. 각 AI 활용 기능, 기술, 아키텍처 구조

### RAG 기능

RAG 기능은 피규어 후기와 질문 답변을 검색 가능한 근거로 만들고, 유사 후기 추천과 구매 도움 요약에 사용합니다.

- 주요 API
  - `GET /api/v1/posts/{post_id}/similar-posts`
  - `POST /api/v1/posts/{post_id}/ai/purchase-summary`
  - `POST /api/v1/internal/indexing/posts/{post_id}`
  - `POST /api/v1/internal/indexing/comments/{comment_id}`
  - `POST /api/v1/internal/indexing/reindex`
- 주요 파일
  - `backend/app/ai/rag/document_loader.py`
  - `backend/app/ai/rag/text_splitter.py`
  - `backend/app/ai/rag/embedding_client.py`
  - `backend/app/ai/rag/vector_store.py`
  - `backend/app/ai/rag/retriever.py`
  - `backend/app/ai/rag/indexing_service.py`
  - `backend/app/ai/rag/rag_chain.py`
  - `backend/app/ai/usecases/similar_posts.py`
  - `backend/app/ai/usecases/purchase_summary.py`
- 사용 기술
  - LangChain Document
  - OpenAI Embeddings
  - PostgreSQL `pgvector`
  - SQLAlchemy
  - OpenAI Chat Model

인덱싱 대상은 `REVIEW`, `QUESTION`, `PURCHASE_HELP` 게시글이며, 댓글은 질문 게시판 댓글을 중심으로 인덱싱합니다. 게시글 문서는 제목, 본문, 게시판 코드, 피규어명, 제조사, 피규어 타입, 가격대, 만족도, 태그를 포함합니다. 문서는 chunk로 나누고 임베딩을 생성한 뒤 `content_chunks`에 저장합니다.

유사 후기 추천은 후기 게시글끼리 비교합니다. 같은 피규어명, 관련 피규어명, 같은 제조사, 공유 태그, 유사 가격대 같은 신호를 벡터 검색 점수와 함께 재랭킹합니다. 구매 도움 요약은 `PURCHASE_HELP` 게시글을 기준으로 관련 후기 chunk를 검색하고, 같은 피규어, 같은 제조사, 비슷한 가격대와 높은 만족도 후기를 우선 근거로 사용해 LLM 요약을 생성합니다.

```text
게시글/댓글 작성 또는 수정
→ indexing_service가 background indexing 예약
→ document_loader로 Document 생성
→ text_splitter로 chunk 생성
→ embedding_client로 임베딩 생성
→ vector_store가 pgvector에 저장
→ 유사 후기/구매 요약/Agent 도구에서 retriever 사용
```

### MCP 기능

MCP 기능은 외부 상품 후보 검색을 별도 서버로 분리합니다. 백엔드는 MCP JSON-RPC client로 도구를 호출하고, MCP 서버는 Naver Shopping과 Good Smile Company Korea SmartStore 관련 데이터 접근을 담당합니다.

- 주요 API
  - `GET /api/v1/posts/{post_id}/product-enrichment`
  - `POST /api/v1/posts/{post_id}/product-enrichment`
- MCP 도구
  - `search_gsc_smartstore_products`: 공식 Good Smile Company Korea SmartStore 후보만 필터링
  - `search_naver_shopping_products`: 일반 Naver Shopping 상품 후보 검색
  - `fetch_gsc_product_metadata`: whitelisted SmartStore URL의 경량 metadata 조회
- 주요 파일
  - `mcp-server/server.py`
  - `mcp-server/tools/shopping_metadata_tool.py`
  - `mcp-server/clients/naver_shopping_client.py`
  - `backend/app/mcp/client.py`
  - `backend/app/services/product_enrichment_service.py`
  - `backend/app/models/mcp_product_enrichment.py`
  - `frontend/src/components/product/ProductInfoCard.jsx`
- 사용 기술
  - FastMCP streamable HTTP
  - MCP JSON-RPC
  - httpx
  - Naver Shopping Search API

상품 보강 기능은 `REVIEW` 게시글에서 피규어 정보가 있을 때 사용할 수 있습니다. 요청이 들어오면 백엔드는 `McpProductEnrichment` row를 `REQUESTED` 상태로 만들고, background task에서 MCP 서버의 상품 검색 도구를 호출합니다. 결과는 `COMPLETED`, `FAILED` 상태와 함께 저장되며, 현재 구현은 Naver Shopping 후보를 `CANDIDATES_ONLY`로 저장해 공식 확정 정보처럼 과장하지 않도록 처리합니다.

```text
REVIEW 게시글 상세
→ product enrichment 요청
→ McpProductEnrichment REQUESTED 저장
→ background task 실행
→ ProductMetadataMcpClient
→ MCP streamable HTTP tools/call
→ Naver Shopping / SmartStore 후보 조회
→ 후보, 상태, 근거, 오류 정보 저장
→ 프론트 ProductInfoCard 표시
```

### Agent 기능

Agent 기능은 게시글의 현재 맥락에서만 답변하도록 제한한 post-context Agent입니다. 사용자가 질문글, 후기글, 구매 도움글에서 AI 답변을 요청하면 Agent가 필요한 도구를 선택해 근거를 수집하고, 한국어 답변을 생성합니다.

- 주요 API
  - `POST /api/v1/posts/{post_id}/ai/agent-answer`
  - `GET /api/v1/ai/outputs/{ai_output_id}`
- 주요 파일
  - `backend/app/ai/agent/agent_client.py`
  - `backend/app/ai/agent/agent_runner.py`
  - `backend/app/ai/agent/prompts.py`
  - `backend/app/ai/agent/tool_schemas.py`
  - `backend/app/ai/agent/tools.py`
  - `backend/app/services/ai_service.py`
  - `frontend/src/components/ai/AgentAnswerBox.jsx`
- 사용 기술
  - OpenAI Responses/Chat 호출 wrapper
  - Function calling tool schema
  - RAG retriever tools
  - MCP product search tool
  - `AiOutput` 상태 저장과 polling

Agent는 게시판 종류에 따라 사용할 수 있는 도구를 제한합니다.

| 게시판 | 사용 도구 |
| --- | --- |
| `REVIEW` | `rag_similar_review_posts`, `mcp_gsc_product_search` |
| `QUESTION` | `rag_question_context` |
| `PURCHASE_HELP` | `rag_purchase_review_context`, `mcp_gsc_product_search` |

질문 게시판에서는 과거 질문글과 댓글 근거를 우선 찾아 답변하며, 상품 검색 MCP는 사용하지 않습니다. 후기 게시판에서는 비슷한 후기와 공식 상품 후보를 분리해 다룹니다. 구매 도움 게시판에서는 후기 근거를 먼저 사용하고, MCP 상품 후보는 보조 정보로만 활용합니다.

Agent 실행은 최대 4 step으로 제한됩니다. 각 tool call 결과는 trace로 저장되고, 근거 chunk는 `AiOutputSource`로 연결됩니다. 근거가 충분하면 `GROUNDED`, 일부만 있으면 `PARTIALLY_GROUNDED`, 근거가 없으면 `NO_EVIDENCE` 상태로 저장합니다.

```text
프론트 Agent 요청
→ AiOutput REQUESTED 저장
→ background task에서 Agent 실행
→ post context + 사용자 메시지로 LLM 호출
→ 모델이 필요한 function tool 선택
→ RAG 또는 MCP tool 실행
→ tool output을 다시 모델에 전달
→ 최종 답변, trace, sources 저장
→ 프론트가 polling으로 결과 표시
```
