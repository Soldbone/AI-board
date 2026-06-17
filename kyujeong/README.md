# 냉장고 한 끼 게시판

## 1. 프로젝트 개요

냉장고 한 끼 게시판은 사용자가 보유한 재료, 요리 고민, 레시피 팁을 게시판에 공유하고 AI가 이를 바탕으로 메뉴를 추천하는 커뮤니티 기반 요리 서비스입니다.

사용자는 질문, 레시피 공유, 요리 팁/후기, 자유/트렌드 카테고리로 글을 작성하고 댓글로 조리 경험을 축적합니다. AI 추천 기능은 게시글 본문만 보지 않고, 비슷한 커뮤니티 글과 댓글 답변을 RAG 근거로 삼아 "왜 이 메뉴를 추천했는지"를 함께 보여주는 것을 목표로 합니다.

기술 스택은 React/Vite 프론트엔드, NestJS 백엔드, Prisma ORM, PostgreSQL + pgvector, JWT 인증으로 구성됩니다. OpenAI API key가 있으면 임베딩과 레시피 생성을 OpenAI 기반으로 수행하고, key가 없으면 로컬 fallback 흐름으로 서비스가 끊기지 않게 동작합니다.

## 2. 주요 구현 기능

- 회원가입, 로그인, JWT 기반 인증
- 게시글 목록, 검색, 태그/카테고리 필터, 상세 조회
- 인증 사용자 게시글 작성, 수정, 삭제
- 댓글 작성, 조회, 수정, 삭제
- 마이페이지의 내 게시글, 내 댓글, 내 AI 추천 기록 조회
- 게시글과 댓글, 태그를 묶은 RAG 문서 생성 및 재생성
- pgvector 기반 유사 게시글 검색
- 게시글 상세 또는 직접 재료 입력 기반 AI 레시피 추천
- 추천 결과 저장, 최신 추천 조회, 추천 상태 표시
- `COMMUNITY_RAG`와 `GENERAL_AI` grounding 구분
- 공공데이터 기반 식품 영양성분 검색과 재료 묶음 영양 분석
- 음식 영양성분 MCP 서버와 API 연결 상태 점검 스크립트
- 게시글 초안 작성을 돕는 AI Agent 흐름
- React 단일 화면 앱에서 게시판, 상세, 글쓰기, AI 추천 모달, AI 요리사 채팅, MCP 점검 화면 제공

## 3. 전체 아키텍처 구조

```text
kyujeong/
  frontend/
    src/App.tsx                         React/Vite 단일 화면 앱
    src/assets/                         서비스 이미지와 정적 리소스
  backend/
    src/auth/                           회원가입, 로그인, JWT guard
    src/users/                          내 정보, 내 글, 내 댓글, 내 AI 추천 기록
    src/posts/                          게시글 CRUD, 검색, 태그/카테고리 필터
    src/comments/                       댓글 CRUD
    src/ai-recommendations/             RAG 문서, 유사 게시글 검색, AI 메뉴 추천
    src/ai-agent/                       게시글 초안 보조 Agent
    src/food-metadata/                  식품 영양성분 조회 API와 MCP tool 구현
    src/prisma/                         Prisma service/module
    prisma/schema.prisma                PostgreSQL 데이터 모델
    prisma/migrations/                  pgvector 포함 DB migration
    prisma/seed-board-rag.ts            RAG 데모 데이터 seed
  docker-compose.yml                    pgvector PostgreSQL 로컬 실행
  LOCAL_DEV_SETUP.md                    로컬 실행 상세 가이드
```

런타임 흐름은 다음과 같습니다.

```text
React frontend
  -> NestJS REST API
  -> Prisma
  -> PostgreSQL + pgvector

AI recommendation
  -> 게시글/댓글/태그 기반 RAG 문서 생성
  -> embedding 생성
  -> pgvector similarity search
  -> 유사 게시글과 댓글 답변 선별
  -> Recipe LLM 또는 fallback 추천
  -> 추천 결과, grounding, 참고 게시글 저장

Food metadata
  -> FoodMetadataService
  -> 공공데이터 식품 영양성분 API
  -> REST API 또는 MCP server tool result
```

주요 데이터 모델은 `User`, `Post`, `Comment`, `Tag`, `PostRagDocument`, `BoardRagChatLog`, `AiRecipeRecommendation`, `AiRecommendationReference`입니다. `PostRagDocument.embedding`은 `vector(1536)` 타입을 사용하며, 유사도 검색의 기준 데이터가 됩니다.

로컬 실행은 [LOCAL_DEV_SETUP.md](LOCAL_DEV_SETUP.md)를 기준으로 합니다.

```bash
docker compose up -d
cd backend
npm install
npx prisma migrate dev
npm run seed:board-rag
npm run start:dev
```

프론트엔드는 별도 터미널에서 실행합니다.

```bash
cd frontend
npm install
npm run dev
```

## 4. 각 AI 활용 기능, 기술, 아키텍처 구조

### RAG

RAG는 "비슷한 커뮤니티 글을 참고한 요리 추천"을 만들기 위한 핵심 흐름입니다.

- 게시글 제목, 본문, 댓글, 태그를 조합해 추천용 문서 텍스트를 만듭니다.
- `EmbeddingService`가 문서를 임베딩으로 변환합니다.
- PostgreSQL의 pgvector 컬럼에 임베딩을 저장합니다.
- 추천 요청이 들어오면 현재 게시글 또는 직접 입력 재료를 기준으로 유사 게시글을 검색합니다.
- 유사도 기본 기준은 `AI_RECOMMENDATION_MIN_SIMILARITY=0.55`입니다.
- 최소 재료 겹침 기본 기준은 `AI_RECOMMENDATION_MIN_INGREDIENT_OVERLAP=1`입니다.
- 댓글 조리 팁이 있는 게시글만 커뮤니티 근거로 우선 사용합니다.

추천 결과는 두 가지 grounding으로 구분합니다.

- `COMMUNITY_RAG`: 유사한 커뮤니티 게시글과 댓글 답변을 참고한 추천
- `GENERAL_AI`: 쓸 수 있는 커뮤니티 근거가 없어 현재 요청과 일반 요리 지식으로 생성한 추천

관련 구현 위치:

- `backend/src/ai-recommendations/ai-recommendations.service.ts`
- `backend/src/ai-recommendations/embedding.service.ts`
- `backend/prisma/schema.prisma`
- `backend/docs/ai-rag-roadmap.md`
- `backend/docs/ai-recommendation-handoff.md`

### MCP

MCP는 음식 영양성분 메타데이터를 AI 기능이 도구처럼 사용할 수 있게 분리한 경계입니다. 추천 생성 자체나 최종 메뉴 선택은 MCP가 담당하지 않고, MCP는 식품명 검색과 영양성분 조회만 맡습니다.

제공 tool은 다음과 같습니다.

- `search_food_items`: 한국어 식품명 후보 검색
- `get_food_nutrition`: 특정 식품의 영양성분 조회
- `analyze_ingredients_nutrition`: 여러 재료의 영양성분 요약

REST API도 같은 서비스 계층을 사용합니다.

```http
GET  /food-metadata/search?query=계란&limit=5
GET  /food-metadata/nutrition?query=두부
POST /food-metadata/analyze
```

MCP 서버 실행과 점검:

```bash
cd backend
npm run mcp:food
npm run mcp:food:check -- 계란
npm run mcp:standard-food:check
```

관련 구현 위치:

- `backend/src/mcp-food-metadata.ts`
- `backend/src/food-metadata/`
- `backend/src/ai-agent/tools/analyze-food-metadata.tool.ts`
- `backend/docs/food-metadata-mcp.md`

### Agent

Agent는 게시글을 대신 작성하는 자동 작성기가 아니라, 사용자가 더 좋은 질문글이나 재료 요청글을 만들도록 돕는 초안 보조 흐름입니다.

Agent runner는 최대 step 수와 tool별 반복 호출 한도를 두고 다음 순서로 동작합니다.

```text
사용자 초안 입력
  -> 재료와 상황 추출
  -> 식품 영양성분 metadata 조회
  -> 댓글이 달릴 가능성과 부족 정보 평가
  -> 게시글 제목, 본문, 태그 재작성 제안
  -> 단계별 tool call과 오류를 응답에 포함
```

주요 tool은 다음과 같습니다.

- `extract_ingredients`: 초안에서 재료, 선호, 식사 맥락 추출
- `analyze_food_metadata`: MCP/식품 메타데이터 기반 영양 정보 조회
- `evaluate_post_success`: 댓글 성공률과 보완 질문 평가
- `rewrite_post_draft`: OpenAI 또는 fallback 기반 게시글 초안 재작성

API:

```http
POST /agent/post-draft/assist
POST /api/agent/post-draft/assist
```

관련 구현 위치:

- `backend/src/ai-agent/ai-agent.controller.ts`
- `backend/src/ai-agent/ai-agent.service.ts`
- `backend/src/ai-agent/post-draft-agent.runner.ts`
- `backend/src/ai-agent/tools/`
