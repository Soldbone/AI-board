# MVP Phase 5 구현 가이드

이 문서는 `agents.md`의 MVP Phase 5, 즉 게시글 작성/수정/삭제 기능을 구현하면서 어떤 파일을 바꿨고, 각 코드가 어떤 역할을 하는지 학습용으로 정리한 문서다. 이번 단계에서는 AI, 링크 미리보기, 이미지 업로드, 태그 연결을 구현하지 않는다. 사용자가 URL을 직접 입력하는 필드도 만들지 않는다.

## 1. 이번 Phase에서 바꾼 파일

### 백엔드

- `backend/app/schemas/post_schema.py`
  - 게시글 작성/수정 요청 스키마를 추가했다.
  - FastAPI가 요청 JSON을 Pydantic 모델로 검증할 수 있게 한다.
- `backend/app/repositories/post_repository.py`
  - 게시글 생성, 수정 대상 조회, 피규어 정보 저장, soft delete 같은 DB 작업 함수를 추가했다.
  - SQLAlchemy ORM을 사용해서 Python 객체를 PostgreSQL row로 저장한다.
- `backend/app/services/post_service.py`
  - 게시판별 필수값 검증, 작성자 권한 검사, REVIEW 전용 피규어 정보 규칙을 추가했다.
  - 여러 테이블을 함께 저장하는 트랜잭션 흐름을 관리한다.
- `backend/app/api/routes/posts.py`
  - `POST /api/v1/posts`, `PATCH /api/v1/posts/{post_id}`, `DELETE /api/v1/posts/{post_id}`를 추가했다.
  - 라우터는 요청을 받고 service를 호출하는 얇은 계층으로 유지했다.

### 프론트엔드

- `frontend/src/api/postApi.js`
  - `createPost`, `updatePost`, `deletePost` API 호출 함수를 추가했다.
- `frontend/src/App.jsx`
  - 기존 React Router 없는 상태 기반 화면 전환 구조에 `write`, `edit` 화면을 추가했다.
- `frontend/src/pages/PostListPage.jsx`
  - 로그인 사용자에게 글쓰기 버튼을 보여준다.
- `frontend/src/pages/PostDetailPage.jsx`
  - 작성자에게만 수정/삭제 버튼을 보여준다.
- `frontend/src/pages/PostWritePage.jsx`
  - 게시글 작성 페이지를 구현했다.
- `frontend/src/pages/PostEditPage.jsx`
  - 게시글 수정 페이지를 구현했다.
- `frontend/src/components/post/PostForm.jsx`
  - 작성/수정 공통 폼을 구현했다.
- `frontend/src/components/post/FigureInfoForm.jsx`
  - REVIEW 게시판에서만 사용하는 피규어 정보 입력 폼을 구현했다.
- `frontend/src/App.css`
  - 게시글 폼, fieldset, danger 버튼, 모바일 대응 스타일을 추가했다.

## 2. FastAPI 요청 흐름

게시글 작성 요청은 아래 순서로 이동한다.

```text
React PostForm
-> frontend/src/api/postApi.js
-> POST /api/v1/posts
-> backend/app/api/routes/posts.py
-> backend/app/services/post_service.py
-> backend/app/repositories/post_repository.py
-> SQLAlchemy Session
-> PostgreSQL
```

FastAPI 라우터인 `posts.py`는 복잡한 판단을 하지 않는다. 예를 들어 `create_post` 라우터 함수는 `PostCreateRequest`로 요청을 받고, `CurrentUser` dependency로 로그인 사용자를 받고, 그대로 `post_service.create_post()`를 호출한다.

이 구조의 장점은 계층별 역할이 명확하다는 점이다.

- router: HTTP 요청/응답, path/query/body/dependency 연결
- schema: 요청/응답 데이터 모양과 기본 검증
- service: 서비스 규칙과 권한 검사
- repository: DB 조회/저장
- model: DB 테이블과 Python 객체의 매핑

## 3. Pydantic 스키마의 역할

`post_schema.py`에 추가한 주요 스키마는 다음과 같다.

- `PostCreateRequest`
  - 게시글 작성 요청 body다.
  - `board_code`, `title`, `content`, `status`, `figure_info`를 받는다.
  - `title`, `content`는 공백만 들어오면 실패하도록 validator에서 `strip()` 후 검사한다.
- `PostUpdateRequest`
  - 게시글 수정 요청 body다.
  - 모든 필드가 선택값이다.
  - 수정 요청에서는 보낸 필드만 바꿀 수 있게 `payload.model_fields_set`을 service에서 활용한다.
- `PostFigureInfoRequest`
  - 후기 게시판의 피규어 정보 요청 body다.
  - API에서는 `figure_name`, `manufacturer`라는 쉬운 이름을 쓴다.
- `PostCreateResponse`
  - 작성 직후 최소 응답이다.
  - 프론트가 생성된 글 상세로 이동할 수 있도록 `id`를 포함한다.

Pydantic은 "형식 검증"에 강하다. 하지만 "REVIEW 게시판이면 피규어명이 필수" 같은 조건은 다른 필드의 값과 조합해서 판단해야 한다. 그래서 이 규칙은 `post_service.py`에 둔다.

## 4. SQLAlchemy와 PostgreSQL 매핑

게시글은 `Post` 모델로 저장된다.

```text
Post Python 객체
-> posts PostgreSQL 테이블 row
```

후기 게시글의 피규어 정보는 `PostFigureInfo` 모델로 저장된다.

```text
PostFigureInfo Python 객체
-> post_figure_infos PostgreSQL 테이블 row
```

API 요청에서는 다음 이름을 사용한다.

```json
{
  "figure_name": "하츠네 미쿠 NT 스타일",
  "manufacturer": "Good Smile Company"
}
```

DB 모델에서는 다음 컬럼에 저장한다.

```text
figure_name_text
manufacturer_text
```

이렇게 나눈 이유는 나중에 `Figure` 같은 정규화된 마스터 테이블이 생길 수 있기 때문이다. 지금 MVP에서는 사용자가 입력한 텍스트를 그대로 저장하므로 `*_text` 컬럼명이 더 명확하다. 매핑은 `post_service.py`의 `_build_figure_info_values()`에서 처리한다.

## 5. 게시판별 작성 규칙

이번 Phase에서 구현한 규칙은 다음과 같다.

- `REVIEW`
  - `title`, `content` 필수
  - `figure_info.figure_name` 필수
  - `figure_info.satisfaction_score` 필수
  - `PostFigureInfo`를 생성한다.
- `INFO`
  - `title`, `content` 필수
  - `figure_info`를 받지 않는다.
- `QUESTION`
  - `title`, `content` 필수
  - `figure_info`를 받지 않는다.
- `PURCHASE_HELP`
  - `title`, `content` 필수
  - 구매 고민 대상은 제목과 본문에 작성한다.
  - `PostFigureInfo`를 만들지 않는다.
- `NOTICE`, `FAQ`
  - MVP Phase 5에서는 작성할 수 없게 막았다.
  - 운영자 기능은 이후 phase에서 구현한다.

## 6. 작성자 권한 검사

수정과 삭제는 작성자만 가능하다.

`post_service.py`의 `_ensure_post_author()`가 다음 값을 비교한다.

```text
post.author_id == current_user.id
```

여기서 `current_user`는 FastAPI dependency인 `CurrentUser`가 JWT access token을 해석해서 가져온 사용자다.

프론트에서도 작성자에게만 수정/삭제 버튼을 보여준다.

```text
currentUser?.id === post.author.id
```

하지만 프론트의 버튼 숨김은 사용자 경험을 위한 것이다. 실제 보안 판단은 반드시 백엔드에서 다시 해야 한다. 사용자는 브라우저 개발자 도구나 curl로 직접 요청할 수 있기 때문이다.

## 7. Soft Delete

삭제 API는 DB row를 실제로 지우지 않는다.

`post_repository.soft_delete_post()`는 다음 값을 바꾼다.

```text
status = DELETED
deleted_at = 현재 UTC 시간
```

목록/상세 조회는 이미 `status == PUBLISHED`, `deleted_at is None` 조건을 사용한다. 그래서 soft delete된 게시글은 사용자 화면에서 보이지 않는다.

이 방식은 다음 장점이 있다.

- 실수로 삭제한 데이터를 운영자가 복구할 수 있다.
- 신고, 감사 로그, AI 인덱싱 같은 확장 기능에서 원본 추적이 쉬워진다.
- 댓글이나 이미지처럼 연결된 데이터와의 관계를 갑자기 끊지 않아도 된다.

## 8. React 작성/수정 폼 구조

프론트는 `PostForm`을 작성과 수정에서 함께 사용한다.

```text
PostWritePage -> PostForm -> createPost()
PostEditPage  -> PostForm -> updatePost()
```

`PostForm`은 controlled component 방식으로 동작한다.

- `boardCode`는 선택된 게시판 코드 상태다.
- `title`은 제목 input 상태다.
- `content`는 본문 textarea 상태다.
- `figureInfo`는 피규어 정보 fieldset 상태다.

게시판이 `REVIEW`일 때만 `FigureInfoForm`을 렌더링한다.

```jsx
{isReviewBoard && (
  <FigureInfoForm value={figureInfo} onChange={setFigureInfo} />
)}
```

이 조건부 렌더링 덕분에 `PURCHASE_HELP` 글쓰기 화면에는 피규어 정보 입력칸이 나오지 않는다. URL 입력칸도 만들지 않았다.

## 9. 직접 검증 방법

### 정적 검증

백엔드 Python 문법 확인:

```powershell
C:\Users\yoonj\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m compileall backend\app
```

프론트 빌드 확인:

```powershell
cd frontend
cmd.exe /c "C:\Progra~1\nodejs\npm.cmd run build"
```

### API 시나리오

1. 비로그인 상태에서 `POST /api/v1/posts`를 호출하면 401이 나와야 한다.
2. 로그인 후 `REVIEW` 게시글을 작성하면 201과 생성된 게시글 ID가 나와야 한다.
3. `REVIEW` 게시글 작성에서 `figure_info.figure_name`을 비우면 실패해야 한다.
4. `REVIEW` 게시글 작성에서 `figure_info.satisfaction_score`를 비우면 실패해야 한다.
5. `PURCHASE_HELP` 게시글을 작성하면 `post_figure_infos` row가 생기지 않아야 한다.
6. 작성자가 `PATCH /api/v1/posts/{post_id}`를 호출하면 수정되어야 한다.
7. 다른 사용자가 같은 글을 수정하거나 삭제하면 403이 나와야 한다.
8. 작성자가 `DELETE /api/v1/posts/{post_id}`를 호출하면 204가 나와야 한다.
9. 삭제된 게시글은 목록과 상세 조회에서 보이지 않아야 한다.

### 프론트 시나리오

1. 회원가입 또는 로그인한다.
2. 게시글 목록에서 `글쓰기`를 누른다.
3. `REVIEW`를 선택하면 피규어 정보 폼이 표시되는지 확인한다.
4. `PURCHASE_HELP`를 선택하면 피규어 정보 폼이 숨겨지는지 확인한다.
5. 게시글 작성 후 상세 화면으로 이동하는지 확인한다.
6. 내가 작성한 글 상세에서 `수정`, `삭제` 버튼이 보이는지 확인한다.
7. 수정 후 상세 화면에 바뀐 제목/본문/피규어 정보가 보이는지 확인한다.
8. 삭제 후 목록 화면으로 돌아가는지 확인한다.

## 10. 다음 Phase와 연결되는 지점

Phase 5는 일부러 좁게 구현했다.

- Phase 6 이미지 업로드
  - 지금은 `image_ids`를 요청 schema에 넣지 않았다.
  - 다음 단계에서 임시 업로드된 이미지를 게시글에 연결하면 된다.
- Phase 8 태그
  - 지금은 `tags`를 요청 schema에 넣지 않았다.
  - 다음 단계에서 태그 생성/재사용과 `PostTag` 연결을 service에 추가하면 된다.
- AI/MCP 기능
  - MVP 완료 전까지 사용자 화면에 노출하지 않는다.
  - 게시글 작성 API에도 `external_urls`, `link_preview_ids`를 넣지 않는다.

이 구조를 유지하면 기능이 늘어나도 라우터가 비대해지지 않고, service와 repository의 책임을 구분하면서 학습하기 좋은 코드base를 유지할 수 있다.
