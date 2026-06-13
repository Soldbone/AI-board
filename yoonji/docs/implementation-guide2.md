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
---

# MVP Phase 9 검색 / 정렬 / 마이페이지 구현 가이드

Phase 9에서는 게시판 MVP를 "탐색 가능한 서비스"로 만드는 기능을 추가했다. 핵심은 세 가지다.

1. 여러 조건으로 게시글을 검색한다.
2. 최신순, 조회수순, 만족도순, 댓글순, 관련도순으로 정렬한다.
3. 로그인한 사용자가 마이페이지에서 자신이 쓴 게시글과 댓글을 조회한다.

이번 단계에서도 AI, pgvector, LangChain, 의미 검색은 붙이지 않는다. 검색은 PostgreSQL의 문자열 검색과 SQLAlchemy ORM 조건 조합으로 구현했다.

## 1. 이번 Phase에서 바꾼 파일

### 백엔드

- `backend/app/schemas/search_schema.py`
  - 검색 정렬 타입과 마이페이지 댓글 응답 schema를 추가했다.
  - `MyCommentResponse`, `MyCommentListResponse`는 `GET /users/me/comments` 응답 모양을 정의한다.

- `backend/app/repositories/post_repository.py`
  - 검색용 게시글 조회/count 함수를 추가했다.
  - 내 게시글 조회/count 함수를 추가했다.
  - `latest`, `views`, `satisfaction`, `comments`, `relevance` 정렬을 처리한다.

- `backend/app/repositories/comment_repository.py`
  - 내 댓글 조회/count 함수를 추가했다.
  - 삭제된 댓글과 삭제된 게시글에 달린 댓글은 제외한다.

- `backend/app/services/search_service.py`
  - query parameter를 정리하고 repository를 호출한다.
  - API 응답을 `PostListResponse`로 조립한다.

- `backend/app/services/user_service.py`
  - `list_my_posts`, `list_my_comments`를 추가했다.
  - 현재 로그인 사용자의 id를 기준으로 내 활동만 조회한다.

- `backend/app/api/routes/search.py`
  - `GET /api/v1/search/posts` endpoint를 추가했다.

- `backend/app/api/routes/users.py`
  - `GET /api/v1/users/me/posts`
  - `GET /api/v1/users/me/comments`
  - 두 endpoint를 추가했다.

- `backend/app/api/routes/posts.py`
  - 일반 게시글 목록에서도 `satisfaction`, `comments` 정렬을 받을 수 있게 허용값을 넓혔다.

- `backend/app/main.py`
  - search router를 FastAPI 앱에 연결했다.

### 프론트엔드

- `frontend/src/api/searchApi.js`
  - `searchPosts(params)` API 호출 함수를 추가했다.

- `frontend/src/api/userApi.js`
  - `getMyPosts(params)`, `getMyComments(params)`를 추가했다.

- `frontend/src/pages/SearchResultPage.jsx`
  - 검색어, 게시판, 태그, 피규어명, 제조사, 가격대, 정렬 조건을 입력하는 검색 화면을 구현했다.

- `frontend/src/pages/MyPage.jsx`
  - 내 게시글 / 내 댓글 탭을 가진 마이페이지 화면을 구현했다.

- `frontend/src/App.jsx`
  - 기존 `currentView` 상태 전환 방식에 `search`, `mypage` 화면을 추가했다.
  - 상단 네비게이션과 로그인 사용자용 "내 활동 보기" 버튼을 추가했다.

- `frontend/src/pages/HomePage.jsx`, `frontend/src/pages/PostListPage.jsx`
  - 기존 파일에 깨진 JSX 문자열이 있어 빌드를 막을 수 있었기 때문에 정상 한국어 JSX로 정리했다.
  - 기존 기능인 게시판 목록, 최신 글, 게시글 목록, 태그 필터는 유지했다.

- `frontend/src/App.css`
  - 검색 form, 마이페이지 탭, 내 댓글 카드, 상단 네비게이션 스타일을 추가했다.

## 2. FastAPI route의 역할

검색 route는 `backend/app/api/routes/search.py`에 있다.

```python
@router.get("/posts", response_model=PostListResponse)
def search_posts(...):
    return search_service.search_posts(...)
```

FastAPI route는 얇게 유지했다. route가 직접 SQLAlchemy query를 만들지 않고 다음 일만 한다.

- URL과 HTTP method를 정한다.
- query parameter를 받는다.
- `DbSession` dependency로 DB session을 받는다.
- service 함수를 호출한다.
- response schema를 지정한다.

이 구조를 쓰면 API 입구와 비즈니스 로직이 섞이지 않는다. 예를 들어 검색 조건이 복잡해져도 `search.py`가 아니라 `search_service.py`와 repository만 보면 된다.

마이페이지 route는 `backend/app/api/routes/users.py`에 추가했다.

```python
@router.get("/me/posts", response_model=PostListResponse)
def list_my_posts(current_user: CurrentUser, db: DbSession, ...):
    ...
```

여기서 중요한 점은 `CurrentUser`다. `CurrentUser` dependency는 JWT access token을 읽고 현재 로그인 사용자를 찾아준다. 그래서 route 함수 안에서 따로 token을 직접 파싱하지 않아도 된다.

```text
Authorization: Bearer access-token
-> CurrentUser dependency
-> User model
-> user_service.list_my_posts()
```

비로그인 사용자가 `/users/me/posts` 또는 `/users/me/comments`를 호출하면 `CurrentUser` 단계에서 401로 막힌다.

## 3. Pydantic schema의 역할

이번 Phase에서는 검색 결과 게시글 목록 응답에 기존 `PostListResponse`를 재사용했다.

```python
class PostListResponse(BaseModel):
    items: list[PostListItemResponse]
    page: int
    size: int
    total: int
    has_next: bool
```

이미 게시글 목록 화면에서 쓰는 응답 모양과 검색 결과 응답 모양이 같기 때문이다. 이렇게 schema를 재사용하면 프론트엔드도 `PostList` 컴포넌트를 그대로 쓸 수 있다.

반면 내 댓글 응답은 게시글 목록과 모양이 다르다.

```python
class MyCommentResponse(BaseModel):
    id: int
    post_id: int
    post_title: str
    content: str
    status: CommentStatus
    created_at: datetime
    updated_at: datetime
```

댓글 목록에는 댓글 본문뿐 아니라 "어떤 게시글에 단 댓글인지"가 필요하다. 그래서 `post_id`, `post_title`을 함께 내려준다. 이 응답을 통해 프론트에서는 댓글 카드의 게시글 제목을 누르면 해당 게시글 상세로 이동할 수 있다.

## 4. Service 계층의 역할

`search_service.py`는 query parameter를 정리한 뒤 repository에 넘긴다.

```python
cleaned_q = _clean_optional_text(q)
normalized_q = normalize_tag_name(cleaned_q) if cleaned_q else None
```

사용자가 입력한 검색어에는 앞뒤 공백이 있을 수 있다. service에서 이런 입력을 정리해두면 repository는 이미 정리된 값만 받아 SQL 조건을 만들 수 있다.

또 태그 검색을 위해 `normalize_tag_name()`을 사용한다.

```text
" 미쿠  " -> "미쿠"
"미 쿠"   -> "미쿠"
```

태그는 Phase 8에서 `normalized_name`을 저장하도록 만들었기 때문에 검색에서도 같은 정규화 규칙을 사용해야 한다.

마이페이지는 `user_service.py`에서 처리한다.

```python
def list_my_posts(db, *, current_user, page, size):
    ...
```

여기서 `current_user.id`를 repository에 넘긴다. 즉 프론트가 `user_id`를 query로 보내지 않는다. 이것이 중요하다. 사용자가 임의로 다른 사람 id를 넣어 요청하는 문제를 피할 수 있다.

```text
좋은 방식:
GET /users/me/posts
서버가 token에서 user_id를 알아냄

피해야 할 방식:
GET /users/3/posts
프론트가 user_id를 직접 고름
```

## 5. SQLAlchemy 검색 조건

검색은 `post_repository.py`에서 처리한다. 모든 공개 게시글 조회에는 기본 조건이 붙는다.

```python
Post.status == PostStatus.PUBLISHED
Post.deleted_at.is_(None)
Board.is_active.is_(True)
```

이 조건은 "사용자에게 보여도 되는 게시글"만 가져오기 위한 최소 조건이다.

검색어 `q`는 여러 컬럼에 대해 OR 조건으로 적용된다.

```python
or_(
    Post.title.ilike(pattern),
    Post.content.ilike(pattern),
    Post.figure_infos.any(...),
    Post.tag_links.any(...),
)
```

`ilike`는 PostgreSQL에서 대소문자를 구분하지 않는 LIKE 검색을 만든다.

```sql
WHERE title ILIKE '%검색어%'
```

`Post.figure_infos.any(...)`와 `Post.tag_links.any(...)`는 SQLAlchemy relationship을 이용한 조건이다. 내부적으로는 관련 테이블에 해당 row가 존재하는지 확인하는 `EXISTS` 형태의 SQL이 만들어진다.

예를 들어 `Post.figure_infos.any(PostFigureInfo.figure_name_text.ilike(...))`는 이런 의미다.

```text
이 게시글에 연결된 figure_info 중
figure_name_text가 검색어와 맞는 row가 하나라도 있는가?
```

처음 계획에서는 join/outerjoin을 언급했지만, 실제 구현에서는 중복 게시글 문제를 줄이기 위해 relationship `any()`를 사용했다. 게시글 하나에 태그가 여러 개 있고 피규어 정보도 붙을 수 있으므로 단순 join을 하면 같은 게시글이 여러 row로 늘어날 수 있다. `any()`는 "존재 여부"를 묻기 때문에 목록 중복을 피하기 좋다.

## 6. 정렬 구현

정렬은 `_post_order_by()`에서 한 곳에 모았다.

```python
def _post_order_by(sort, *, q=None, normalized_q=None):
    ...
```

지원하는 정렬은 다음과 같다.

- `latest`: 게시일 최신순
- `views`: 조회수 높은 순
- `satisfaction`: 후기 만족도 높은 순
- `comments`: 댓글 많은 순
- `relevance`: 검색어 관련도순

만족도순은 `PostFigureInfo.satisfaction_score`를 기준으로 한다. 게시글과 피규어 정보는 1:N 관계라서 scalar subquery를 사용했다.

```python
satisfaction_score = (
    select(func.max(PostFigureInfo.satisfaction_score))
    .where(PostFigureInfo.post_id == Post.id)
    .scalar_subquery()
)
```

이 코드는 각 게시글마다 연결된 피규어 정보의 최대 만족도 점수를 가져오는 SQL 조각을 만든다. MVP에서는 후기 게시글에 대표 피규어 정보 하나만 쓰지만, 모델은 1:N 구조이므로 이렇게 작성하면 관계 구조와 잘 맞는다.

관련도순은 pgvector나 full-text search가 없는 MVP용 단순 규칙이다.

```text
제목 match
본문 match
피규어명/제조사 match
태그 match
같은 조건이면 최신순
```

`case()`를 써서 조건이 맞으면 1, 아니면 0으로 정렬한다.

```python
case((Post.title.ilike(pattern), 1), else_=0).desc()
```

이 방식은 진짜 검색 엔진의 relevance score는 아니지만, "제목에 검색어가 들어간 글을 먼저 보여준다"는 MVP 요구에는 충분하다.

## 7. Pagination

검색과 마이페이지 목록은 모두 같은 페이지네이션 구조를 쓴다.

```python
.offset((page - 1) * size)
.limit(size)
```

그리고 응답에는 다음 값을 포함한다.

```python
page=page
size=size
total=total
has_next=page * size < total
```

`total`은 전체 개수다. `items`는 현재 페이지에 들어갈 데이터만 담는다. 프론트는 `has_next`를 보고 다음 버튼을 활성화할지 결정한다.

## 8. React API 함수와 화면 분리

프론트에서는 API 호출 함수를 화면 컴포넌트 안에 직접 쓰지 않고 `api` 폴더에 분리했다.

```javascript
export async function searchPosts(params = {}) {
  const response = await axiosInstance.get("/search/posts", { params });
  return response.data;
}
```

이렇게 하면 화면은 "검색 버튼을 눌렀을 때 어떤 상태를 바꿀지"에 집중하고, API 경로와 axios 사용법은 `searchApi.js`에 모인다.

마이페이지도 같다.

```javascript
getMyPosts({ page, size })
getMyComments({ page, size })
```

JWT access token은 `axiosInstance` interceptor가 자동으로 붙인다. 그래서 마이페이지 컴포넌트는 token 저장 위치를 알 필요가 없다.

```text
MyPage
-> userApi.getMyPosts()
-> axiosInstance
-> Authorization header 자동 추가
-> FastAPI CurrentUser
```

## 9. SearchResultPage 구조

검색 화면은 두 종류의 상태를 나눈다.

- `filters`: 사용자가 현재 form에서 입력 중인 값
- `appliedFilters`: 실제 API 요청에 사용 중인 값

이렇게 나누면 input을 한 글자 칠 때마다 검색 API가 호출되지 않는다. 사용자가 검색 버튼을 눌렀을 때만 `appliedFilters`가 바뀌고, 그때 API를 호출한다.

```javascript
function handleSubmit(event) {
  event.preventDefault();
  setAppliedFilters(filters);
  setPage(1);
}
```

검색 결과는 기존 `PostList` 컴포넌트를 재사용한다. 백엔드가 기존 `PostListResponse`를 그대로 반환하기 때문에 가능하다.

```jsx
<PostList
  posts={data?.items || []}
  onSelectPost={onOpenPost}
/>
```

이 구조는 "응답 schema를 재사용하면 프론트 컴포넌트도 재사용하기 쉬워진다"는 점을 보여준다.

## 10. MyPage 구조

마이페이지에는 탭이 두 개 있다.

- 내 게시글
- 내 댓글

`activeTab` 상태로 현재 탭을 관리한다.

```javascript
const [activeTab, setActiveTab] = useState("posts");
```

내 게시글 탭에서는 `getMyPosts`를 호출하고, 내 댓글 탭에서는 `getMyComments`를 호출한다. 두 목록은 page 상태도 따로 둔다.

```javascript
const [postsPage, setPostsPage] = useState(1);
const [commentsPage, setCommentsPage] = useState(1);
```

이렇게 하면 게시글 3페이지를 보다가 댓글 탭으로 갔다가 다시 돌아왔을 때 게시글 페이지 상태를 유지하기 쉽다.

내 댓글 목록은 게시글 카드와 모양이 다르므로 별도 `CommentActivityList`를 만들었다. 댓글 카드의 제목 버튼은 `post_id`로 게시글 상세를 연다.

```jsx
onClick={() => onOpenPost(comment.post_id)}
```

## 11. App.jsx 화면 전환

아직 Phase 10의 React Router 단계가 아니므로 기존 방식대로 `currentView` 상태를 유지했다.

```javascript
const [currentView, setCurrentView] = useState("home");
```

새로 추가된 view는 다음 두 개다.

```text
search
mypage
```

검색 결과나 마이페이지에서 게시글 상세로 들어간 뒤 뒤로 가는 흐름을 위해 `returnView`도 추가했다.

```javascript
openPost(postId, "search")
openPost(postId, "mypage")
```

상세 화면에서 `onBackToList`를 누르면 `returnView`에 따라 검색 화면 또는 마이페이지로 돌아갈 수 있다.

## 12. 이번 Phase에서 DB migration이 필요 없는 이유

이번 구현은 새 테이블이나 새 컬럼을 만들지 않았다.

사용한 기존 테이블은 다음과 같다.

- `posts`
- `boards`
- `post_figure_infos`
- `tags`
- `post_tags`
- `comments`
- `users`

따라서 Alembic migration은 만들지 않는다. 이미 있는 관계와 컬럼을 조합해서 조회 기능만 확장했다.

## 13. 직접 검증한 명령

백엔드 문법 확인:

```powershell
$env:PYTHONPYCACHEPREFIX="$env:TEMP\yoonji-pycache"
C:\Users\yoonj\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m compileall backend\app
```

프론트 빌드 확인:

```powershell
cd frontend
cmd.exe /c C:\Progra~1\nodejs\node.exe node_modules\vite\bin\vite.js build
```

두 검증 모두 통과했다.

## 14. 수동 API 확인 시나리오

백엔드 서버를 켠 뒤 다음 흐름을 확인하면 된다.

```text
GET /api/v1/search/posts?q=검색어
GET /api/v1/search/posts?board_code=REVIEW
GET /api/v1/search/posts?tag=미쿠
GET /api/v1/search/posts?figure_name=미쿠&manufacturer=Good Smile Company
GET /api/v1/search/posts?price_range=50000_100000
GET /api/v1/search/posts?sort=satisfaction
GET /api/v1/search/posts?sort=comments
GET /api/v1/search/posts?sort=relevance&q=미쿠
```

로그인 후에는 다음 API를 확인한다.

```text
GET /api/v1/users/me/posts
GET /api/v1/users/me/comments
```

비로그인 상태에서는 두 API가 401을 반환해야 한다. 로그인 상태에서는 현재 사용자의 게시글과 댓글만 반환해야 한다.

## 15. 다음 Phase와 연결되는 지점

Phase 9는 Phase 10의 프론트 라우팅 정리와 잘 연결된다. 지금은 `currentView`로 화면을 바꾸지만, `SearchResultPage`와 `MyPage`는 독립 page 컴포넌트로 만들어 두었다. 그래서 Phase 10에서 React Router를 붙일 때 다음처럼 옮기기 쉽다.

```text
/search -> SearchResultPage
/me -> MyPage
/posts/:postId -> PostDetailPage
```

또 검색 service와 repository가 분리되어 있으므로 이후 AI Phase에서 pgvector 의미 검색을 붙일 때도 `GET /search/posts`의 응답 모양은 유지하면서 내부 검색 구현만 확장할 수 있다.

---

# MVP Phase 10. 프론트 라우팅과 UX 정리

Phase 10에서는 백엔드 API나 DB 스키마를 바꾸지 않고, React 화면 이동 구조를 정리했다.

Phase 9까지는 `App.jsx` 안에서 `currentView`라는 문자열 상태로 화면을 바꿨다.

```javascript
const [currentView, setCurrentView] = useState("home");
```

이 방식은 처음 학습할 때 이해하기 쉽지만, 주소창 URL과 화면 상태가 분리된다. 예를 들어 게시글 상세를 보고 있어도 브라우저 주소는 그대로 `/`일 수 있다. Phase 10에서는 `react-router-dom`을 사용해 URL이 곧 현재 화면을 의미하도록 바꿨다.

## 1. App.jsx의 역할 축소

수정 파일:

```text
frontend/src/App.jsx
```

`App.jsx`는 이제 두 가지 전역 상태만 관리한다.

- 백엔드 health check 상태
- 로그인/로그아웃 인증 상태

실제 페이지 이동은 `AppRouter`에게 맡긴다.

```jsx
return (
  <AppRouter
    auth={auth}
    connectionErrorMessage={errorMessage}
    connectionStatus={connectionStatus}
    healthResponse={healthResponse}
  />
);
```

이 구조에서 배울 점은 `App.jsx`가 모든 화면 조건을 직접 알 필요가 없다는 것이다. 앱 전체에서 공유해야 하는 상태만 들고, 화면 배치는 라우터와 레이아웃으로 넘긴다.

## 2. Router.jsx와 URL 기반 화면 전환

수정 파일:

```text
frontend/src/routes/Router.jsx
```

Phase 10의 핵심 파일이다. 다음 URL을 실제 페이지 컴포넌트와 연결했다.

```text
/                  -> HomePage
/boards            -> PostListPage
/boards/:boardCode -> PostListPage
/posts/new         -> PostWritePage
/posts/:postId     -> PostDetailPage
/posts/:postId/edit -> PostEditPage
/search            -> SearchResultPage
/mypage            -> MyPage
/login             -> LoginPage
/signup            -> SignupPage
```

예를 들어 `/boards/REVIEW`로 들어오면 `useParams()`로 `boardCode`를 읽는다.

```javascript
const { boardCode = "" } = useParams();
```

그리고 기존 `PostListPage`가 받던 props 형태에 맞춰 넘긴다.

```jsx
<PostListPage
  initialBoardCode={boardCode}
  isAuthenticated={auth.isAuthenticated}
  onBackHome={() => navigate("/")}
  onOpenPost={(postId) => navigateToPost(navigate, postId, location)}
  onOpenWrite={(selectedBoardCode) => {
    const query = selectedBoardCode
      ? `?board_code=${encodeURIComponent(selectedBoardCode)}`
      : "";
    navigate(`/posts/new${query}`);
  }}
/>
```

여기서 중요한 점은 기존 페이지 컴포넌트를 크게 뜯지 않았다는 것이다. `Router.jsx`가 URL 세계와 기존 props 세계 사이의 adapter 역할을 한다.

## 3. useNavigate, useParams, useSearchParams

React Router에서 자주 쓰는 hook 세 개를 이번 Phase에서 사용했다.

`useNavigate()`는 버튼 클릭 후 다른 URL로 이동할 때 쓴다.

```javascript
const navigate = useNavigate();
navigate("/boards");
```

`useParams()`는 URL 경로에 들어 있는 값을 읽을 때 쓴다.

```javascript
const { postId } = useParams();
```

`useSearchParams()`는 query string을 읽을 때 쓴다.

```javascript
const [searchParams] = useSearchParams();
const initialBoardCode = searchParams.get("board_code") || "";
```

그래서 `/posts/new?board_code=REVIEW`로 들어오면 글쓰기 화면의 초기 게시판이 `REVIEW`가 된다.

## 4. 보호 라우트

수정 파일:

```text
frontend/src/routes/Router.jsx
```

로그인이 필요한 화면은 `ProtectedRoute`로 감쌌다.

```jsx
<ProtectedRoute auth={auth}>
  <MyPageRoute auth={auth} />
</ProtectedRoute>
```

보호 대상은 다음 세 곳이다.

```text
/mypage
/posts/new
/posts/:postId/edit
```

`auth.status`가 `loading`이면 로그인 상태 확인 중이라는 로딩 UI를 보여준다. 비로그인 상태면 빈 화면을 보여주지 않고 로그인 안내 화면을 보여준다.

```jsx
if (!auth.isAuthenticated) {
  return (
    <section className="protected-panel">
      <h2>로그인이 필요한 페이지입니다.</h2>
      ...
    </section>
  );
}
```

이렇게 하면 사용자가 주소창에 `/mypage`를 직접 입력해도 앱이 깨지지 않는다.

## 5. 비로그인 상태의 마이페이지 버튼 숨김

수정 파일:

```text
frontend/src/components/common/Header.jsx
```

사용자 요청에 맞춰 비로그인 상태에서는 Header에 마이페이지 버튼을 렌더링하지 않는다.

```jsx
{auth.isAuthenticated && (
  <NavLink className="nav-link" to="/mypage">
    마이페이지
  </NavLink>
)}
```

여기서 `disabled` 버튼을 쓰지 않은 이유는 UX 때문이다. 누를 수 없는 버튼이 보이면 사용자는 “왜 안 눌리지?”라고 느끼기 쉽다. 이번 구현에서는 비로그인 사용자가 볼 필요 없는 메뉴를 아예 숨기고, 직접 URL 접근만 보호 라우트에서 처리한다.

## 6. Header와 Layout 분리

수정 파일:

```text
frontend/src/components/common/Header.jsx
frontend/src/components/common/Layout.jsx
```

`Header.jsx`는 상단 navigation만 담당한다.

- 홈
- 게시글
- 검색
- 게시판 메뉴
- 로그인/회원가입
- 로그인 상태의 글쓰기/마이페이지/로그아웃

`Layout.jsx`는 앱의 공통 뼈대를 담당한다.

- Header 표시
- Phase 제목 영역
- health check 상태 표시
- 현재 page content 표시

역할을 나누면 Header를 수정할 때 페이지 라우팅 로직을 건드리지 않아도 되고, Layout을 수정할 때 로그인 폼을 건드리지 않아도 된다.

## 7. 공통 UI 컴포넌트

수정 파일:

```text
frontend/src/components/common/Button.jsx
frontend/src/components/common/Input.jsx
frontend/src/components/common/Loading.jsx
frontend/src/components/common/Modal.jsx
```

`Button`은 버튼의 모양을 `variant`로 고른다.

```jsx
<Button variant="danger">삭제</Button>
```

`Input`은 label과 input을 함께 묶는다. 같은 패턴을 로그인/회원가입에서 반복하지 않기 위해 만들었다.

```jsx
<Input
  label="로그인 ID"
  name="login_id"
  value={form.login_id}
  onChange={handleChange}
/>
```

`Loading`은 인증 확인 같은 공통 로딩 상태에 사용한다.

`Modal`은 확인이 필요한 작업에 사용한다. 이번 Phase에서는 게시글 삭제 확인에 연결했다.

## 8. window.confirm을 Modal로 교체

수정 파일:

```text
frontend/src/pages/PostDetailPage.jsx
```

기존에는 게시글 삭제 때 브라우저 기본 확인창을 사용했다.

```javascript
window.confirm("게시글을 삭제할까요?");
```

Phase 10에서는 React 상태로 모달을 열고 닫는다.

```javascript
const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
```

삭제 버튼을 누르면 모달을 열고, 모달 안의 삭제 버튼을 누르면 실제 API를 호출한다.

```jsx
<Modal
  isOpen={isDeleteModalOpen}
  title="게시글 삭제"
  actions={...}
>
  <p>이 게시글을 삭제할까요?</p>
</Modal>
```

이 방식은 앱 디자인과 같은 스타일의 확인 UI를 만들 수 있고, 나중에 “삭제 사유 입력” 같은 기능을 붙이기도 쉽다.

## 9. 상수 파일

수정 파일:

```text
frontend/src/constants/boardTypes.js
frontend/src/constants/postStatus.js
```

`boardTypes.js`에는 기본 게시판 코드와 한글 라벨을 넣었다.

```javascript
export const BOARD_TYPES = [
  { code: "REVIEW", name: "후기", ... },
  { code: "INFO", name: "정보", ... },
];
```

Header는 서버에서 게시판 목록을 가져오려고 시도한다. 실패하면 이 상수 목록을 fallback으로 사용한다. 그래서 백엔드가 잠깐 꺼져 있어도 상단 메뉴의 기본 구조는 유지된다.

`postStatus.js`는 게시글 상태 라벨을 모아 둔 파일이다. 아직 화면에서 많이 쓰지는 않지만, 이후 목록이나 관리자 화면에서 상태 표시가 필요할 때 같은 라벨을 재사용할 수 있다.

## 10. 전역 스타일

수정 파일:

```text
frontend/src/styles/global.css
frontend/src/main.jsx
```

`main.jsx`에서 전역 스타일을 import한다.

```javascript
import './styles/global.css'
```

`global.css`는 기존 `App.css`를 import한 뒤 Phase 10에서 추가한 Header, Router layout, Modal, Button, Input 스타일을 덮어쓴다.

```css
@import "../App.css";
```

이렇게 한 이유는 기존 Phase 4-9 화면 스타일을 한 번에 다 지우지 않고, Phase 10에 필요한 전역 구조만 추가하기 위해서다.

## 11. 화면 상태와 API 상태의 차이

Phase 10에서 중요한 학습 포인트는 화면 상태와 API 상태를 구분하는 것이다.

화면 상태는 URL이 담당한다.

```text
/search
/mypage
/posts/1
```

API 상태는 각 page 컴포넌트가 담당한다.

```javascript
const [isLoading, setIsLoading] = useState(false);
const [errorMessage, setErrorMessage] = useState("");
```

즉 “어느 화면인가?”는 Router가 결정하고, “그 화면의 데이터를 불러오는 중인가?”는 page가 결정한다.

## 12. 직접 검증한 명령

프론트 빌드 확인:

```powershell
cd frontend
cmd.exe /c C:\Progra~1\nodejs\node.exe node_modules\vite\bin\vite.js build
```

빌드가 통과하면 React Router import, JSX 문법, 컴포넌트 export/import 문제가 없다는 뜻이다.

# Phase 11. MVP 테스트와 정리

Phase 11의 목표는 새로운 기능을 크게 추가하는 것이 아니라, 지금까지 만든 AI 없는 게시판 MVP가 실제 사용자 흐름으로 안정적으로 동작하는지 확인하는 것이다.

이번 phase에서는 두 가지를 했다.

```text
1. 게시판 내부 검색이 실제로 동작하도록 GET /posts에 q 파라미터를 연결했다.
2. MVP 주요 시나리오를 한 번에 검증하는 API 스모크 테스트 스크립트를 추가했다.
```

## 1. 수정 파일

백엔드 검색 연결:

```text
backend/app/api/routes/posts.py
backend/app/services/post_service.py
backend/app/repositories/post_repository.py
```

테스트 스크립트:

```text
scripts/mvp_phase11_check.py
```

문서:

```text
docs/implementation-guide2.md
```

## 2. 왜 GET /posts에 q를 추가했는가

Phase 10에서 프론트 게시판 화면은 각 게시판 안에 검색창을 두도록 정리했다. 화면에서는 이미 다음처럼 API에 검색어를 넘기고 있었다.

```javascript
usePostList({
  boardCode,
  q: appliedSearchQuery,
  tag: tagFilter,
  sort,
  page,
  size: PAGE_SIZE,
});
```

하지만 백엔드의 `GET /api/v1/posts` 라우터는 `q`를 받지 않고 있었다. FastAPI는 라우터 함수에 선언되지 않은 query parameter를 자동으로 서비스에 넘기지 않는다. 그래서 사용자가 게시판 안에서 검색해도 백엔드에서는 검색어를 모르는 상태였다.

이번에 라우터에 `q`를 추가했다.

```python
@router.get("", response_model=PostListResponse)
def list_posts(
    db: DbSession,
    board_code: BoardCode | None = Query(default=None),
    q: str | None = Query(default=None, max_length=100),
    tag: str | None = Query(default=None, max_length=100),
    sort: Literal["latest", "relevance", "views", "satisfaction", "comments"] = Query(
        default="latest"
    ),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=50),
) -> PostListResponse:
    return post_service.list_posts(...)
```

FastAPI에서 중요한 점은 함수 인자가 곧 API 계약이라는 점이다.

```text
q: str | None = Query(default=None, max_length=100)
```

이 한 줄은 다음 의미를 가진다.

```text
- query string으로 q를 받을 수 있다.
- q는 없어도 된다.
- q가 있으면 문자열이어야 한다.
- 최대 100자까지만 허용한다.
```

즉 `GET /api/v1/posts?board_code=REVIEW&q=미쿠` 같은 요청이 라우터에서 정상적으로 해석된다.

## 3. service 계층에서 한 일

수정 파일:

```text
backend/app/services/post_service.py
```

service에서는 사용자가 보낸 검색어를 바로 repository에 넘기지 않고, 먼저 정리한다.

```python
cleaned_q = _clean_optional_text(q)
normalized_q = normalize_tag_name(cleaned_q) if cleaned_q else None
```

`cleaned_q`는 앞뒤 공백을 제거한 검색어다.

```text
"  미쿠  " -> "미쿠"
"   " -> None
```

`normalized_q`는 태그 검색까지 같이 하기 위한 정규화 값이다. 예를 들어 사용자가 태그 이름 일부를 검색할 때 `Tag.name`뿐 아니라 `Tag.normalized_name`도 함께 볼 수 있다.

service 계층에서 이런 정리를 하는 이유는 라우터와 repository를 단순하게 유지하기 위해서다.

```text
router: HTTP 요청을 받는다.
service: 입력값을 업무 규칙에 맞게 정리하고 흐름을 조정한다.
repository: DB query를 만든다.
```

이 분리가 잘 되어 있으면, 나중에 검색 규칙이 바뀌어도 라우터 코드를 크게 흔들지 않아도 된다.

## 4. repository 계층에서 한 일

수정 파일:

```text
backend/app/repositories/post_repository.py
```

기존 검색 API인 `GET /search/posts`에는 이미 제목, 본문, 피규어명, 제조사, 태그를 검색하는 조건이 있었다. 그래서 새 검색 로직을 또 만들지 않고 기존 `_search_post_filters()`를 재사용했다.

```python
filters.extend(
    _search_post_filters(
        q=q,
        normalized_q=normalized_q,
        figure_name=None,
        manufacturer=None,
        price_range=None,
    )
)
```

이 코드는 공개 게시글 목록의 기본 조건에 검색 조건을 추가한다.

기본 조건:

```text
- PUBLISHED 상태
- deleted_at이 없음
- 활성 게시판
- board_code가 있으면 해당 게시판만
- tag가 있으면 해당 태그가 연결된 글만
```

검색 조건:

```text
- 제목에 q 포함
- 본문에 q 포함
- 후기 피규어명에 q 포함
- 제조사명에 q 포함
- 태그명 또는 정규화 태그명에 q 포함
```

SQLAlchemy 관점에서 중요한 부분은 `Post.figure_infos.any(...)`와 `Post.tag_links.any(...)`다.

```python
Post.figure_infos.any(...)
Post.tag_links.any(...)
```

이 표현은 관계 테이블을 직접 문자열 SQL로 조립하지 않고, SQLAlchemy relationship을 통해 “연결된 row 중 조건을 만족하는 것이 있는가?”를 표현한다. 학습할 때는 이 지점을 눈여겨보면 좋다. ORM을 쓰는 이유는 테이블 관계를 Python 객체 관계처럼 읽게 만들기 위해서다.

정렬도 검색어가 있을 때 `relevance`를 사용할 수 있게 했다.

```python
.order_by(*_post_order_by(sort, q=q, normalized_q=normalized_q))
```

`relevance` 정렬은 AI 의미 검색이 아니다. MVP 범위에서는 PostgreSQL 기본 조건과 SQLAlchemy `case()`를 이용해 제목, 본문, 피규어 정보, 태그가 맞는 글을 조금 더 위로 올리는 정도다.

## 5. Phase 11 스모크 테스트 스크립트

추가 파일:

```text
scripts/mvp_phase11_check.py
```

이 스크립트는 `pytest` 같은 테스트 프레임워크를 새로 도입하지 않고, `httpx`로 실제 FastAPI 서버를 호출한다.

실행 전제:

```text
- PostgreSQL이 실행 중이어야 한다.
- 기본 게시판 seed가 되어 있어야 한다.
- FastAPI 백엔드 서버가 실행 중이어야 한다.
```

실행 명령:

```powershell
cd C:\Users\yoonj\jungle\AI-board\yoonji
python scripts\mvp_phase11_check.py
```

API 주소를 바꾸고 싶을 때:

```powershell
$env:MVP_API_BASE_URL = "http://127.0.0.1:8000/api/v1"
python scripts\mvp_phase11_check.py
```

스크립트는 매번 고유한 회원 아이디와 게시글 제목을 만든다.

```python
marker = uuid.uuid4().hex[:8]
login_id = f"phase11_{marker}_{suffix}"
```

이렇게 하면 같은 스크립트를 여러 번 실행해도 이전 실행에서 만든 회원과 충돌하지 않는다.

## 6. 스크립트가 확인하는 시나리오

`docs/testing/test-scenarios.md`와 AGENTS.md의 Phase 11 우선 검증 항목을 기준으로 확인한다.

```text
BOARD-01 비회원 게시글 목록/상세 조회
BOARD-02 회원가입/로그인
BOARD-04 후기 게시글 작성
BOARD-05 필수값 검증
BOARD-09 게시글 수정
BOARD-11 게시글 삭제
BOARD-12 댓글 CRUD
BOARD-14 태그 탐색
BOARD-15 검색
BOARD-16 페이징/정렬
BOARD-18 인증 보호
```

테스트 흐름은 사용자 행동 순서에 가깝게 만들었다.

```text
1. health check
2. 게시판 목록 확인
3. 비회원 글쓰기 차단 확인
4. 회원가입/로그인
5. /users/me 확인
6. 이미지 업로드
7. 후기 필수값 검증
8. 후기 게시글 작성
9. 게시글 목록/상세 조회
10. 게시판 내부 검색, 태그 검색, 전체 검색 확인
11. 페이징/정렬 확인
12. 댓글 작성/목록/수정/삭제
13. 다른 사용자의 게시글/댓글 수정 차단
14. 마이페이지의 내 게시글/내 댓글 확인
15. 게시글 삭제와 삭제 후 상세 404 확인
```

여기서 핵심은 테스트가 DB에 직접 insert하지 않는다는 점이다.

```python
client.post("/auth/signup", json=signup_payload)
client.post("/posts", json=payload, headers=auth_headers(actor))
client.get("/posts", params={"board_code": "REVIEW", "q": marker})
```

이 방식은 조금 느리지만 MVP 검증에는 더 적합하다. 실제 사용자가 호출하는 API와 같은 경로를 지나기 때문이다.

## 7. FastAPI 학습 포인트

FastAPI에서는 라우터 함수의 인자가 API 문서와 검증 규칙이 된다.

```python
page: int = Query(default=1, ge=1)
size: int = Query(default=20, ge=1, le=50)
```

이 코드는 다음 요청을 자동으로 막아 준다.

```text
GET /posts?page=0
GET /posts?size=999
```

인증이 필요한 API는 `CurrentUser` dependency를 함수 인자로 받는다.

```python
def create_post(
    payload: PostCreateRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> PostCreateResponse:
```

그래서 access token이 없으면 service 코드에 도달하기 전에 `AUTHENTICATION_REQUIRED`가 발생한다. 테스트 스크립트가 비회원 글쓰기, 비회원 댓글 작성, 비회원 이미지 업로드를 확인하는 이유가 여기에 있다.

## 8. SQLAlchemy / PostgreSQL 학습 포인트

게시글 목록은 단순히 `select(Post)`만 하지 않는다. 게시판, 작성자, 이미지, 태그, 후기 피규어 정보가 함께 필요하다.

```python
.options(
    joinedload(Post.board),
    joinedload(Post.author),
    selectinload(Post.figure_infos),
    selectinload(Post.images),
    selectinload(Post.tag_links).joinedload(PostTag.tag),
)
```

`joinedload`는 보통 1:1 또는 N:1 관계에 어울린다.

```text
Post -> Board
Post -> User(author)
```

`selectinload`는 1:N 관계를 따로 모아서 가져올 때 좋다.

```text
Post -> Images
Post -> FigureInfos
Post -> TagLinks
```

이 차이를 이해하면 N+1 query 문제를 줄이는 방법을 배울 수 있다.

검색은 MVP 범위이므로 pgvector나 AI 의미 검색을 쓰지 않는다. 대신 PostgreSQL에서 기본적으로 가능한 `LIKE` 계열 검색을 SQLAlchemy의 `ilike()`로 표현한다.

```python
Post.title.ilike(pattern)
Post.content.ilike(pattern)
```

이 정도만으로도 MVP 게시판의 제목/본문/태그/피규어명 검색을 학습하기에는 충분하다.

## 9. React 학습 포인트

프론트에서는 검색창이 있는 화면과 API 호출 함수를 분리해 두었다.

```text
frontend/src/pages/PostListPage.jsx
frontend/src/api/postApi.js
frontend/src/hooks/usePosts.js
```

페이지 컴포넌트는 화면 상태를 가진다.

```javascript
const [searchQuery, setSearchQuery] = useState("");
const [appliedSearchQuery, setAppliedSearchQuery] = useState("");
```

API 함수는 HTTP 호출만 담당한다.

```javascript
export async function getPosts(params = {}) {
  const response = await axiosInstance.get("/posts", { params });
  return response.data;
}
```

hook은 화면 상태와 API 상태 사이를 연결한다.

```javascript
const posts = usePostList({
  boardCode,
  q: appliedSearchQuery,
  sort,
  page,
  size: PAGE_SIZE,
});
```

이번 백엔드 수정은 이 React 흐름을 완성한 것이다. 화면에서 `q`를 보내고, FastAPI가 `q`를 받고, service가 값을 정리하고, repository가 SQLAlchemy query에 검색 조건을 추가한다.

## 10. 직접 검증할 명령

문법 확인:

```powershell
$env:PYTHONPYCACHEPREFIX = "$env:TEMP\yoonji-pycache"
C:\Users\yoonj\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m compileall backend\app scripts
```

프론트 빌드 확인:

```powershell
cd frontend
cmd.exe /c C:\Progra~1\nodejs\node.exe node_modules\vite\bin\vite.js build
```

백엔드가 실행 중일 때 MVP 스모크 테스트:

```powershell
cd C:\Users\yoonj\jungle\AI-board\yoonji
python scripts\mvp_phase11_check.py
```

이 스크립트가 통과하면 AI 기능 없이도 회원가입, 로그인, 게시글 작성, 이미지 연결, 댓글, 태그, 검색, 페이지네이션, 마이페이지, 권한 보호가 기본 게시판 서비스로 연결되어 있다는 뜻이다.
