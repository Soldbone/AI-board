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

---

# MVP Phase 6 이미지 업로드 구현 가이드

Phase 6에서는 게시글 작성 전에 이미지를 먼저 임시 업로드하고, 게시글 작성/수정 요청에서 `image_ids`로 이미지를 연결하는 흐름을 구현했다. 이미지 파일 자체는 PostgreSQL에 저장하지 않고 로컬 파일시스템에 저장한다. DB에는 파일 URL, MIME 타입, 크기, 이미지 너비/높이, 상태 같은 메타데이터만 저장한다.

## 1. 이번 Phase에서 바꾼 파일

### 백엔드

- `backend/requirements.txt`
  - 썸네일 생성과 이미지 크기 추출을 위해 `Pillow`를 추가했다.
- `backend/app/core/config.py`
  - 업로드 파일의 루트 경로인 `upload_root` 설정을 추가했다.
- `backend/app/main.py`
  - 이미지 API 라우터를 연결했다.
  - `/uploads` 경로를 `StaticFiles`로 마운트했다.
- `backend/app/schemas/image_schema.py`
  - 이미지 업로드 응답 스키마인 `ImageResponse`를 추가했다.
- `backend/app/repositories/image_repository.py`
  - `PostImage` row 생성, 조회, 메타데이터 수정, 삭제 상태 변경 함수를 추가했다.
- `backend/app/services/image_service.py`
  - 파일 타입/용량 검증, 이미지 크기 검증, 파일 저장, 썸네일 생성, DB commit/rollback 흐름을 구현했다.
- `backend/app/api/routes/images.py`
  - `POST /api/v1/images`, `DELETE /api/v1/images/{image_id}`를 추가했다.
- `backend/app/storage/local_storage.py`
  - 로컬 저장 경로와 공개 URL을 만드는 함수를 추가했다.
- `backend/app/storage/thumbnail_generator.py`
  - Pillow로 이미지 크기를 읽고 썸네일을 생성하는 함수를 추가했다.
- `backend/app/schemas/post_schema.py`
  - 게시글 작성/수정 요청에 `image_ids`를 추가했다.
- `backend/app/services/post_service.py`
  - `image_ids` 검증과 게시글-이미지 연결 로직을 추가했다.

### 프론트엔드

- `frontend/src/api/imageApi.js`
  - `uploadImage(file)`, `deleteImage(imageId)`를 추가했다.
- `frontend/src/components/post/ImageUploader.jsx`
  - 파일 선택, 업로드 요청, 썸네일 미리보기, 제거 UI를 구현했다.
- `frontend/src/components/post/PostForm.jsx`
  - 작성/수정 공통 폼에 `ImageUploader`를 연결하고 submit payload에 `image_ids`를 포함했다.
- `frontend/src/App.css`
  - 이미지 업로더와 미리보기 그리드 스타일을 추가했다.
- `.gitignore`
  - 로컬 업로드 산출물인 `uploads/temp/`를 git 추적에서 제외했다.

## 2. 이미지 업로드 요청 흐름

이미지 업로드 요청은 아래 순서로 처리된다.

```text
React ImageUploader
-> imageApi.uploadImage(file)
-> FormData multipart/form-data
-> POST /api/v1/images
-> FastAPI UploadFile
-> image_service.upload_image()
-> local_storage + thumbnail_generator
-> image_repository
-> post_images row 저장
```

게시글 작성 요청은 그 다음 단계다.

```text
POST /api/v1/posts
body.image_ids = [20, 21]
-> post_service.create_post()
-> image_ids 소유자/상태 검증
-> Post 생성
-> PostImage.post_id = post.id
-> PostImage.status = ATTACHED
```

이렇게 두 단계로 나누면 React 작성 폼에서 이미지를 먼저 업로드해 미리보기를 보여줄 수 있다. 게시글 저장에 실패하더라도 이미지 업로드 API와 게시글 API의 책임이 분리되어 있어 흐름을 이해하기 쉽다.

## 3. FastAPI UploadFile과 multipart/form-data

일반 JSON 요청과 달리 파일 업로드는 `multipart/form-data`를 사용한다.

프론트에서는 `FormData`를 만든다.

```jsx
const formData = new FormData();
formData.append("file", file);
await axiosInstance.post("/images", formData);
```

백엔드 라우터에서는 `UploadFile`과 `File(...)`을 사용한다.

```python
async def upload_image(
    db: DbSession,
    current_user: CurrentUser,
    file: Annotated[UploadFile, File(...)],
) -> ImageResponse:
    ...
```

`UploadFile`은 업로드된 파일의 이름, MIME 타입, 파일 내용을 다룰 수 있는 FastAPI 객체다. 이번 구현에서는 service에서 `await file.read()`로 파일 바이트를 읽고, 크기와 이미지 형식을 검증한다.

## 4. 파일과 DB를 분리해서 저장하는 이유

이미지 파일은 DB에 직접 넣지 않는다. 대신 다음처럼 나눈다.

```text
파일시스템
uploads/temp/{image_id}/original.jpg
uploads/temp/{image_id}/thumb.jpg

PostgreSQL post_images row
id
file_url
thumbnail_url
original_name
mime_type
size_bytes
width
height
status
post_id
```

이 구조의 장점은 다음과 같다.

- DB row는 검색과 관계 연결에 집중한다.
- 큰 파일 바이트를 DB에 넣지 않아 DB 부하를 줄인다.
- 프론트는 `/uploads/...` URL만 받아 `<img>`로 표시할 수 있다.
- 나중에 로컬 저장소를 S3 같은 외부 스토리지로 바꾸더라도 DB 구조는 크게 바뀌지 않는다.

## 5. StaticFiles로 이미지 URL 제공하기

`main.py`에는 다음 역할이 추가되었다.

```text
/uploads URL
-> settings.upload_root 디렉터리
```

즉 DB에 `/uploads/temp/20/thumb.jpg`가 저장되어 있으면 브라우저는 다음 URL로 이미지를 요청한다.

```text
http://localhost:8000/uploads/temp/20/thumb.jpg
```

프론트의 `ImageUploader`와 `PostDetailPage`는 API base URL에서 `/api/v1`을 제거해 이미지 URL의 origin을 만든다.

## 6. SQLAlchemy에서 이미지 연결하기

이미지 업로드 직후 `PostImage`는 아래 상태다.

```text
post_id = null
status = TEMP
uploader_id = 현재 사용자 ID
```

게시글 작성 시 `image_ids`가 들어오면 service에서 다음을 확인한다.

- 해당 이미지 ID가 존재하는가
- 현재 사용자가 업로드한 이미지인가
- 삭제된 이미지가 아닌가
- 이미 다른 게시글에 연결된 이미지가 아닌가

검증을 통과하면 다음처럼 변경한다.

```text
post_id = 새 게시글 ID
status = ATTACHED
sort_order = image_ids 배열 순서
```

수정 시에는 요청으로 받은 `image_ids`를 기준으로 현재 게시글의 이미지 목록을 동기화한다. 폼에서 제거된 기존 이미지는 파일 삭제가 아니라 연결 해제로 처리한다.

```text
post_id = null
status = TEMP
```

이렇게 하면 “폼에서 이미지 제거”와 “이미지 리소스 삭제”를 구분해서 배울 수 있다. 실제 삭제 API인 `DELETE /api/v1/images/{image_id}`는 `status=DELETED`로 바꾼다.

## 7. React ImageUploader 구조

`ImageUploader`는 controlled component 형태로 만들었다.

```jsx
<ImageUploader
  disabled={isSubmitting}
  value={images}
  onChange={setImages}
/>
```

`value`는 현재 폼에 연결된 이미지 배열이다. 새 이미지를 업로드하면 API 응답을 배열에 추가하고, 제거하면 배열에서 뺀다. `PostForm`은 최종 submit 시 아래처럼 ID만 추출해서 게시글 API로 보낸다.

```jsx
payload.image_ids = images.map((image) => image.id);
```

이 구조를 쓰면 이미지 업로드 UI는 파일 처리에 집중하고, 게시글 폼은 게시글 payload를 만드는 데 집중할 수 있다.

## 8. 직접 검증 방법

### 정적 검증

백엔드 문법 확인:

```powershell
$env:PYTHONPYCACHEPREFIX="$env:TEMP\yoonji-pycache"
C:\Users\yoonj\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m compileall backend\app
```

프론트 빌드 확인:

```powershell
cd frontend
cmd.exe /c "C:\Progra~1\nodejs\npm.cmd run build"
```

### API 시나리오

1. 비로그인 상태에서 `POST /api/v1/images`를 호출하면 401이 나와야 한다.
2. 로그인 후 JPEG, PNG, WEBP 이미지를 업로드하면 201과 `status=TEMP`가 나와야 한다.
3. 업로드 응답에 `file_url`, `thumbnail_url`, `width`, `height`가 포함되어야 한다.
4. 5MB 초과 파일이나 이미지가 아닌 파일은 실패해야 한다.
5. 게시글 작성 요청에 `image_ids`를 포함하면 상세 조회의 `images`에 표시되어야 한다.
6. 수정 요청에서 `image_ids`를 바꾸면 상세 조회 이미지 목록이 바뀌어야 한다.
7. 다른 사용자가 업로드한 이미지 ID를 연결하려 하면 403이 나와야 한다.
8. 삭제된 이미지나 다른 게시글에 연결된 이미지 ID를 연결하려 하면 실패해야 한다.

### 프론트 시나리오

1. 로그인한다.
2. 글쓰기 화면에서 이미지를 선택한다.
3. 업로드 후 썸네일 미리보기가 표시되는지 확인한다.
4. REVIEW 게시글을 작성한다.
5. 상세 화면에서 이미지가 표시되는지 확인한다.
6. 수정 화면에서 기존 이미지가 보이는지 확인한다.
7. 이미지를 제거하거나 새로 추가한 뒤 저장했을 때 상세 화면이 바뀌는지 확인한다.
8. 작성/수정 화면에 URL 입력칸이 없는지 확인한다.

---

# MVP Phase 7 댓글 구현 가이드

Phase 7에서는 게시글 상세 화면에서 댓글을 읽고, 로그인한 사용자가 댓글을 작성/수정/삭제할 수 있게 만들었다. 이번 단계에서도 MVP 원칙을 지켜 AI/RAG 인덱싱은 연결하지 않았다. 댓글 작성/수정 후 RAG 인덱싱 작업을 큐에 넣는 내용은 설계 문서에 있지만, 실제 AI 기능은 MVP 완료 후 AI phase에서 붙인다.

## 1. 이번 Phase에서 바꾼 파일

### 백엔드

- `backend/app/schemas/comment_schema.py`
  - 댓글 작성/수정 요청 스키마와 댓글 목록/단건 응답 스키마를 추가했다.
  - `content`는 `strip()` 후 빈 문자열이면 validation error가 나게 했다.
- `backend/app/repositories/comment_repository.py`
  - 공개 게시글 조회, 댓글 목록/개수 조회, 댓글 생성, 수정 대상 조회, soft delete, 댓글 수 증감 함수를 추가했다.
  - SQLAlchemy `select()`, `joinedload()`, `func.count()`를 사용한다.
- `backend/app/services/comment_service.py`
  - 댓글 API의 실제 서비스 규칙을 구현했다.
  - 게시글 존재 여부, 작성자 권한, 트랜잭션 commit/rollback, `comment_count` 갱신을 담당한다.
- `backend/app/api/routes/comments.py`
  - 댓글 목록, 작성, 수정, 삭제 API endpoint를 추가했다.
- `backend/app/main.py`
  - FastAPI 앱에 comments router를 연결했다.

### 프론트엔드

- `frontend/src/api/commentApi.js`
  - 댓글 API를 호출하는 함수들을 추가했다.
- `frontend/src/hooks/useComments.js`
  - 댓글 목록, 페이지, 로딩, 에러, 작성/수정/삭제 action 상태를 관리하는 hook을 추가했다.
- `frontend/src/components/comment/CommentForm.jsx`
  - 로그인 사용자에게 댓글 작성 textarea를 보여준다.
  - 비로그인 사용자에게는 로그인 안내만 보여준다.
- `frontend/src/components/comment/CommentList.jsx`
  - 댓글 목록을 렌더링하고, 본인 댓글에만 수정/삭제 버튼을 보여준다.
  - 수정은 댓글 카드 안에서 textarea로 바로 처리한다.
- `frontend/src/pages/PostDetailPage.jsx`
  - 게시글 상세 하단에 댓글 form/list 영역을 연결했다.
  - 댓글 작성/삭제 후 게시글 상세를 다시 불러와 상단 `comment_count`를 갱신한다.
- `frontend/src/hooks/usePosts.js`
  - `usePostDetail()`에서 `reloadPost()`를 반환하게 했다.
- `frontend/src/App.css`
  - 댓글 작성 폼, 댓글 카드, inline edit, 댓글 pagination 스타일을 추가했다.

## 2. 댓글 API 요청 흐름

댓글 작성 요청은 아래 순서로 이동한다.

```text
React CommentForm
-> frontend/src/api/commentApi.js
-> POST /api/v1/posts/{post_id}/comments
-> backend/app/api/routes/comments.py
-> backend/app/services/comment_service.py
-> backend/app/repositories/comment_repository.py
-> SQLAlchemy Session
-> PostgreSQL comments row 저장
```

여기서 중요한 점은 router가 직접 DB를 만지지 않는다는 것이다. FastAPI 라우터는 path parameter, request body, dependency를 받아 service에 넘긴다.

```python
def create_comment(
    post_id: Annotated[int, Path(gt=0)],
    payload: CommentCreateRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> CommentResponse:
    return comment_service.create_comment(...)
```

`CurrentUser`는 JWT access token을 읽어서 로그인 사용자를 가져오는 FastAPI dependency다. 그래서 댓글 작성, 수정, 삭제 API는 함수 인자에 `current_user: CurrentUser`를 추가하는 것만으로 인증이 필요한 endpoint가 된다.

## 3. Pydantic 스키마의 역할

`comment_schema.py`에는 요청과 응답의 모양을 분리해서 만들었다.

- `CommentCreateRequest`
  - 댓글 작성 요청 body다.
  - `{ "content": "댓글 내용" }` 형태를 받는다.
- `CommentUpdateRequest`
  - 댓글 수정 요청 body다.
  - 이번 MVP에서는 수정 가능한 값이 `content` 하나뿐이다.
- `CommentResponse`
  - 댓글 단건 응답이다.
  - 작성자 정보는 기존 `UserSummary`를 재사용한다.
- `CommentListResponse`
  - 목록 응답이다.
  - `items`, `page`, `size`, `total`, `has_next`를 포함한다.

`content` validator는 프론트에서 실수로 공백만 보낸 경우를 백엔드에서도 막기 위해 넣었다.

```python
@field_validator("content")
@classmethod
def strip_required_content(cls, value: str) -> str:
    stripped = value.strip()

    if not stripped:
        raise ValueError("must not be blank")

    return stripped
```

프론트 validation은 사용자 경험을 좋게 만들지만 보안 장치가 아니다. 사용자는 브라우저를 거치지 않고 curl이나 Postman으로 API를 직접 호출할 수 있다. 그래서 백엔드 schema validation이 반드시 필요하다.

## 4. SQLAlchemy 관계와 PostgreSQL 저장

댓글은 `Comment` 모델로 저장된다.

```text
comments
- id
- post_id
- author_id
- content
- status
- created_at
- updated_at
- deleted_at
```

관계는 다음과 같다.

```text
Post 1 : N Comment
User 1 : N Comment
```

SQLAlchemy 모델에서는 이 관계가 아래처럼 연결되어 있다.

```text
Post.comments
Comment.post

User.comments
Comment.author
```

댓글 목록을 조회할 때는 `joinedload(Comment.author)`를 사용했다.

```python
select(Comment).options(joinedload(Comment.author))
```

이렇게 하면 댓글 목록을 가져올 때 작성자 정보를 함께 가져올 수 있다. 프론트 응답에 `author.nickname`, `author.login_id`, `author.role` 같은 정보를 넣어야 하므로 댓글 row만 가져오면 부족하다.

댓글 개수는 `func.count()`로 센다.

```python
select(func.count()).select_from(Comment)
```

`func.count()`는 SQL의 `COUNT(*)`에 해당한다. SQLAlchemy는 Python 코드로 SQL 표현식을 만들고, 실제 실행은 PostgreSQL이 담당한다.

## 5. 공개 게시글과 공개 댓글 조건

댓글 목록과 댓글 작성은 공개 게시글에 대해서만 허용했다.

```text
Post.status == PUBLISHED
Post.deleted_at is None
Board.is_active == true
```

댓글 목록은 공개 댓글만 보여준다.

```text
Comment.status == PUBLISHED
Comment.deleted_at is None
```

이 조건 덕분에 soft delete된 댓글은 DB에는 남아 있지만 일반 댓글 목록에는 나오지 않는다.

## 6. 댓글 작성과 comment_count 갱신

댓글 작성은 `comments` row 하나를 추가하는 것에서 끝나지 않는다. 게시글 목록과 상세 화면에서 댓글 수를 바로 보여주기 위해 `posts.comment_count`도 함께 증가시킨다.

```text
Comment 생성
Post.comment_count += 1
db.commit()
```

이처럼 실제 댓글 개수와 별도로 `comment_count`를 저장하는 방식을 denormalization이라고 볼 수 있다. 매번 댓글 수를 `COUNT(*)`로 세지 않아도 게시글 목록에서 빠르게 댓글 수를 보여줄 수 있다.

대신 주의할 점도 있다. 댓글 생성과 `comment_count` 증가가 반드시 같은 트랜잭션 안에서 처리되어야 한다. 그래서 service에서 아래 흐름으로 묶었다.

```python
try:
    comment = comment_repository.create_comment(...)
    comment_repository.increment_comment_count(post)
    db.commit()
except Exception:
    db.rollback()
    raise
```

하나라도 실패하면 rollback해서 댓글 row만 생기고 댓글 수는 안 늘어나는 불일치를 막는다.

## 7. 댓글 수정과 삭제 권한

MVP Phase 7에서는 작성자 본인만 댓글을 수정/삭제할 수 있게 했다.

```python
if comment.author_id == current_user.id:
    return
```

API 설계 문서에는 “작성자 또는 운영자”라고 되어 있지만, 운영자 권한은 이후 phase에서 확장한다. 현재 게시글 수정/삭제도 작성자 중심으로 구현되어 있으므로 댓글도 같은 정책을 따른다.

프론트에서도 본인 댓글에만 수정/삭제 버튼을 보여준다.

```jsx
const isAuthor = currentUser?.id === comment.author.id;
```

하지만 이것은 UX를 위한 처리다. 실제 권한은 반드시 백엔드의 `comment_service.py`에서 검사해야 한다.

## 8. Soft Delete

댓글 삭제 API는 row를 실제로 삭제하지 않는다.

```text
status = DELETED
deleted_at = 현재 UTC 시간
Post.comment_count -= 1
```

이 구조를 쓰면 나중에 신고, 감사 로그, AI 인덱싱 이력 같은 확장 기능을 붙일 때 원본 추적이 쉽다. 사용자 화면에서는 `PUBLISHED` 댓글만 조회하므로 삭제된 댓글은 보이지 않는다.

`comment_count` 감소는 음수가 되지 않게 막았다.

```python
post.comment_count = max(post.comment_count - 1, 0)
```

이 코드는 데이터가 이미 꼬인 상황에서도 화면에 `-1` 같은 댓글 수가 보이지 않게 하는 최소 안전장치다.

## 9. React useComments hook 구조

프론트에서는 댓글 관련 API 상태를 `useComments` hook에 모았다.

```jsx
const comments = useComments(postId);
```

이 hook이 관리하는 상태는 다음과 같다.

- `data`: API에서 받은 댓글 목록 전체 응답
- `comments`: `data.items`를 쉽게 쓰기 위한 배열
- `page`: 현재 댓글 페이지
- `isLoading`: 목록을 불러오는 중인지
- `isSubmitting`: 작성/수정/삭제 요청 중인지
- `errorMessage`: 목록 조회 에러
- `actionErrorMessage`: 작성/수정/삭제 에러

이렇게 hook으로 분리하면 화면 컴포넌트는 “어떻게 보여줄지”에 집중하고, API 호출과 상태 갱신은 hook이 담당한다.

```text
PostDetailPage
-> useComments
-> commentApi
-> FastAPI comments router
```

댓글 작성 후에는 댓글 목록을 다시 불러오고, `PostDetailPage`에서 `reloadPost()`도 호출한다. 이유는 게시글 상세 상단에 표시되는 `comment_count`가 댓글 작성/삭제 후 바뀌기 때문이다.

```jsx
async function handleCreateComment(content) {
  await comments.createComment(content);
  await reloadPost();
}
```

## 10. CommentForm과 CommentList 역할

`CommentForm`은 댓글 작성만 담당한다.

- 로그인 사용자: textarea와 등록 버튼 표시
- 비로그인 사용자: “로그인하면 댓글을 작성할 수 있습니다.” 안내 표시
- 빈 문자열 입력: 프론트에서 먼저 차단

`CommentList`는 댓글 목록과 inline edit를 담당한다.

- 댓글 작성자 닉네임과 작성일 표시
- 본인 댓글에만 수정/삭제 버튼 표시
- 수정 버튼을 누르면 댓글 내용 대신 textarea 표시
- 저장하면 `PATCH /api/v1/comments/{comment_id}` 호출
- 삭제하면 `DELETE /api/v1/comments/{comment_id}` 호출

컴포넌트를 이렇게 나눈 이유는 댓글 작성 form과 댓글 목록 UI의 책임이 다르기 때문이다. 나중에 댓글 정렬, 대댓글, 신고 기능이 생겨도 각 컴포넌트를 더 작게 확장할 수 있다.

## 11. 직접 검증 방법

### 정적 검증

백엔드 Python 문법 확인:

```powershell
$env:PYTHONPYCACHEPREFIX="$env:TEMP\yoonji-pycache"
C:\Users\yoonj\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m compileall backend\app
```

프론트 빌드 확인:

```powershell
cd frontend
cmd.exe /c "C:\Progra~1\nodejs\node.exe node_modules\vite\bin\vite.js build"
```

### API 시나리오

1. 비로그인 상태에서 `GET /api/v1/posts/{post_id}/comments`를 호출하면 200이 나와야 한다.
2. 비로그인 상태에서 `POST /api/v1/posts/{post_id}/comments`를 호출하면 401이 나와야 한다.
3. 로그인 후 댓글을 작성하면 201과 댓글 응답이 나와야 한다.
4. 댓글 작성 후 게시글 상세의 `comment_count`가 증가해야 한다.
5. 댓글 목록에 방금 작성한 댓글이 표시되어야 한다.
6. 작성자가 `PATCH /api/v1/comments/{comment_id}`를 호출하면 댓글 내용이 바뀌어야 한다.
7. 다른 사용자가 같은 댓글을 수정하거나 삭제하면 403이 나와야 한다.
8. 작성자가 `DELETE /api/v1/comments/{comment_id}`를 호출하면 204가 나와야 한다.
9. 삭제된 댓글은 일반 목록에 나오지 않아야 한다.
10. 댓글 삭제 후 게시글 상세의 `comment_count`가 감소해야 한다.

### 프론트 시나리오

1. 게시글 상세 화면을 연다.
2. 비로그인 상태에서는 댓글 작성 폼 대신 로그인 안내가 보이는지 확인한다.
3. 로그인 후 댓글을 작성한다.
4. 댓글 목록에 새 댓글이 표시되는지 확인한다.
5. 상세 상단의 댓글 수가 증가하는지 확인한다.
6. 본인 댓글에만 수정/삭제 버튼이 보이는지 확인한다.
7. 댓글을 수정하면 화면에 수정된 내용이 표시되는지 확인한다.
8. 댓글을 삭제하면 목록에서 사라지고 댓글 수가 줄어드는지 확인한다.

## 12. 다음 Phase와 연결되는 지점

Phase 7은 댓글 CRUD만 구현했다.

- Phase 8 태그
  - 댓글과 직접 연결되지는 않지만, 게시글 상세 화면의 상호작용이 더 풍부해진다.
- Phase 9 마이페이지
  - `GET /api/v1/users/me/comments`를 만들 때 이번에 만든 `Comment.author_id`, `Comment.post_id` 관계를 활용하게 된다.
- AI Phase
  - 댓글도 RAG 인덱싱 대상이 될 수 있다.
  - 하지만 MVP에서는 AI endpoint와 인덱싱 작업을 사용자 화면에 노출하지 않는다.

이번 구조를 유지하면 댓글 기능이 커져도 router는 얇게 유지되고, service에서 서비스 규칙을 읽고, repository에서 SQLAlchemy 조회 방식을 학습하기 쉬운 코드base가 된다.

---

# MVP Phase 8 태그 구현 가이드

Phase 8에서는 게시글에 태그를 연결하고, 태그 자동완성과 태그 기반 게시글 필터링을 구현했다. 이번 단계도 MVP 범위에 맞춰 AI, MCP, 외부 링크 미리보기는 연결하지 않는다. 태그는 나중에 검색, 유사 게시글 추천, AI 검색 문맥에도 활용될 수 있지만, 지금은 게시판 기본 탐색 기능에 집중한다.

## 1. 이번 Phase에서 바꾼 파일

### 백엔드

- `backend/app/utils/normalizer.py`
  - 태그 표시명 정리 함수와 검색/중복 방지용 정규화 함수를 추가했다.
- `backend/app/schemas/tag_schema.py`
  - 태그 생성 요청, 태그 단건 응답, 태그 목록 응답 스키마를 추가했다.
- `backend/app/repositories/tag_repository.py`
  - 태그 검색, 태그 조회, 태그 생성, `PostTag` 연결 생성/삭제, `usage_count` 증감 함수를 추가했다.
- `backend/app/services/tag_service.py`
  - 태그 생성 또는 재사용, 게시글-태그 연결 동기화, 태그 사용 횟수 갱신 규칙을 구현했다.
- `backend/app/api/routes/tags.py`
  - `GET /api/v1/tags`, `POST /api/v1/tags` endpoint를 추가했다.
- `backend/app/main.py`
  - tags router를 FastAPI 앱에 연결했다.
- `backend/app/schemas/post_schema.py`
  - 게시글 작성/수정 요청에 `tags` 필드를 추가했다.
- `backend/app/repositories/post_repository.py`
  - 게시글 목록 조회에 태그 필터 join을 추가했다.
- `backend/app/services/post_service.py`
  - 게시글 생성/수정/삭제 시 태그 연결과 `usage_count` 갱신을 연결했다.
- `backend/app/api/routes/posts.py`
  - `GET /api/v1/posts?tag=...` query parameter를 추가했다.

### 프론트엔드

- `frontend/src/api/tagApi.js`
  - `getTags`, `createTag` API 호출 함수를 추가했다.
- `frontend/src/components/post/TagInput.jsx`
  - 글쓰기/수정 폼에서 사용하는 태그 입력 컴포넌트를 추가했다.
  - 태그 유형 선택, 태그명 입력, 자동완성, 선택 태그 제거를 담당한다.
- `frontend/src/components/post/PostForm.jsx`
  - `TagInput`을 연결하고 submit payload에 `tags`를 포함했다.
- `frontend/src/hooks/usePosts.js`
  - 게시글 목록 hook에서 `tag` 필터를 API query parameter로 넘기게 했다.
- `frontend/src/pages/PostListPage.jsx`
  - 태그 검색/선택 필터 UI를 추가했다.
- `frontend/src/components/post/PostCard.jsx`
  - 게시글 카드에 태그 목록을 표시했다.
- `frontend/src/App.css`
  - 태그 입력 패널, 자동완성 버튼, 선택 태그 pill, 목록 태그 필터 스타일을 추가했다.

## 2. 태그 API 요청 흐름

태그 자동완성 요청은 아래처럼 흐른다.

```text
React TagInput
-> frontend/src/api/tagApi.js
-> GET /api/v1/tags?q=미쿠&type=CHARACTER&limit=8
-> backend/app/api/routes/tags.py
-> backend/app/services/tag_service.py
-> backend/app/repositories/tag_repository.py
-> PostgreSQL tags 조회
```

태그 생성 요청은 아래처럼 흐른다.

```text
POST /api/v1/tags
body = { "name": "하츠네 미쿠", "tag_type": "CHARACTER" }
-> 이미 있으면 기존 ACTIVE 태그 반환
-> 없으면 새 Tag row 생성
```

여기서 중요한 점은 `POST /tags` 자체는 `usage_count`를 늘리지 않는다는 것이다. `usage_count`는 태그가 게시글에 연결될 때 증가하고, 게시글에서 연결이 제거되거나 게시글이 삭제될 때 감소한다.

## 3. 정규화가 필요한 이유

태그는 사람이 입력하는 텍스트라 중복이 쉽게 생긴다.

```text
하츠네 미쿠
하츠네미쿠
 하츠네   미쿠
```

사용자 눈에는 같은 태그로 보일 수 있지만, DB에 그대로 저장하면 서로 다른 문자열이 된다. 그래서 이번 구현에서는 두 값을 나눠 저장한다.

```text
name            = 화면에 보여줄 이름
normalized_name = 중복 방지와 검색에 사용할 이름
```

`normalizer.py`의 역할은 다음과 같다.

```text
clean_tag_name()
-> Unicode NFKC 정규화
-> 앞뒤 공백 제거
-> 중간의 여러 공백을 하나로 정리

normalize_tag_name()
-> clean_tag_name 적용
-> 소문자 변환
-> 모든 공백 제거
```

예를 들어 아래 입력들은 같은 `normalized_name`이 된다.

```text
" 하츠네   미쿠 " -> "하츠네미쿠"
"하츠네 미쿠"     -> "하츠네미쿠"
```

DB 모델에는 이미 아래 unique constraint가 있다.

```text
normalized_name + tag_type
```

즉 `CHARACTER` 타입의 `하츠네 미쿠`는 하나만 만들 수 있다. 다만 같은 이름이라도 `CHARACTER`와 `TOPIC`처럼 타입이 다르면 서로 다른 태그로 볼 수 있다.

## 4. Pydantic nested schema

게시글 작성 요청에는 이제 `tags` 배열이 들어갈 수 있다.

```json
{
  "board_code": "REVIEW",
  "title": "넨도로이드 후기",
  "content": "본문",
  "tags": [
    {
      "name": "하츠네 미쿠",
      "tag_type": "CHARACTER"
    }
  ]
}
```

`PostCreateRequest`와 `PostUpdateRequest`는 `TagRequest`를 재사용한다.

```python
tags: list[TagRequest] = Field(default_factory=list, max_length=10)
```

이것이 Pydantic nested schema다. 게시글 요청 body 안에 태그 객체 배열이 들어오고, FastAPI는 내부 객체까지 `TagRequest` 규칙으로 검증한다.

`TagRequest`는 `name`을 정리한다.

```python
@field_validator("name")
def strip_tag_name(cls, value: str) -> str:
    cleaned = clean_tag_name(value)
    ...
```

그래서 프론트가 공백이 많은 태그명을 보내도 백엔드에서 한 번 더 정리된다. 프론트 validation은 편의 기능이고, 실제 데이터 품질은 백엔드 schema와 service에서 지켜야 한다.

## 5. SQLAlchemy 다대다 관계

게시글과 태그는 다대다 관계다.

```text
하나의 게시글 -> 여러 태그
하나의 태그   -> 여러 게시글
```

관계형 DB에서는 다대다를 직접 저장하지 않고 연결 테이블을 둔다.

```text
posts
tags
post_tags
```

`post_tags`는 두 테이블의 ID를 연결한다.

```text
post_id
tag_id
created_at
```

SQLAlchemy 모델에서는 이렇게 연결된다.

```text
Post.tag_links -> PostTag 목록
PostTag.tag    -> Tag
Tag.post_links -> PostTag 목록
```

게시글 응답을 만들 때는 `post.tag_links`를 순회해서 `TagSummary`로 바꾼다.

```python
TagSummary(
    id=link.tag.id,
    name=link.tag.name,
    tag_type=link.tag.tag_type,
)
```

이 구조를 이해하면 앞으로 좋아요, 북마크, 팔로우처럼 “두 모델 사이의 연결”이 필요한 기능을 만들 때 같은 패턴을 재사용할 수 있다.

## 6. 게시글 생성 시 태그 연결

게시글 생성 시 service 흐름은 다음과 같다.

```text
Post row 생성
figure_info 저장
tags 생성 또는 재사용
post_tags 연결 생성
image 연결
commit
```

태그 연결은 `tag_service.sync_post_tags()`가 담당한다.

```text
요청 tags 배열
-> 중복 제거
-> Tag 생성 또는 재사용
-> 기존 PostTag와 비교
-> 새 연결 생성
-> usage_count 증가
```

같은 요청 안에서 같은 태그가 두 번 들어와도 한 번만 연결한다.

```text
(normalized_name, tag_type)
```

이 조합을 key로 사용해 중복을 제거한다.

## 7. 게시글 수정 시 태그 동기화

수정 요청에서 `tags`가 포함되면 기존 연결을 새 목록과 동기화한다.

예를 들어 기존 태그가 아래와 같다고 하자.

```text
하츠네 미쿠
넨도로이드
```

수정 요청이 아래처럼 들어오면:

```text
하츠네 미쿠
먼지 관리
```

service는 이렇게 처리한다.

```text
유지: 하츠네 미쿠
제거: 넨도로이드 -> usage_count 감소
추가: 먼지 관리 -> Tag 생성/재사용 후 usage_count 증가
```

수정 요청에서 `tags` 필드가 아예 없으면 태그를 건드리지 않는다. 반대로 `tags: []`를 보내면 모든 태그 연결을 제거한다. 이 차이는 `PostUpdateRequest`에서 `tags`를 optional로 둔 이유다.

## 8. 게시글 삭제와 usage_count

게시글 삭제는 soft delete다.

```text
posts.status = DELETED
posts.deleted_at = now
```

게시글 row와 `post_tags` 연결은 남겨두지만, 공개 게시글 기준 사용 횟수를 맞추기 위해 연결된 태그의 `usage_count`를 감소시킨다.

```python
tag_service.decrement_usage_counts_for_post(post)
post_repository.soft_delete_post(post)
```

삭제된 게시글은 `GET /posts`의 공개 조회 조건에서 제외되므로 태그 필터 결과에도 나타나지 않는다.

## 9. 태그 기반 게시글 목록 조회

게시글 목록 API는 이제 태그 필터를 받을 수 있다.

```text
GET /api/v1/posts?tag=하츠네 미쿠
```

service는 query parameter를 정규화한다.

```python
normalized_tag = normalize_tag_name(tag)
```

repository는 `posts`, `boards`, `post_tags`, `tags`를 join해서 공개 게시글 중 해당 태그가 연결된 게시글만 찾는다.

```text
posts
-> boards
-> post_tags
-> tags
```

같은 게시글에 같은 normalized tag가 여러 타입으로 연결될 수 있으므로 목록과 count에서는 중복 row가 생기지 않도록 `distinct`를 사용했다.

## 10. React TagInput 구조

`TagInput`은 controlled component다.

```jsx
<TagInput
  disabled={isSubmitting}
  value={tags}
  onChange={setTags}
/>
```

`value`는 현재 폼에 선택된 태그 배열이다. 사용자가 태그를 추가하거나 제거하면 `onChange`로 부모인 `PostForm`의 상태를 바꾼다.

컴포넌트 내부 상태는 다음과 같다.

- `query`: 사용자가 입력 중인 태그명
- `tagType`: 선택된 태그 유형
- `suggestions`: 자동완성 결과
- `isSearching`: 자동완성 API 호출 중인지
- `errorMessage`: 태그 입력/검색 에러

`query`가 바뀌면 `useEffect`가 `GET /tags`를 호출한다. 너무 잦은 요청을 줄이기 위해 180ms 지연 후 검색한다.

```jsx
window.setTimeout(async () => {
  const response = await getTags(...)
}, 180)
```

사용자가 Enter를 누르거나 `추가` 버튼을 누르면 현재 입력값을 선택 태그 목록에 추가한다. 이때 프론트에서도 `(정규화된 태그명, tag_type)` 기준으로 중복을 막는다.

## 11. PostForm과 PostListPage 연결

`PostForm`은 작성과 수정에서 모두 사용된다.

```text
PostWritePage -> PostForm -> POST /posts
PostEditPage  -> PostForm -> PATCH /posts/{post_id}
```

submit payload에는 이제 `tags`가 포함된다.

```jsx
payload.tags = tags.map((tag) => ({
  name: tag.name,
  tag_type: tag.tag_type,
}));
```

`PostListPage`는 태그 필터 입력을 가진다. 사용자가 태그를 선택하거나 입력 후 적용하면 `usePostList`에 `tag` 값을 넘긴다.

```jsx
usePostList({
  boardCode,
  page,
  size,
  sort,
  tag: tagFilter,
});
```

`usePostList`는 이 값을 API query parameter로 바꾼다.

```text
GET /api/v1/posts?tag=하츠네 미쿠
```

게시글 카드에는 태그 pill을 표시한다. 이 덕분에 목록에서도 어떤 태그가 연결되어 있는지 바로 확인할 수 있다.

## 12. 직접 검증 방법

### 정적 검증

백엔드 Python 문법 확인:

```powershell
$env:PYTHONPYCACHEPREFIX="$env:TEMP\yoonji-pycache"
C:\Users\yoonj\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m compileall backend\app
```

프론트 빌드 확인:

```powershell
cd frontend
cmd.exe /c "C:\Progra~1\nodejs\node.exe node_modules\vite\bin\vite.js build"
```

### API 시나리오

1. 비로그인 상태에서 `GET /api/v1/tags?q=미쿠`를 호출하면 200이 나와야 한다.
2. 비로그인 상태에서 `POST /api/v1/tags`를 호출하면 401이 나와야 한다.
3. 로그인 후 `POST /api/v1/tags`로 태그를 만들면 201과 태그 응답이 나와야 한다.
4. 같은 이름과 같은 `tag_type`으로 다시 생성 요청하면 기존 태그가 반환되어야 한다.
5. 게시글 작성 요청에 `tags`를 포함하면 상세 응답의 `tags`에 표시되어야 한다.
6. 게시글 수정 요청에서 태그를 추가/제거하면 상세 응답의 `tags`가 바뀌어야 한다.
7. 태그가 새로 연결되면 `usage_count`가 증가해야 한다.
8. 태그 연결이 제거되면 `usage_count`가 감소해야 한다.
9. `GET /api/v1/posts?tag=하츠네 미쿠`는 해당 태그가 연결된 공개 게시글만 반환해야 한다.
10. 삭제된 게시글은 태그 필터 결과에 나오지 않아야 한다.

### 프론트 시나리오

1. 로그인한다.
2. 글쓰기 화면에서 태그명을 입력한다.
3. 자동완성 결과가 보이는지 확인한다.
4. 태그를 선택하거나 새 태그명을 추가한다.
5. 게시글을 작성한 뒤 상세 화면에서 태그가 보이는지 확인한다.
6. 수정 화면에서 태그를 제거하거나 추가한 뒤 저장한다.
7. 목록 화면에서 태그 필터를 적용한다.
8. 해당 태그가 연결된 게시글만 보이는지 확인한다.
9. 게시글 카드에 태그 pill이 표시되는지 확인한다.

## 13. 다음 Phase와 연결되는 지점

Phase 8은 이후 탐색 기능의 기반이다.

- Phase 9 검색
  - 제목/본문뿐 아니라 태그명 기반 검색을 붙일 수 있다.
  - `GET /search/posts`에서 `tags`, `post_tags` join을 활용하게 된다.
- 마이페이지
  - 내 게시글 목록에서도 태그를 함께 보여줄 수 있다.
- AI Phase
  - 태그는 RAG 검색 문맥과 유사 게시글 추천의 중요한 힌트가 된다.
  - 하지만 MVP에서는 태그를 AI 기능에 연결하지 않는다.

이번 Phase의 핵심은 다대다 관계다. `Post`와 `Tag`를 직접 붙이지 않고 `PostTag` 연결 테이블을 통해 관계를 표현한다는 점을 이해하면, 이후 더 복잡한 관계형 데이터 모델을 읽고 설계하는 데 큰 도움이 된다.
