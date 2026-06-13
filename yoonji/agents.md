# Agents Guide

이 문서는 `yoonji` 프로젝트를 구현할 때 Codex가 따라야 할 작업 지침이다.  
현재 기준 설계 문서는 아래 3개를 정답으로 본다.

- `docs/architecture/api-design.md`
- `docs/database/schema-design.md`
- `docs/testing/test-scenarios.md`

## 1. 구현 원칙

### 1.1 MVP 범위

MVP는 **AI 기능이 단 하나도 들어가지 않은 게시판 기본 구현**으로 한다.

MVP에 포함한다.

- 회원가입
- 로그인 / 로그아웃
- JWT 인증
- 게시판 목록
- 게시글 작성 / 목록 / 상세 / 수정 / 삭제
- 후기 게시글용 피규어 정보 입력
- 이미지 업로드
- 댓글 작성 / 목록 / 수정 / 삭제
- 태그 입력 / 검색 / 연결
- 게시글 검색
- 페이지네이션
- 마이페이지의 내 게시글 / 내 댓글 조회

MVP에 포함하지 않는다.

- RAG Q&A
- AI 참고 답변
- 구매 고민 AI 요약
- 유사 게시글 AI 추천
- 입문자 정보글 AI 초안
- MCP 기반 링크 미리보기
- pgvector 기반 의미 검색
- LangChain / LangGraph 실제 연결

AI 관련 폴더와 파일은 구조상 존재해도 된다. 하지만 MVP 구현 중에는 비워 두거나, 라우터에 연결하지 않는다.

### 1.2 학습하기 좋은 구현 방식

코드는 한 번에 크게 만들지 않는다.  
각 phase는 “읽을 파일”, “작성할 파일”, “확인할 API”, “공부 포인트”가 분명해야 한다.

구현할 때 지킬 것:

- 한 phase에서는 한 가지 주제만 구현한다.
- API, service, repository, model, schema의 역할을 섞지 않는다.
- 작성한 코드가 왜 필요한지 파일별로 짧게 설명할 수 있어야 한다.
- 복잡한 로직은 service에 둔다.
- DB 조회/저장은 repository에 둔다.
- 요청/응답 검증은 schema에 둔다.
- 라우터는 요청을 받고 service를 호출하는 얇은 계층으로 유지한다.
- 프론트에서는 API 호출 함수와 화면 컴포넌트를 분리한다.

### 1.3 사용자 URL 입력 정책

사용자는 게시글 작성 시 URL을 별도로 입력하지 않는다.

따라서 MVP와 이후 AI 구현 모두에서 다음을 만들면 안 된다.

- 게시글 작성 화면의 URL 입력칸
- 게시글 작성 API의 `external_urls`
- 게시글 작성 API의 `link_preview_ids`
- 사용자가 직접 호출하는 `POST /link-previews`

현재 게시글 작성 흐름에는 외부 링크 미리보기 기능을 연결하지 않는다.

## 2. MVP 구현 Phase

## Phase 0. 프로젝트 실행 뼈대 만들기

목표: React와 FastAPI가 각각 실행될 수 있는 최소 상태를 만든다.

구현 파일:

- `backend/requirements.txt`
- `backend/app/main.py`
- `backend/app/core/config.py`
- `backend/app/core/cors.py`
- `frontend/package.json`
- `frontend/vite.config.js`
- `frontend/index.html`
- `frontend/src/main.jsx`
- `frontend/src/App.jsx`
- `frontend/src/api/client.js`

구현 내용:

- FastAPI 앱 생성
- `/health` 또는 `/api/v1/health` 확인용 endpoint 추가 가능
- CORS 설정
- React 기본 화면 렌더링
- API base URL 설정

공부 포인트:

- FastAPI 앱이 시작되는 흐름
- React 앱이 `main.jsx`에서 시작되는 흐름
- 프론트와 백엔드가 서로 다른 서버로 실행되는 이유
- CORS가 필요한 이유

완료 기준:

- 백엔드 서버가 실행된다.
- 프론트 서버가 실행된다.
- React에서 FastAPI health check를 호출할 수 있다.

## Phase 1. DB 연결과 공통 기반 만들기

목표: PostgreSQL 연결과 SQLAlchemy 모델 기반을 만든다.

구현 파일:

- `backend/app/db/database.py`
- `backend/app/db/session.py`
- `backend/app/db/base.py`
- `backend/app/core/exceptions.py`
- `backend/app/api/deps.py`
- `backend/alembic.ini`
- `migrations/versions/`

구현 내용:

- DB engine 생성
- session dependency 생성
- SQLAlchemy Base 설정
- 공통 예외 응답 구조 준비
- Alembic migration 준비

공부 포인트:

- DB 연결과 session의 역할
- FastAPI dependency가 무엇인지
- migration이 왜 필요한지
- model과 실제 DB table의 관계

완료 기준:

- FastAPI에서 DB session을 주입받을 수 있다.
- Alembic migration을 만들 준비가 된다.

## Phase 2. 핵심 모델과 마이그레이션 만들기

목표: AI 없이 게시판 MVP에 필요한 DB 모델을 만든다.

구현 파일:

- `backend/app/models/user.py`
- `backend/app/models/auth_session.py`
- `backend/app/models/board.py`
- `backend/app/models/post.py`
- `backend/app/models/post_figure_info.py`
- `backend/app/models/comment.py`
- `backend/app/models/tag.py`
- `backend/app/models/post_tag.py`
- `backend/app/models/post_image.py`
- `scripts/seed_boards.py`

MVP에서 만들지 않는 모델:

- `content_chunk.py`
- `ai_output.py`
- `ai_output_source.py`
- `report.py`

위 모델들은 파일은 존재해도 MVP phase에서는 구현하지 않는다. AI 또는 운영자 확장 단계에서 구현한다.

구현 내용:

- User
- AuthSession
- Board
- Post
- PostFigureInfo
- Comment
- Tag
- PostTag
- PostImage
- 기본 게시판 seed

주의:

- API에서는 `figure_name`, `manufacturer`를 사용한다.
- DB 컬럼은 `figure_name_text`, `manufacturer_text`로 저장해도 된다.
- 이 경우 schema/service에서 API 필드와 DB 컬럼을 매핑한다.
- `PostFigureInfo`는 후기 게시판(`REVIEW`)에서만 사용한다.
- 구매 고민 게시판(`PURCHASE_HELP`)에서는 `PostFigureInfo`를 만들지 않고 제목과 본문으로 고민 내용을 작성한다.

공부 포인트:

- 1:N 관계
- N:M 관계
- soft delete 구조
- enum 값을 DB에 저장하는 방식

완료 기준:

- `create_all()`로 MVP 테이블이 생성된다.
- `REVIEW`, `INFO`, `QUESTION`, `PURCHASE_HELP` 게시판 seed가 가능하다.

## Phase 3. 회원가입 / 로그인 구현

목표: 사용자가 회원가입하고 로그인해서 인증 토큰을 받을 수 있게 한다.

구현 파일:

- `backend/app/core/security.py`
- `backend/app/schemas/auth_schema.py`
- `backend/app/schemas/user_schema.py`
- `backend/app/repositories/user_repository.py`
- `backend/app/services/auth_service.py`
- `backend/app/services/user_service.py`
- `backend/app/api/routes/auth.py`
- `backend/app/api/routes/users.py`
- `frontend/src/api/authApi.js`
- `frontend/src/api/userApi.js`
- `frontend/src/hooks/useAuth.js`
- `frontend/src/pages/LoginPage.jsx`
- `frontend/src/pages/SignupPage.jsx`

구현 API:

- `POST /api/v1/auth/signup`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/users/me`

공부 포인트:

- password hash
- JWT access token
- refresh token
- 로그인 상태를 프론트에서 관리하는 방법
- 인증이 필요한 API에 토큰을 붙이는 방법

완료 기준:

- 회원가입이 된다.
- 로그인 후 토큰을 받는다.
- 로그인 상태에서 내 정보를 조회한다.
- 비로그인 상태에서 보호 API는 실패한다.

## Phase 4. 게시판 목록과 게시글 읽기 구현

목표: 비회원도 게시판과 게시글을 읽을 수 있게 한다.

구현 파일:

- `backend/app/schemas/board_schema.py`
- `backend/app/schemas/post_schema.py`
- `backend/app/repositories/post_repository.py`
- `backend/app/services/board_service.py`
- `backend/app/services/post_service.py`
- `backend/app/api/routes/boards.py`
- `backend/app/api/routes/posts.py`
- `frontend/src/api/boardApi.js`
- `frontend/src/api/postApi.js`
- `frontend/src/pages/HomePage.jsx`
- `frontend/src/pages/PostListPage.jsx`
- `frontend/src/pages/PostDetailPage.jsx`
- `frontend/src/components/post/PostCard.jsx`
- `frontend/src/components/post/PostList.jsx`

구현 API:

- `GET /api/v1/boards`
- `GET /api/v1/boards/{board_code}`
- `GET /api/v1/posts`
- `GET /api/v1/posts/{post_id}`

구현 내용:

- 게시판 목록
- 게시글 목록
- 게시글 상세
- 조회수 증가
- 최신순 기본 정렬
- 기본 페이지네이션

공부 포인트:

- 목록 응답 구조
- 상세 응답 구조
- 페이지네이션 쿼리
- 비회원 접근 가능 API와 회원 전용 API 구분

완료 기준:

- 비회원도 게시글 목록과 상세를 볼 수 있다.
- 목록 응답에 `items`, `page`, `size`, `total`, `has_next`가 포함된다.

## Phase 5. 게시글 작성 / 수정 / 삭제 구현

목표: 로그인한 사용자가 게시글을 작성하고 관리할 수 있게 한다.

구현 파일:

- `backend/app/schemas/post_schema.py`
- `backend/app/repositories/post_repository.py`
- `backend/app/services/post_service.py`
- `backend/app/api/routes/posts.py`
- `frontend/src/pages/PostWritePage.jsx`
- `frontend/src/pages/PostEditPage.jsx`
- `frontend/src/components/post/PostForm.jsx`
- `frontend/src/components/post/FigureInfoForm.jsx`

구현 API:

- `POST /api/v1/posts`
- `PATCH /api/v1/posts/{post_id}`
- `DELETE /api/v1/posts/{post_id}`

구현 내용:

- 게시판별 필수값 검증
- 후기 게시판의 피규어 정보 저장
- 구매 고민 게시판은 피규어 정보 테이블 없이 제목과 본문만 저장
- 작성자만 수정/삭제 가능
- 운영자는 추후 phase에서 삭제 가능
- soft delete

주의:

- URL 입력 필드는 만들지 않는다.
- `external_urls`, `link_preview_ids`는 요청 schema에 넣지 않는다.

공부 포인트:

- create schema와 response schema 분리
- 작성자 권한 검사
- service에서 여러 테이블을 함께 저장하는 방법

완료 기준:

- 후기 게시글을 작성할 수 있다.
- 정보글, 질문글, 구매 고민글을 작성할 수 있다.
- 작성자는 자신의 글을 수정/삭제할 수 있다.
- 다른 사용자는 수정/삭제할 수 없다.

## Phase 6. 이미지 업로드 구현

목표: 게시글 작성 전에 이미지를 임시 업로드하고 게시글에 연결한다.

구현 파일:

- `backend/app/models/post_image.py`
- `backend/app/schemas/image_schema.py`
- `backend/app/services/image_service.py`
- `backend/app/api/routes/images.py`
- `backend/app/storage/local_storage.py`
- `backend/app/storage/thumbnail_generator.py`
- `frontend/src/api/imageApi.js`
- `frontend/src/components/post/ImageUploader.jsx`

구현 API:

- `POST /api/v1/images`
- `DELETE /api/v1/images/{image_id}`

구현 내용:

- multipart 이미지 업로드
- 파일 타입/용량 검증
- 로컬 저장
- 썸네일 생성
- `TEMP` 이미지 상태
- 게시글 작성 시 `image_ids`로 연결

공부 포인트:

- multipart/form-data
- 파일 저장 경로 설계
- DB에는 파일 자체가 아니라 URL/메타데이터를 저장하는 이유

완료 기준:

- 이미지를 업로드하면 `file_url`, `thumbnail_url`이 생성된다.
- 게시글 작성 시 이미지가 연결된다.
- 상세 화면에서 이미지가 보인다.

## Phase 7. 댓글 구현

목표: 게시글 상세에서 댓글 CRUD를 구현한다.

구현 파일:

- `backend/app/schemas/comment_schema.py`
- `backend/app/repositories/comment_repository.py`
- `backend/app/services/comment_service.py`
- `backend/app/api/routes/comments.py`
- `frontend/src/api/commentApi.js`
- `frontend/src/hooks/useComments.js`
- `frontend/src/components/comment/CommentList.jsx`
- `frontend/src/components/comment/CommentForm.jsx`

구현 API:

- `GET /api/v1/posts/{post_id}/comments`
- `POST /api/v1/posts/{post_id}/comments`
- `PATCH /api/v1/comments/{comment_id}`
- `DELETE /api/v1/comments/{comment_id}`

구현 내용:

- 댓글 목록
- 댓글 작성
- 댓글 수정
- 댓글 soft delete
- 게시글 `comment_count` 갱신

공부 포인트:

- 부모 리소스와 자식 리소스 관계
- 댓글 수 denormalization
- 댓글 권한 검사

완료 기준:

- 로그인 사용자는 댓글을 작성할 수 있다.
- 작성자는 자신의 댓글을 수정/삭제할 수 있다.
- 비회원은 댓글 작성이 차단된다.

## Phase 8. 태그 구현

목표: 게시글에 태그를 연결하고 태그로 탐색할 수 있게 한다.

구현 파일:

- `backend/app/schemas/tag_schema.py`
- `backend/app/repositories/tag_repository.py`
- `backend/app/services/tag_service.py`
- `backend/app/api/routes/tags.py`
- `backend/app/utils/normalizer.py`
- `frontend/src/api/tagApi.js`
- `frontend/src/components/post/TagInput.jsx`

구현 API:

- `GET /api/v1/tags`
- `POST /api/v1/tags`
- `GET /api/v1/posts?tag=...`

구현 내용:

- 태그 자동완성
- 태그 생성 또는 재사용
- 게시글-태그 연결
- `usage_count` 증가
- 태그명 정규화

공부 포인트:

- 다대다 관계
- 중복 태그 방지
- 정규화된 검색어 저장

완료 기준:

- 태그 검색이 된다.
- 게시글 작성 시 태그가 연결된다.
- 태그 기반 게시글 목록 조회가 된다.

## Phase 9. 검색 / 정렬 / 마이페이지 구현

목표: 게시글 탐색성과 내 활동 조회를 완성한다.

구현 파일:

- `backend/app/schemas/search_schema.py`
- `backend/app/services/search_service.py`
- `backend/app/api/routes/search.py`
- `frontend/src/api/searchApi.js`
- `frontend/src/pages/SearchResultPage.jsx`
- `frontend/src/pages/MyPage.jsx`

구현 API:

- `GET /api/v1/search/posts`
- `GET /api/v1/users/me/posts`
- `GET /api/v1/users/me/comments`

구현 내용:

- 제목/본문/피규어명/제조사/태그 기반 검색
- 게시판 필터
- 가격대 필터
- 최신순, 조회수순, 만족도순, 댓글순 정렬
- 내 게시글 목록
- 내 댓글 목록

MVP 검색은 PostgreSQL 기본 검색과 `LIKE` 또는 full-text search 수준으로 충분하다. pgvector 의미 검색은 AI phase에서 구현한다.

공부 포인트:

- 검색 조건 조합
- query parameter 처리
- 정렬 기준 처리
- 마이페이지와 인증 사용자 정보 연결

완료 기준:

- 키워드 검색이 된다.
- 필터와 정렬이 적용된다.
- 내 게시글과 내 댓글을 조회할 수 있다.

## Phase 10. 프론트 라우팅과 UX 정리

목표: MVP 화면 흐름을 사용 가능한 상태로 정리한다.

구현 파일:

- `frontend/src/routes/Router.jsx`
- `frontend/src/components/common/Header.jsx`
- `frontend/src/components/common/Layout.jsx`
- `frontend/src/components/common/Button.jsx`
- `frontend/src/components/common/Input.jsx`
- `frontend/src/components/common/Modal.jsx`
- `frontend/src/components/common/Loading.jsx`
- `frontend/src/styles/global.css`
- `frontend/src/constants/boardTypes.js`
- `frontend/src/constants/postStatus.js`

구현 내용:

- 페이지 라우팅
- 로그인/로그아웃 버튼
- 게시판 메뉴
- 로딩 상태
- 에러 표시
- 삭제 확인 모달
- 공통 버튼/입력 UI

공부 포인트:

- React Router
- 공통 컴포넌트 분리
- 화면 상태와 API 상태 구분
- 사용자에게 필요한 에러 메시지 설계

완료 기준:

- 홈, 목록, 상세, 작성, 수정, 검색, 마이페이지가 자연스럽게 이동된다.
- 인증이 필요한 페이지는 로그인 상태를 확인한다.

## Phase 11. MVP 테스트와 정리

목표: AI 없는 게시판 MVP가 안정적으로 동작하는지 확인한다.

참고 문서:

- `docs/testing/test-scenarios.md`

우선 검증할 시나리오:

- BOARD-01 비회원 게시글 목록/상세 조회
- BOARD-02 회원가입/로그인
- BOARD-04 후기 게시글 작성
- BOARD-05 필수값 검증
- BOARD-09 게시글 수정
- BOARD-11 게시글 삭제
- BOARD-12 댓글 CRUD
- BOARD-14 태그 탐색
- BOARD-15 검색
- BOARD-16 페이징/정렬
- BOARD-18 인증 보호

공부 포인트:

- 내가 만든 코드가 API 설계와 맞는지 확인하는 방법
- 버그를 테스트 시나리오로 재현하는 방법
- MVP 범위를 넘는 기능을 미루는 판단

완료 기준:

- 게시판 기본 기능 테스트가 통과한다.
- AI 기능 없이도 서비스가 게시판으로 사용 가능하다.

## 3. AI 구현 Phase

MVP 완료 후 아래 순서로 AI 기능을 붙인다.  
AI 구현은 항상 기존 사용자 작성 콘텐츠와 분리해서 저장한다.

## AI Phase 0. AI 구현에서 모두 필수적으로 지켜야 할 사항

이번 Phase에서는 프로젝트에 **LangChain 기반 RAG(Retrieval-Augmented Generation)** 기능을 구현한다.

단순히 동작하는 코드를 작성하는 것이 아니라, 코드 구조와 개념을 학습할 수 있도록 **가장 정석적이고 유지보수하기 좋은 방식**으로 구현한다. 구현이 끝난 뒤에는 `docs/rag-study.md`에 이번 Phase에서 수정한 파일, 추가한 코드의 의미, RAG 전체 흐름, LangChain 구성 요소의 역할을 자세히 정리한다.

---

### 구현 요구사항

#### 1. RAG 전체 흐름 구현

다음 흐름을 기준으로 RAG 기능을 구현한다.

```
게시글 데이터
→ LangChain Document 변환
→ Text Splitter로 chunk 분리
→ Embedding 생성
→ Vector DB 저장
→ 사용자 질문 입력
→ Retriever로 관련 문서 검색
→ 검색된 context를 LLM prompt에 삽입
→ 답변 생성
```

이번 Phase에서는 우선 게시글 데이터를 기반으로 한 **AI Q&A 기능**을 구현한다.

사용자는 질문을 입력할 수 있고, 백엔드는 기존 게시글 중 질문과 관련 있는 문서를 검색한 뒤, 검색된 내용을 참고하여 답변을 생성한다.

---

#### 2. LangChain을 사용한 정석 구조 적용

LangChain을 사용할 때 다음 구성 요소를 명확히 분리해서 구현한다.

- `Document`
  - DB 게시글 데이터를 LangChain이 처리할 수 있는 문서 형태로 변환한다.
- `TextSplitter`
  - 긴 게시글을 적절한 chunk 단위로 나눈다.
  - `RecursiveCharacterTextSplitter`를 우선 사용한다.
- `Embeddings`
  - 텍스트를 벡터로 변환한다.
  - 환경변수 기반으로 OpenAI Embedding 모델을 사용할 수 있게 구성한다.
- `Vector Store`
  - 임베딩된 문서를 저장한다.
  - MVP에서는 로컬 개발이 쉬운 ChromaDB를 우선 사용한다.
  - 추후 pgvector로 교체 가능하도록 서비스 레이어를 분리한다.
- `Retriever`
  - 사용자 질문과 유사한 게시글 chunk를 검색한다.
- `Prompt`
  - 검색된 context와 사용자 질문을 함께 LLM에 전달한다.
- `LLM`
  - 검색된 게시글 내용을 기반으로 답변을 생성한다.

---

#### 3. FastAPI 구조에 맞게 구현

기존 프로젝트 구조를 유지하면서 다음 역할이 분리되도록 구현한다.

예상 구조는 다음과 같다.

```
backend/
  app/
    api/
      routes/
        ai.py
    services/
      rag_service.py
    schemas/
      rag.py
    core/
      config.py
  docs/
    rag-study.md
```

각 파일의 역할은 다음과 같다.

```
api/routes/ai.py
- React에서 들어오는 AI Q&A 요청을 받는 API route
- request schema를 검증하고 service를 호출한다.

services/rag_service.py
- LangChain RAG 핵심 로직을 담당한다.
- 문서 변환, 임베딩, Vector DB 저장, 검색, 답변 생성을 처리한다.

schemas/rag.py
- RAG 관련 request/response schema를 정의한다.

core/config.py
- OpenAI API key, embedding model, chat model, vector DB 경로 등의 설정을 관리한다.

docs/rag-study.md
- 이번 Phase에서 구현한 RAG 개념과 코드 설명을 자세히 기록한다.
```

기존 프로젝트 구조가 다르면, 현재 구조에 맞게 가장 자연스러운 위치에 배치하되, 왜 그렇게 배치했는지 `docs/rag-study.md`에 설명한다.

---

#### 4. API 구현

다음 API를 구현한다.

```
POST /api/v1/ai/qna
```

요청 예시:

```
{
  "question": "넨도로이드 보관할 때 햇빛 조심해야 해?"
}
```

응답 예시:

```
{
  "question": "넨도로이드 보관할 때 햇빛 조심해야 해?",
  "answer": "커뮤니티 게시글을 기준으로 보면, PVC 피규어는 직사광선에 오래 노출될 경우 변색될 수 있으므로 햇빛을 피해서 보관하는 것이 좋습니다.",
  "sources": [
    {
      "post_id": 1,
      "title": "피규어 변색 방지 방법",
      "content_preview": "PVC 피규어는 직사광선에 오래 노출되면 변색될 수 있습니다..."
    }
  ]
}
```

답변에는 반드시 참고한 게시글 정보를 함께 반환한다.

---

#### 5. 게시글 인덱싱 기능 구현

RAG 검색을 위해 게시글 데이터를 Vector DB에 저장하는 기능을 구현한다.

우선 다음 중 현재 프로젝트 상황에 맞는 방식으로 구현한다.

1. 개발용 초기 인덱싱 함수
  - 기존 DB의 게시글을 읽어서 ChromaDB에 저장한다.
2. 게시글 생성 시 자동 인덱싱
  - 게시글 작성 API가 성공하면 해당 게시글을 Vector DB에도 추가한다.

가능하다면 두 방식을 모두 고려하되, 이번 Phase에서는 MVP 기준으로 가장 안정적인 방식을 먼저 구현한다.

구현 시 중복 저장 문제가 생기지 않도록 `post_id`를 metadata에 포함한다.

---

#### 6. 환경변수 처리

OpenAI API Key나 모델명은 코드에 직접 하드코딩하지 않는다.

`.env` 또는 기존 설정 방식을 사용한다.

예상 환경변수:

```
OPENAI_API_KEY=
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_CHAT_MODEL=gpt-4o-mini
CHROMA_PERSIST_DIR=./chroma_db
```

기존 프로젝트에서 이미 설정 관리 방식이 있다면 그 방식을 따른다.

---

#### 7. 예외 처리

다음 상황에 대한 예외 처리를 포함한다.

- 질문이 비어 있는 경우
- Vector DB에 문서가 없는 경우
- 관련 게시글을 찾지 못한 경우
- OpenAI API 호출 실패
- ChromaDB 초기화 실패
- 예상하지 못한 LangChain 오류

관련 게시글이 없을 때는 무리하게 답변을 지어내지 말고, 다음과 같은 응답을 반환한다.

```
{
  "question": "...",
  "answer": "관련 게시글을 찾지 못해 답변을 생성할 수 없습니다.",
  "sources": []
}
```

---

#### 8. 코드 스타일

코드는 다음 기준을 따른다.

- 함수와 클래스 이름은 역할이 명확하게 드러나도록 작성한다.
- RAG 흐름이 처음 보는 사람도 이해할 수 있게 적절한 주석을 작성한다.
- 너무 긴 함수 하나에 모든 로직을 몰아넣지 않는다.
- route, service, schema, config의 역할을 분리한다.
- 테스트하거나 실행해보기 쉬운 작은 함수 단위로 나눈다.
- 기존 프로젝트의 네이밍 컨벤션과 디렉토리 구조를 최대한 유지한다.

---

### 문서 작성 요구사항

구현 완료 후 `docs/rag-study.md`에 다음 내용을 반드시 작성한다.

#### 1. 이번 Phase에서 구현한 기능 요약

- 어떤 기능을 추가했는지
- 사용자가 어떤 흐름으로 기능을 사용하는지
- FastAPI, LangChain, Vector DB, LLM이 각각 어떤 역할을 하는지

#### 2. RAG 개념 설명

초보자가 이해할 수 있도록 다음 개념을 자세히 설명한다.

- RAG가 무엇인지
- 왜 그냥 LLM에게 질문하는 것과 다른지
- Retrieval과 Generation이 각각 무엇인지
- Vector DB가 왜 필요한지
- Embedding이 무엇인지
- Retriever가 하는 일이 무엇인지
- Prompt에 context를 넣는 이유가 무엇인지

#### 3. LangChain 구성 요소 설명

이번 코드에서 사용한 LangChain 구성 요소를 하나씩 설명한다.

- `Document`
- `RecursiveCharacterTextSplitter`
- `OpenAIEmbeddings`
- `Chroma`
- `Retriever`
- `ChatPromptTemplate`
- `ChatOpenAI`
- chain 구성 방식

각 구성 요소에 대해 다음 형식으로 설명한다.

```
개념:
- 이게 무엇인지

우리 코드에서의 역할:
- 어떤 파일의 어떤 코드에서 사용했는지

왜 필요한지:
- RAG 흐름에서 이 요소가 없으면 어떤 문제가 생기는지
```

#### 4. 수정한 파일별 설명

이번 Phase에서 수정하거나 추가한 파일을 모두 나열하고, 각 파일에 대해 자세히 설명한다.

예시:

```
app/services/rag_service.py
- RAG 핵심 로직을 담당한다.
- 게시글을 Document로 변환한다.
- Vector DB에 저장한다.
- 사용자 질문과 관련된 게시글을 검색한다.
- 검색된 context를 기반으로 LLM 답변을 생성한다.
```

각 파일 설명에는 “왜 이 파일에 이 코드가 들어가는지”도 포함한다.

#### 5. 핵심 코드 설명

중요한 코드 블록을 발췌해서 설명한다.

특히 다음 코드는 반드시 설명한다.

- 게시글을 `Document`로 변환하는 코드
- `TextSplitter`로 chunk를 나누는 코드
- embedding 모델을 생성하는 코드
- ChromaDB에 저장하는 코드
- retriever로 관련 문서를 검색하는 코드
- prompt에 context와 question을 넣는 코드
- LLM이 답변을 생성하는 코드
- API route에서 service를 호출하는 코드

각 코드 설명은 단순히 “이 코드는 무엇을 한다”가 아니라, “왜 이 단계가 RAG에서 필요한가”까지 설명한다.

#### 6. 실행 방법

개발자가 직접 테스트할 수 있도록 실행 방법을 적는다.

포함할 내용:

- 필요한 패키지 설치 명령어
- 필요한 환경변수
- 서버 실행 방법
- 게시글 인덱싱 방법
- API 테스트 예시
- 예상 응답 예시

#### 7. 한계와 다음 개선 방향

이번 구현의 한계와 추후 개선 방향을 작성한다.

예시:

- 운영 환경에서는 pgvector 또는 관리형 Vector DB를 고려할 수 있다.
- 현재는 게시글 기반 Q&A만 지원한다.
- 추후 유사 게시글 추천, 중복 질문 방지, URL 기반 외부 문서 RAG로 확장할 수 있다.
- 현재는 단순 top-k 검색을 사용한다.
- 추후 reranker, metadata filter, hybrid search 등을 추가할 수 있다.

---

### 구현 완료 조건

- 사용자의 질문에 대해 관련 게시글을 검색할 수 있다.
- 검색된 게시글 context를 기반으로 LLM 답변을 생성한다.
- 응답에 참고한 게시글 source 정보가 포함된다.
- 관련 게시글이 없을 때 적절한 fallback 응답을 반환한다.
- OpenAI API Key와 모델명은 환경변수로 관리된다.
- RAG 관련 핵심 로직이 service 계층에 분리되어 있다.
- `docs/rag-study.md`에 구현 내용과 개념 설명이 자세히 정리되어 있다.

---

### 중요한 작성 방식

이번 Phase의 코드는 단순히 빠르게 동작하게 만드는 것보다, 사용자가 코드를 읽으면서 RAG와 LangChain을 학습할 수 있도록 작성하는 것이 중요하다.

따라서 다음 원칙을 지킨다.

- 구현하면서 너무 축약된 코드를 피한다.
- 초보자가 읽어도 흐름을 따라갈 수 있도록 변수명을 명확히 쓴다.
- LangChain의 각 단계가 코드에서 잘 드러나도록 작성한다.
- 복잡한 추상화보다 이해 가능한 정석 구조를 우선한다.
- 필요한 곳에는 주석을 달되, 주석이 코드와 중복되지 않도록 “왜 필요한지”를 설명한다.
- 문서에서는 친절하고 자세하게 설명한다.
- 구현 후 코드와 문서가 서로 맞는지 확인한다.

## AI Phase 1. AI용 DB 모델 구현

목표: RAG와 AI 결과 저장을 위한 테이블을 추가한다.

구현 파일:

- `backend/app/models/content_chunk.py`
- `backend/app/models/ai_output.py`
- `backend/app/models/ai_output_source.py`
- `backend/app/schemas/ai_schema.py`
- `backend/app/repositories/content_chunk_repository.py`
- `backend/app/repositories/ai_output_repository.py`

구현 내용:

- 게시글/댓글 청크 저장
- AI 결과 저장
- AI 근거 저장
- `AiOutput.status`에 `REQUESTED`, `PROCESSING`, `GENERATED`, `FAILED` 포함
- `grounding_status` 저장

공부 포인트:

- AI 결과를 댓글과 분리해서 저장하는 이유
- 근거 링크를 별도 테이블로 두는 이유
- 비동기 상태 관리

## AI Phase 2. RAG 인덱싱 구현

목표: 게시글과 댓글을 검색 가능한 청크로 만든다.

구현 파일:

- `backend/app/ai/rag/document_loader.py`
- `backend/app/ai/rag/text_splitter.py`
- `backend/app/ai/rag/embedding_client.py`
- `backend/app/ai/rag/vector_store.py`
- `backend/app/ai/rag/indexing_service.py`
- `backend/app/api/routes/internal.py`
- `scripts/create_pgvector_extension.sql`
- `scripts/reindex_content_chunks.py`

구현 API:

- `POST /api/v1/internal/indexing/posts/{post_id}`
- `POST /api/v1/internal/indexing/comments/{comment_id}`

구현 내용:

- 게시글/댓글 텍스트 수집
- 청크 분리
- 임베딩 생성
- pgvector 저장
- 수정된 글은 기존 청크 `STALE` 처리 후 재인덱싱

공부 포인트:

- RAG에서 chunk가 필요한 이유
- embedding vector가 무엇인지
- 검색용 데이터와 원본 데이터를 분리하는 이유

## AI Phase 3. RAG Q&A 구현

목표: 사용자가 질문하면 게시판 데이터를 근거로 답변한다.

구현 파일:

- `backend/app/ai/llm/llm_client.py`
- `backend/app/ai/llm/prompts.py`
- `backend/app/ai/rag/retriever.py`
- `backend/app/ai/rag/rag_chain.py`
- `backend/app/ai/usecases/qna_answer.py`
- `backend/app/services/ai_service.py`
- `backend/app/api/routes/ai.py`
- `frontend/src/api/aiApi.js`
- `frontend/src/hooks/useAiAnswer.js`
- `frontend/src/pages/AiQnaPage.jsx`
- `frontend/src/components/ai/AiAnswerBox.jsx`
- `frontend/src/components/ai/AiSourceList.jsx`

구현 API:

- `POST /api/v1/ai/qna`
- `GET /api/v1/ai/outputs/{ai_output_id}`

정책:

- 근거가 있으면 근거 기반 답변을 생성한다.
- 근거가 부족하면 부족하다고 말한다.
- 추측성 답변을 최소화한다.
- 근거 게시글/댓글 링크를 함께 제공한다.

공부 포인트:

- retrieve → generate 흐름
- AI 답변을 비동기로 처리하는 이유
- sources를 사용자에게 보여주는 이유

## AI Phase 4. 유사 게시글 추천 구현

목표: 게시글 상세에서 유사 게시글 3개를 추천한다.

구현 파일:

- `backend/app/ai/usecases/similar_posts.py`
- `backend/app/ai/rag/retriever.py`
- `backend/app/api/routes/posts.py`
- `frontend/src/components/post/SimilarPostList.jsx`

구현 API:

- `GET /api/v1/posts/{post_id}/similar-posts?limit=3`

구현 내용:

- 현재 게시글의 제목, 본문, 태그와 후기 글의 피규어 정보를 검색 문맥으로 만든다.
- vector search로 유사 글을 찾는다.
- 현재 게시글은 제외한다.
- MVP 이후에도 추천 결과는 저장하지 않고 실시간 계산한다.

공부 포인트:

- 키워드 검색과 의미 검색의 차이
- 추천 결과를 저장하지 않는 이유
- 추천 이유를 만드는 방법

## AI Phase 5. 질문 게시글 참고 답변 구현

목표: 질문 게시판 글에 AI 참고 답변을 붙인다.

구현 파일:

- `backend/app/ai/usecases/question_reference_answer.py`
- `backend/app/services/ai_service.py`
- `backend/app/api/routes/ai.py`
- `frontend/src/components/ai/AiAnswerBox.jsx`
- `frontend/src/components/ai/AiSourceList.jsx`

구현 API:

- `POST /api/v1/posts/{post_id}/ai/reference-answer`

정책:

- 대상 게시글은 `QUESTION` 게시판이어야 한다.
- AI 답변은 댓글로 저장하지 않는다.
- `AiOutput`으로 저장하고 상세 화면의 AI 영역에 표시한다.

공부 포인트:

- 같은 AI 답변이라도 사용 목적에 따라 output_type이 달라지는 이유
- 사용자 댓글과 AI 참고 답변을 분리하는 이유

## AI Phase 6. 구매 고민 요약 구현

목표: 구매 고민 게시글에 동일/유사 피규어 후기 요약을 제공한다.

구현 파일:

- `backend/app/ai/usecases/purchase_summary.py`
- `backend/app/services/ai_service.py`
- `frontend/src/components/ai/PurchaseSummaryBox.jsx`

구현 API:

- `POST /api/v1/posts/{post_id}/ai/purchase-summary`

정책:

- 대상 게시글은 `PURCHASE_HELP` 게시판이어야 한다.
- 동일 피규어 후기 요약, 유사 가격대 추천, 장점/단점을 제공한다.
- 근거가 부족하면 부족하다고 표시한다.

공부 포인트:

- 여러 검색 결과를 요약하는 방식
- 장점/단점 구조화
- 구매 판단 보조 정보와 단정적 추천의 차이



## AI Phase 8. MCP 서버 구현

목표: 외부 URL 메타데이터 수집 도구를 별도 MCP 서버로 분리한다.

구현 파일:

- `mcp-server/main.py`
- `mcp-server/server.py`
- `mcp-server/tools/link_preview_tool.py`
- `mcp-server/tools/shopping_metadata_tool.py`
- `mcp-server/tools/youtube_metadata_tool.py`
- `mcp-server/clients/http_client.py`
- `mcp-server/clients/naver_shopping_client.py`
- `mcp-server/schemas/tool_schema.py`
- `mcp-server/schemas/preview_schema.py`
- `mcp-server/utils/url_parser.py`
- `mcp-server/utils/metadata_parser.py`

구현 내용:

- 외부 페이지 요청
- HTML metadata 파싱
- 쇼핑몰/유튜브/뉴스 페이지 요약 정보 수집
- 실패 시 명확한 실패 상태 반환

공부 포인트:

- 백엔드에 모든 외부 수집 로직을 넣지 않는 이유
- tool input/output schema
- 외부 사이트 실패를 서비스 장애로 만들지 않는 방법

## AI Phase 9. 입문자 정보글 초안 / 운영자 검수 구현

목표: 반복 질문을 바탕으로 정보글 초안을 생성하고 운영자가 검수 후 발행한다.

구현 파일:

- `backend/app/ai/usecases/beginner_info_draft.py`
- `backend/app/services/ai_service.py`
- `backend/app/api/routes/ai.py`
- `frontend/src/components/ai/AiDraftCard.jsx`

구현 API:

- `POST /api/v1/ai/beginner-info-drafts`
- `PATCH /api/v1/ai/outputs/{ai_output_id}/review`
- `POST /api/v1/ai/outputs/{ai_output_id}/publish`

정책:

- 운영자만 초안 생성, 검수, 발행할 수 있다.
- 발행된 게시글은 `source_type=AI_PUBLISHED`다.
- 사용자 작성 글과 명확히 구분한다.

공부 포인트:

- 운영자 권한
- AI 초안 상태 전이
- AI 결과를 게시글로 발행하는 매핑

## AI Phase 10. LangGraph Agent 흐름 정리

목표: 여러 AI 작업의 흐름을 LangGraph로 정리한다.

구현 파일:

- `backend/app/ai/agent/state.py`
- `backend/app/ai/agent/graph.py`
- `backend/app/ai/agent/nodes.py`
- `backend/app/ai/agent/edges.py`
- `backend/app/ai/agent/tools.py`

구현 내용:

- intent 분류
- RAG 검색
- MCP 도구 호출
- 답변 생성
- fallback 처리
- 최대 반복 횟수 제한
- 실패 상태 저장

공부 포인트:

- 단순 chain과 agent graph의 차이
- 상태 기반 AI 흐름
- 도구 호출 순서 제어

## 4. 구현 중 항상 확인할 문서

기능 구현 전:

- `docs/architecture/api-design.md`
- `docs/database/schema-design.md`

테스트 전:

- `docs/testing/test-scenarios.md`

프로젝트 구조 확인:

- `docs/architecture/project-structure.txt`

## 5. 작업 단위 규칙

각 phase를 구현할 때 Codex는 다음 순서를 따른다.

1. 관련 설계 문서를 읽는다.
2. 해당 phase에서 수정할 파일 목록을 말한다.
3. 백엔드 model/schema/repository/service/route 순서로 구현한다.
4. 프론트 api/hook/component/page 순서로 구현한다.
5. 직접 실행 가능한 검증 방법을 남긴다.
6. 학습 포인트를 짧게 설명한다.

한 번에 너무 많은 phase를 구현하지 않는다.  
사용자가 “다음 phase 진행”이라고 하면 다음 단계로 넘어간다.

## 6. MVP 완료 정의

MVP는 아래 조건을 만족하면 완료로 본다.

- 회원가입과 로그인이 된다.
- 로그인 사용자가 게시글을 작성할 수 있다.
- 후기 게시글에 피규어 정보와 이미지를 연결할 수 있다.
- 게시글 목록, 상세, 수정, 삭제가 된다.
- 댓글 작성, 수정, 삭제가 된다.
- 태그 입력과 태그 검색이 된다.
- 게시글 검색과 페이지네이션이 된다.
- 마이페이지에서 내 게시글과 내 댓글을 볼 수 있다.
- 비회원/회원/작성자 권한이 구분된다.
- AI 관련 기능이 없어도 게시판 서비스로 사용할 수 있다.

MVP 완료 전까지 AI 관련 endpoint를 사용자 화면에 노출하지 않는다.