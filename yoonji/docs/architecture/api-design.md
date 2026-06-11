# 피규어 커뮤니티 API 설계안

## 1. 설계 기준

이 API는 React 클라이언트와 FastAPI 백엔드가 통신하는 REST API를 기준으로 설계한다.

- API prefix: `/api/v1`
- 데이터 형식: JSON, `multipart/form-data`
- 필드 네이밍: `snake_case`
- 인증 방식: JWT Access Token + Refresh Token
- 기본 권한:
  - 비회원: 게시글 목록/상세, 검색, AI 결과 조회
  - 회원: 게시글/댓글 작성, AI Q&A 요청
  - 운영자: 신고 처리, AI 초안 검수, 공지/FAQ 관리
- AI/MCP 작업은 시간이 걸릴 수 있으므로 비동기 처리를 기본으로 한다.

### 1.1 공통 응답 규칙

단일 리소스 응답은 리소스 객체를 바로 반환한다.

```json
{
  "id": 1,
  "title": "넨도로이드 후기",
  "created_at": "2026-06-09T10:00:00+09:00"
}
```

목록 응답은 `items`와 페이지 정보를 함께 반환한다.

```json
{
  "items": [],
  "page": 1,
  "size": 20,
  "total": 125,
  "has_next": true
}
```

에러 응답은 모든 API에서 같은 구조를 사용한다.

```json
{
  "error": {
    "code": "POST_NOT_FOUND",
    "message": "게시글을 찾을 수 없습니다.",
    "details": {}
  }
}
```

### 1.2 주요 HTTP 상태 코드

| 상태 코드 | 의미 |
| --- | --- |
| `200 OK` | 조회, 수정 성공 |
| `201 Created` | 생성 성공 |
| `202 Accepted` | AI, MCP 등 비동기 작업 접수 |
| `204 No Content` | 삭제, 로그아웃 성공 |
| `400 Bad Request` | 요청 값 오류 |
| `401 Unauthorized` | 인증 필요 |
| `403 Forbidden` | 권한 없음 |
| `404 Not Found` | 리소스 없음 |
| `409 Conflict` | 중복 이메일, 중복 아이디 등 |
| `422 Unprocessable Entity` | 유효성 검증 실패 |
| `500 Internal Server Error` | 서버 오류 |

## 2. 공통 타입

### 2.1 Enum

```txt
UserRole = USER | ADMIN
UserStatus = ACTIVE | INACTIVE | SUSPENDED | DELETED

BoardCode = REVIEW | INFO | QUESTION | PURCHASE_HELP | NOTICE | FAQ

PostSourceType = USER | AI_DRAFT | AI_PUBLISHED
PostStatus = DRAFT | PUBLISHED | PENDING_REVIEW | HIDDEN | DELETED

FigureType = SCALE | NENDOROID | FIGMA | ACTION_FIGURE | PRIZE | GARAGE_KIT | OTHER
PriceRange = UNDER_30000 | 30000_50000 | 50000_100000 | 100000_200000 | OVER_200000 | UNKNOWN
FigureTargetType = REVIEW_TARGET | RELATED_FIGURE

CommentStatus = PUBLISHED | HIDDEN | DELETED

TagType = CHARACTER | WORK | MANUFACTURER | TOPIC | PRICE | GENERAL
TagStatus = ACTIVE | MERGED | BLOCKED | DELETED

ImageStatus = TEMP | ATTACHED | DELETED | FAILED
LinkFetchStatus = PENDING | SUCCESS | FAILED | UNSUPPORTED | STALE

AiOutputType =
  QNA_ANSWER
  | QUESTION_REFERENCE_ANSWER
  | PURCHASE_SUMMARY
  | SIMILAR_POST_SUMMARY
  | BEGINNER_INFO_DRAFT

AiOutputStatus =
  REQUESTED
  | PROCESSING
  | GENERATED
  | PENDING_REVIEW
  | APPROVED
  | PUBLISHED
  | REJECTED
  | FAILED

GroundingStatus = GROUNDED | PARTIALLY_GROUNDED | NO_EVIDENCE
```

`AiOutputStatus`의 `REQUESTED`, `PROCESSING`은 비동기 AI 작업 상태 추적을 위해 모델 설계안에 추가하는 것을 권장한다.

### 2.2 UserSummary

```json
{
  "id": 1,
  "login_id": "figurefan",
  "nickname": "피규어팬",
  "profile_image_url": "/uploads/profiles/1.png",
  "role": "USER"
}
```

### 2.3 Board

```json
{
  "id": 1,
  "code": "REVIEW",
  "name": "피규어 후기",
  "description": "피규어 사진과 후기를 공유하는 게시판",
  "sort_order": 1,
  "is_active": true
}
```

### 2.4 Tag

```json
{
  "id": 10,
  "name": "하츠네 미쿠",
  "normalized_name": "하츠네미쿠",
  "tag_type": "CHARACTER",
  "usage_count": 25
}
```

### 2.5 PostFigureInfo

API 요청/응답에서는 `figure_name`, `manufacturer`를 사용한다. DB 컬럼은 피규어 마스터 테이블과 구분하기 위해 `figure_name_text`, `manufacturer_text`로 저장해도 되며, API 계층에서 아래처럼 매핑한다.

`PostFigureInfo`는 후기 게시판(`REVIEW`)에서만 사용한다. 구매 고민 게시판(`PURCHASE_HELP`)은 별도 피규어 정보 테이블을 만들지 않고 제목과 본문에 고민 내용을 작성한다.

| API 필드 | DB 컬럼 |
| --- | --- |
| `figure_name` | `figure_name_text` |
| `manufacturer` | `manufacturer_text` |

```json
{
  "id": 1,
  "figure_name": "하츠네 미쿠 NT 스타일",
  "manufacturer": "Good Smile Company",
  "figure_type": "NENDOROID",
  "price_amount": 68000,
  "price_range": "50000_100000",
  "purchase_date": "2026-05-10",
  "satisfaction_score": 5,
  "target_type": "REVIEW_TARGET"
}
```

### 2.6 PostImage

```json
{
  "id": 20,
  "file_url": "/uploads/posts/20/original.jpg",
  "thumbnail_url": "/uploads/posts/20/thumb.jpg",
  "width": 1200,
  "height": 900,
  "sort_order": 1
}
```

### 2.7 ExternalLinkPreview

```json
{
  "id": 30,
  "post_id": null,
  "url": "https://example.com/item/1",
  "canonical_url": "https://example.com/item/1",
  "domain": "example.com",
  "title": "예약 판매 페이지",
  "summary": "예약 판매 일정과 가격 정보가 포함된 페이지입니다.",
  "thumbnail_url": "https://example.com/thumb.jpg",
  "provider": "example",
  "fetch_status": "SUCCESS",
  "fetched_at": "2026-06-09T10:00:00+09:00"
}
```

`post_id`는 nullable이다. 게시글 작성 전 자동 링크 탐색 또는 임시 미리보기 단계에서 먼저 생성될 수 있으며, 게시글에 최종 연결되면 해당 게시글 ID가 저장된다.

### 2.8 AiOutputSource

```json
{
  "id": 100,
  "source_post_id": 12,
  "source_comment_id": null,
  "source_url": null,
  "relevance_score": 0.87,
  "rank_order": 1,
  "excerpt": "먼지는 부드러운 붓으로 털고 직사광선을 피하는 것이 좋습니다."
}
```

### 2.9 AiOutput

```json
{
  "id": 50,
  "output_type": "QNA_ANSWER",
  "target_post_id": null,
  "query_text": "피규어 먼지 관리는 어떻게 해?",
  "title": "피규어 먼지 관리 요약",
  "content": "게시판 글 기준으로는 부드러운 붓, 아크릴 케이스, 습도 관리가 자주 언급됩니다.",
  "status": "GENERATED",
  "grounding_status": "GROUNDED",
  "confidence_score": 0.82,
  "sources": []
}
```

## 3. 인증 API

### 3.1 회원가입

`POST /api/v1/auth/signup`

권한: 비회원

Request:

```json
{
  "email": "user@example.com",
  "login_id": "figurefan",
  "password": "password1234!",
  "nickname": "피규어팬"
}
```

Response `201 Created`:

```json
{
  "id": 1,
  "email": "user@example.com",
  "login_id": "figurefan",
  "nickname": "피규어팬",
  "role": "USER",
  "status": "ACTIVE",
  "created_at": "2026-06-09T10:00:00+09:00"
}
```

### 3.2 로그인

`POST /api/v1/auth/login`

권한: 비회원

Request:

```json
{
  "login_id": "figurefan",
  "password": "password1234!"
}
```

Response `200 OK`:

```json
{
  "access_token": "jwt-access-token",
  "refresh_token": "refresh-token",
  "token_type": "Bearer",
  "expires_in": 1800,
  "user": {
    "id": 1,
    "login_id": "figurefan",
    "nickname": "피규어팬",
    "profile_image_url": null,
    "role": "USER"
  }
}
```

### 3.3 토큰 재발급

`POST /api/v1/auth/refresh`

권한: 회원

Request:

```json
{
  "refresh_token": "refresh-token"
}
```

Response `200 OK`:

```json
{
  "access_token": "new-jwt-access-token",
  "refresh_token": "new-refresh-token",
  "token_type": "Bearer",
  "expires_in": 1800
}
```

### 3.4 로그아웃

`POST /api/v1/auth/logout`

권한: 회원

Request:

```json
{
  "refresh_token": "refresh-token"
}
```

Response: `204 No Content`

## 4. 사용자 API

### 4.1 내 정보 조회

`GET /api/v1/users/me`

권한: 회원

Response `200 OK`:

```json
{
  "id": 1,
  "email": "user@example.com",
  "login_id": "figurefan",
  "nickname": "피규어팬",
  "profile_image_url": null,
  "role": "USER",
  "status": "ACTIVE",
  "last_login_at": "2026-06-09T09:30:00+09:00",
  "created_at": "2026-06-01T10:00:00+09:00"
}
```

### 4.2 내 정보 수정

`PATCH /api/v1/users/me`

권한: 회원

Request:

```json
{
  "nickname": "새닉네임",
  "profile_image_url": "/uploads/profiles/1.png"
}
```

Response: 수정된 사용자 정보

### 4.3 내 게시글 목록

`GET /api/v1/users/me/posts?page=1&size=20`

권한: 회원

Response: 게시글 목록 응답

### 4.4 내 댓글 목록

`GET /api/v1/users/me/comments?page=1&size=20`

권한: 회원

Response:

```json
{
  "items": [
    {
      "id": 1,
      "post_id": 10,
      "post_title": "넨도로이드 후기",
      "content": "저도 이 제품 만족도가 높았습니다.",
      "status": "PUBLISHED",
      "created_at": "2026-06-09T10:00:00+09:00"
    }
  ],
  "page": 1,
  "size": 20,
  "total": 1,
  "has_next": false
}
```

## 5. 게시판 API

### 5.1 게시판 목록 조회

`GET /api/v1/boards`

권한: 비회원

Response `200 OK`:

```json
{
  "items": [
    {
      "id": 1,
      "code": "REVIEW",
      "name": "피규어 후기",
      "description": "피규어 사진과 후기를 공유하는 게시판",
      "sort_order": 1,
      "is_active": true
    }
  ]
}
```

### 5.2 게시판 상세 조회

`GET /api/v1/boards/{board_code}`

예: `GET /api/v1/boards/REVIEW`

권한: 비회원

Response: Board

## 6. 게시글 API

### 6.1 게시글 목록 조회

`GET /api/v1/posts`

권한: 비회원

Query:

| 이름 | 타입 | 설명 |
| --- | --- | --- |
| `board_code` | string | 게시판 코드 |
| `q` | string | 키워드 검색어 |
| `tag` | string | 태그명 |
| `author_id` | int | 작성자 ID |
| `sort` | string | `latest`, `views`, `satisfaction`, `comments`, `relevance` |
| `page` | int | 기본값 `1` |
| `size` | int | 기본값 `20`, 최대 `50` |

Response `200 OK`:

```json
{
  "items": [
    {
      "id": 10,
      "board": {
        "id": 1,
        "code": "REVIEW",
        "name": "피규어 후기"
      },
      "author": {
        "id": 1,
        "login_id": "figurefan",
        "nickname": "피규어팬",
        "profile_image_url": null,
        "role": "USER"
      },
      "title": "넨도로이드 하츠네 미쿠 후기",
      "summary": "사진보다 실물이 더 귀엽고 도색 품질이 좋았습니다.",
      "thumbnail_url": "/uploads/posts/10/thumb.jpg",
      "tags": [
        {
          "id": 1,
          "name": "하츠네 미쿠",
          "tag_type": "CHARACTER"
        }
      ],
      "figure_info": {
        "figure_name": "하츠네 미쿠 NT 스타일",
        "manufacturer": "Good Smile Company",
        "price_range": "50000_100000",
        "satisfaction_score": 5
      },
      "view_count": 120,
      "comment_count": 8,
      "published_at": "2026-06-09T10:00:00+09:00"
    }
  ],
  "page": 1,
  "size": 20,
  "total": 1,
  "has_next": false
}
```

### 6.2 게시글 작성

`POST /api/v1/posts`

권한: 회원

Request:

```json
{
  "board_code": "REVIEW",
  "title": "넨도로이드 하츠네 미쿠 후기",
  "content": "실물 도색이 좋고 구성품도 만족스러웠습니다.",
  "status": "PUBLISHED",
  "figure_info": {
    "figure_name": "하츠네 미쿠 NT 스타일",
    "manufacturer": "Good Smile Company",
    "figure_type": "NENDOROID",
    "price_amount": 68000,
    "price_range": "50000_100000",
    "purchase_date": "2026-05-10",
    "satisfaction_score": 5,
    "target_type": "REVIEW_TARGET"
  },
  "tags": [
    {
      "name": "하츠네 미쿠",
      "tag_type": "CHARACTER"
    },
    {
      "name": "넨도로이드",
      "tag_type": "TOPIC"
    }
  ],
  "image_ids": [20, 21]
}
```

Response `201 Created`:

```json
{
  "id": 10,
  "board_code": "REVIEW",
  "title": "넨도로이드 하츠네 미쿠 후기",
  "status": "PUBLISHED",
  "queued_jobs": [
    {
      "type": "INDEX_POST",
      "status": "REQUESTED"
    },
    {
      "type": "AUTO_LINK_DISCOVERY",
      "status": "REQUESTED"
    }
  ],
  "created_at": "2026-06-09T10:00:00+09:00"
}
```

게시판별 필수 값:

| 게시판 | 필수 값 |
| --- | --- |
| `REVIEW` | `title`, `content`, `figure_info.figure_name`, `figure_info.satisfaction_score` |
| `INFO` | `title`, `content` |
| `QUESTION` | `title`, `content` |
| `PURCHASE_HELP` | `title`, `content` |
| `NOTICE` | 운영자만 작성 가능 |
| `FAQ` | 운영자만 작성 가능 |

### 6.3 게시글 상세 조회

`GET /api/v1/posts/{post_id}`

권한: 비회원

Query:

| 이름 | 타입 | 설명 |
| --- | --- | --- |
| `include` | string | `comments,ai_outputs,similar_posts,link_previews` |

Response `200 OK`:

```json
{
  "id": 10,
  "board": {
    "id": 1,
    "code": "REVIEW",
    "name": "피규어 후기"
  },
  "author": {
    "id": 1,
    "login_id": "figurefan",
    "nickname": "피규어팬",
    "profile_image_url": null,
    "role": "USER"
  },
  "title": "넨도로이드 하츠네 미쿠 후기",
  "content": "실물 도색이 좋고 구성품도 만족스러웠습니다.",
  "source_type": "USER",
  "status": "PUBLISHED",
  "view_count": 121,
  "comment_count": 8,
  "figure_info": {
    "id": 1,
    "figure_name": "하츠네 미쿠 NT 스타일",
    "manufacturer": "Good Smile Company",
    "figure_type": "NENDOROID",
    "price_amount": 68000,
    "price_range": "50000_100000",
    "purchase_date": "2026-05-10",
    "satisfaction_score": 5,
    "target_type": "REVIEW_TARGET"
  },
  "tags": [],
  "images": [],
  "link_previews": [],
  "ai_outputs": [],
  "similar_posts": [],
  "published_at": "2026-06-09T10:00:00+09:00",
  "created_at": "2026-06-09T10:00:00+09:00",
  "updated_at": "2026-06-09T10:00:00+09:00"
}
```

### 6.4 게시글 수정

`PATCH /api/v1/posts/{post_id}`

권한: 작성자 또는 운영자

Request:

```json
{
  "title": "수정된 제목",
  "content": "수정된 본문",
  "figure_info": {
    "price_amount": 70000,
    "satisfaction_score": 4
  },
  "tags": [
    {
      "name": "하츠네 미쿠",
      "tag_type": "CHARACTER"
    }
  ],
  "image_ids": [20]
}
```

Response: 게시글 상세 응답

수정 후에는 기존 RAG 청크를 `STALE` 처리하고 재인덱싱 작업을 큐에 넣는다. 제목, 본문, 후기 글의 피규어 정보가 바뀐 경우 AI/MCP 자동 링크 탐색 작업도 다시 요청할 수 있다.

### 6.5 게시글 삭제

`DELETE /api/v1/posts/{post_id}`

권한: 작성자 또는 운영자

Response: `204 No Content`

실제 삭제 대신 `status=DELETED`, `deleted_at`을 기록하는 소프트 삭제를 기본으로 한다.

## 7. 이미지 API

### 7.1 임시 이미지 업로드

`POST /api/v1/images`

권한: 회원

Content-Type: `multipart/form-data`

Form:

| 이름 | 타입 | 설명 |
| --- | --- | --- |
| `file` | file | 이미지 파일 |

Response `201 Created`:

```json
{
  "id": 20,
  "file_url": "/uploads/temp/20/original.jpg",
  "thumbnail_url": "/uploads/temp/20/thumb.jpg",
  "original_name": "miku.jpg",
  "mime_type": "image/jpeg",
  "size_bytes": 512000,
  "width": 1200,
  "height": 900,
  "sort_order": 0,
  "status": "TEMP",
  "created_at": "2026-06-09T10:00:00+09:00"
}
```

### 7.2 이미지 삭제

`DELETE /api/v1/images/{image_id}`

권한: 업로더 또는 운영자

Response: `204 No Content`

## 8. 댓글 API

### 8.1 댓글 목록 조회

`GET /api/v1/posts/{post_id}/comments?page=1&size=50`

권한: 비회원

Response `200 OK`:

```json
{
  "items": [
    {
      "id": 1,
      "post_id": 10,
      "author": {
        "id": 2,
        "login_id": "collector",
        "nickname": "수집가",
        "profile_image_url": null,
        "role": "USER"
      },
      "content": "구매처는 어디였나요?",
      "status": "PUBLISHED",
      "created_at": "2026-06-09T11:00:00+09:00",
      "updated_at": "2026-06-09T11:00:00+09:00"
    }
  ],
  "page": 1,
  "size": 50,
  "total": 1,
  "has_next": false
}
```

### 8.2 댓글 작성

`POST /api/v1/posts/{post_id}/comments`

권한: 회원

Request:

```json
{
  "content": "구매처는 어디였나요?"
}
```

Response `201 Created`: Comment

댓글 작성 후에는 해당 댓글의 RAG 인덱싱 작업을 큐에 넣고, 게시글 `comment_count`를 갱신한다.

### 8.3 댓글 수정

`PATCH /api/v1/comments/{comment_id}`

권한: 작성자 또는 운영자

Request:

```json
{
  "content": "구매처와 배송 기간이 궁금합니다."
}
```

Response: Comment

### 8.4 댓글 삭제

`DELETE /api/v1/comments/{comment_id}`

권한: 작성자 또는 운영자

Response: `204 No Content`

## 9. 태그 API

### 9.1 태그 검색

`GET /api/v1/tags?q=미쿠&type=CHARACTER&limit=10`

권한: 비회원

Response `200 OK`:

```json
{
  "items": [
    {
      "id": 10,
      "name": "하츠네 미쿠",
      "normalized_name": "하츠네미쿠",
      "tag_type": "CHARACTER",
      "usage_count": 25
    }
  ]
}
```

### 9.2 태그 생성

`POST /api/v1/tags`

권한: 회원

일반 글쓰기 화면에서는 게시글 작성 API가 태그를 자동 생성 또는 재사용한다. 이 API는 태그 관리 화면이나 자동완성 보조용으로 사용한다.

Request:

```json
{
  "name": "하츠네 미쿠",
  "tag_type": "CHARACTER"
}
```

Response `201 Created`: Tag

## 10. 검색 API

### 10.1 게시글 통합 검색

`GET /api/v1/search/posts`

권한: 비회원

Query:

| 이름 | 타입 | 설명 |
| --- | --- | --- |
| `q` | string | 검색어 |
| `board_code` | string | 게시판 필터 |
| `tag` | string | 태그 필터 |
| `figure_name` | string | 피규어명 필터 |
| `manufacturer` | string | 제조사 필터 |
| `price_range` | string | 가격대 필터 |
| `sort` | string | `latest`, `relevance`, `views`, `satisfaction`, `comments` |
| `page` | int | 페이지 |
| `size` | int | 페이지 크기 |

Response: 게시글 목록 응답

MVP에서는 PostgreSQL 텍스트 검색과 태그 매칭을 우선 사용한다. 이후 `sort=relevance`일 때 pgvector 기반 의미 검색을 확장한다.

## 11. 자동 외부 링크 미리보기 API

사용자는 게시글 작성 화면에서 URL을 별도 입력하지 않는다. 외부 링크 미리보기는 서버가 게시글의 제목, 본문, 태그와 후기 글의 피규어 정보를 기반으로 AI/MCP 자동 탐색을 수행해 찾은 경우에만 게시글에 연결한다.

`ExternalLinkPreview.post_id`는 nullable이다. 자동 탐색 결과가 게시글 작성 전 단계에서 먼저 만들어지는 경우에는 `post_id=null`로 저장하고, 게시글 등록 완료 후 연결한다.

### 11.1 자동 링크 탐색 작업 요청

`POST /api/v1/internal/posts/{post_id}/link-discovery`

권한: 내부 서비스 또는 운영자

```json
{
  "force": false
}
```

Response `202 Accepted`:

```json
{
  "post_id": 10,
  "status": "REQUESTED"
}
```

자동 탐색 작업은 다음 흐름으로 처리한다.

1. 게시글의 `title`, `content`, `tags`와 후기 글의 `figure_info`를 검색 문맥으로 만든다.
2. AI/MCP가 공식 사이트, 판매처, 제조사 공지, 관련 정보 페이지 후보를 찾는다.
3. 신뢰 가능한 URL을 찾은 경우에만 `ExternalLinkPreview`를 생성해 `post_id`에 연결한다.
4. 적절한 링크를 찾지 못하면 아무 링크도 연결하지 않는다.

### 11.2 게시글 링크 미리보기 목록 조회

`GET /api/v1/posts/{post_id}/link-previews`

권한: 비회원

Response `200 OK`:

```json
{
  "items": [
    {
      "id": 30,
      "post_id": 10,
      "url": "https://example.com/item/1",
      "canonical_url": "https://example.com/item/1",
      "domain": "example.com",
      "title": "예약 판매 페이지",
      "summary": "예약 판매 일정과 가격 정보가 포함된 페이지입니다.",
      "thumbnail_url": "https://example.com/thumb.jpg",
      "provider": "example",
      "fetch_status": "SUCCESS",
      "fetched_at": "2026-06-09T10:00:00+09:00"
    }
  ]
}
```

### 11.3 링크 미리보기 조회

`GET /api/v1/link-previews/{preview_id}`

권한: 비회원

Response `200 OK`: ExternalLinkPreview

### 11.4 링크 미리보기 재수집

`POST /api/v1/link-previews/{preview_id}/refresh`

권한: 내부 서비스 또는 운영자

Response `202 Accepted`:

```json
{
  "id": 30,
  "fetch_status": "PENDING"
}
```

## 12. AI API

AI API는 실제 결과 생성이 오래 걸릴 수 있으므로 `202 Accepted`로 `AiOutput`을 먼저 만들고, 클라이언트가 `GET /ai/outputs/{id}`로 상태를 폴링하는 방식을 기본으로 한다.

### 12.1 RAG Q&A 요청

`POST /api/v1/ai/qna`

권한: 회원

Request:

```json
{
  "query_text": "피규어 먼지 관리는 어떻게 해야 해?",
  "board_codes": ["INFO", "QUESTION", "FAQ"],
  "top_k": 5
}
```

Response `202 Accepted`:

```json
{
  "id": 50,
  "output_type": "QNA_ANSWER",
  "query_text": "피규어 먼지 관리는 어떻게 해야 해?",
  "status": "REQUESTED",
  "grounding_status": null,
  "created_at": "2026-06-09T10:00:00+09:00"
}
```

### 12.2 AI 결과 조회

`GET /api/v1/ai/outputs/{ai_output_id}`

권한:

- 게시글에 연결되어 공개된 AI 결과: 비회원
- 개인 Q&A 요청 결과: 요청자 또는 운영자

Response `200 OK`:

```json
{
  "id": 50,
  "output_type": "QNA_ANSWER",
  "target_post_id": null,
  "query_text": "피규어 먼지 관리는 어떻게 해야 해?",
  "title": "피규어 먼지 관리 요약",
  "content": "게시판 근거에 따르면 부드러운 붓, 아크릴 케이스, 직사광선 회피가 자주 언급됩니다.",
  "status": "GENERATED",
  "grounding_status": "GROUNDED",
  "confidence_score": 0.82,
  "model_name": "llm-model-name",
  "sources": [
    {
      "id": 100,
      "source_post_id": 12,
      "source_comment_id": null,
      "source_url": null,
      "relevance_score": 0.87,
      "rank_order": 1,
      "excerpt": "먼지는 부드러운 붓으로 털고 직사광선을 피하는 것이 좋습니다."
    }
  ],
  "created_at": "2026-06-09T10:00:00+09:00"
}
```

### 12.3 게시글 기반 유사 게시글 추천

`GET /api/v1/posts/{post_id}/similar-posts?limit=3`

권한: 비회원

Response `200 OK`:

```json
{
  "items": [
    {
      "post": {
        "id": 11,
        "board_code": "REVIEW",
        "title": "같은 캐릭터 다른 버전 후기",
        "thumbnail_url": "/uploads/posts/11/thumb.jpg",
        "satisfaction_score": 5,
        "price_range": "50000_100000"
      },
      "score": 0.91,
      "reason": "같은 캐릭터 태그와 유사한 가격대"
    }
  ]
}
```

MVP에서는 이 결과를 저장하지 않고 실시간 검색 결과로 반환한다.

### 12.4 질문 게시글 참고 답변 생성

`POST /api/v1/posts/{post_id}/ai/reference-answer`

권한: 회원

대상 게시글은 `QUESTION` 게시판이어야 한다.

Request:

```json
{
  "top_k": 5
}
```

Response `202 Accepted`: AiOutput

생성 결과:

- `output_type`: `QUESTION_REFERENCE_ANSWER`
- `target_post_id`: 질문 게시글 ID
- 화면에서는 일반 댓글이 아니라 AI 참고 답변 영역에 표시한다.

### 12.5 구매 고민 요약 생성

`POST /api/v1/posts/{post_id}/ai/purchase-summary`

권한: 회원

대상 게시글은 `PURCHASE_HELP` 게시판이어야 한다.

Request:

```json
{
  "top_k": 5,
  "include_similar_price_range": true
}
```

Response `202 Accepted`: AiOutput

생성 결과:

- `output_type`: `PURCHASE_SUMMARY`
- 동일 피규어 후기 요약
- 유사 가격대 추천 글
- 자주 언급된 장점과 단점
- 근거 게시글 링크

### 12.6 입문자용 정보글 초안 생성

`POST /api/v1/ai/beginner-info-drafts`

권한: 운영자

Request:

```json
{
  "topic": "피규어 먼지 관리 기본 가이드",
  "source_board_codes": ["QUESTION", "INFO", "FAQ"],
  "top_k": 10
}
```

Response `202 Accepted`: AiOutput

생성 결과:

- `output_type`: `BEGINNER_INFO_DRAFT`
- `status`: `PENDING_REVIEW`
- 검수 후 정보 게시판 글로 발행할 수 있다.

### 12.7 AI 초안 검수

`PATCH /api/v1/ai/outputs/{ai_output_id}/review`

권한: 운영자

Request:

```json
{
  "status": "APPROVED",
  "review_note": "근거 링크 확인 완료"
}
```

Response: AiOutput

### 12.8 AI 초안을 게시글로 발행

`POST /api/v1/ai/outputs/{ai_output_id}/publish`

권한: 운영자

Request:

```json
{
  "board_code": "INFO",
  "title": "피규어 먼지 관리 기본 가이드",
  "tags": [
    {
      "name": "먼지 관리",
      "tag_type": "TOPIC"
    }
  ]
}
```

Response `201 Created`:

```json
{
  "post_id": 80,
  "ai_output_id": 60,
  "source_type": "AI_PUBLISHED",
  "status": "PUBLISHED"
}
```

## 13. 신고 및 운영자 API

신고 기능은 MVP 선택 기능이지만 운영자 확장을 고려해 API 경계를 미리 둔다.

### 13.1 신고 생성

`POST /api/v1/reports`

권한: 회원

Request:

```json
{
  "target_type": "POST",
  "target_post_id": 10,
  "target_comment_id": null,
  "reason": "INAPPROPRIATE"
}
```

Response `201 Created`:

```json
{
  "id": 1,
  "target_type": "POST",
  "target_post_id": 10,
  "reason": "INAPPROPRIATE",
  "status": "PENDING",
  "created_at": "2026-06-09T10:00:00+09:00"
}
```

### 13.2 신고 목록 조회

`GET /api/v1/admin/reports?status=PENDING&page=1&size=20`

권한: 운영자

Response: 목록 응답

### 13.3 신고 처리

`PATCH /api/v1/admin/reports/{report_id}`

권한: 운영자

Request:

```json
{
  "status": "RESOLVED",
  "action": "HIDE_POST"
}
```

Response: Report

## 14. 내부 작업 API

아래 API는 일반 클라이언트에 공개하지 않는다. 백그라운드 워커, 운영자 도구, 배치 작업에서만 사용한다.

### 14.1 게시글 RAG 인덱싱 요청

`POST /api/v1/internal/indexing/posts/{post_id}`

권한: 내부 서비스 또는 운영자

Response `202 Accepted`:

```json
{
  "post_id": 10,
  "status": "REQUESTED"
}
```

### 14.2 댓글 RAG 인덱싱 요청

`POST /api/v1/internal/indexing/comments/{comment_id}`

권한: 내부 서비스 또는 운영자

Response `202 Accepted`

### 14.3 실패한 AI 작업 재시도

`POST /api/v1/internal/ai/outputs/{ai_output_id}/retry`

권한: 내부 서비스 또는 운영자

Response `202 Accepted`

## 15. 주요 화면별 API 사용 흐름

### 15.1 홈 화면

1. `GET /api/v1/boards`
2. `GET /api/v1/posts?board_code=REVIEW&sort=latest&size=5`
3. `GET /api/v1/posts?sort=views&size=5`
4. `GET /api/v1/posts?board_code=QUESTION&sort=latest&size=5`
5. `GET /api/v1/posts?board_code=PURCHASE_HELP&sort=latest&size=5`

### 15.2 후기 작성

1. `POST /api/v1/images`
2. `POST /api/v1/posts`
3. 서버 내부에서 게시글 인덱싱 작업 등록
4. 서버 내부에서 AI/MCP 자동 링크 탐색 작업 등록
5. 상세 화면 진입 후 `GET /api/v1/posts/{post_id}/similar-posts?limit=3`

### 15.3 질문 작성

1. `POST /api/v1/posts`
2. `POST /api/v1/posts/{post_id}/ai/reference-answer`
3. `GET /api/v1/ai/outputs/{ai_output_id}` 폴링
4. `GET /api/v1/posts/{post_id}?include=comments,ai_outputs`

### 15.4 구매 고민 작성

1. `POST /api/v1/posts`
2. `POST /api/v1/posts/{post_id}/ai/purchase-summary`
3. `GET /api/v1/ai/outputs/{ai_output_id}` 폴링
4. `GET /api/v1/posts/{post_id}/similar-posts?limit=3`

### 15.5 입문자 정보글 생성

1. 운영자가 `POST /api/v1/ai/beginner-info-drafts`
2. `GET /api/v1/ai/outputs/{ai_output_id}`로 결과 확인
3. `PATCH /api/v1/ai/outputs/{ai_output_id}/review`
4. `POST /api/v1/ai/outputs/{ai_output_id}/publish`

## 16. MVP 우선 구현 범위

### 16.1 1순위

- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /users/me`
- `GET /boards`
- `GET /posts`
- `POST /posts`
- `GET /posts/{post_id}`
- `PATCH /posts/{post_id}`
- `DELETE /posts/{post_id}`
- `POST /images`
- `GET /posts/{post_id}/comments`
- `POST /posts/{post_id}/comments`
- `PATCH /comments/{comment_id}`
- `DELETE /comments/{comment_id}`
- `GET /tags`
- `GET /search/posts`

### 16.2 2순위

- `POST /ai/qna`
- `GET /ai/outputs/{ai_output_id}`
- `GET /posts/{post_id}/similar-posts`
- `POST /posts/{post_id}/ai/reference-answer`
- `POST /posts/{post_id}/ai/purchase-summary`
- 내부 RAG 인덱싱 작업

### 16.3 3순위

- AI/MCP 자동 링크 탐색 작업
- `GET /posts/{post_id}/link-previews`
- `GET /link-previews/{preview_id}`
- `POST /link-previews/{preview_id}/refresh`
- `POST /ai/beginner-info-drafts`
- `PATCH /ai/outputs/{ai_output_id}/review`
- `POST /ai/outputs/{ai_output_id}/publish`
- 신고 및 운영자 API

## 17. 설계상 보완 제안

1. `AiOutput.status`에는 비동기 처리를 위해 `REQUESTED`, `PROCESSING`을 추가하는 것이 좋다.
2. `Post` 목록 응답에는 `summary`, `thumbnail_url`, `figure_info` 일부를 denormalized 형태로 내려주는 것이 프론트 구현에 편하다.
3. 게시글 상세 API에서 모든 부가 정보를 항상 내려주면 응답이 무거워질 수 있으므로 `include` 파라미터로 제어한다.
4. 유사 게시글 추천은 MVP에서 저장하지 않고 실시간 계산으로 처리한다.
5. AI 답변은 항상 `AiOutputSource`를 함께 제공해 사용자 작성 콘텐츠와 AI 생성 콘텐츠를 명확히 구분한다.
6. 이미지 업로드는 게시글 작성 전 임시 업로드 후 `image_ids`로 연결하는 방식이 React 작성 폼에 적합하다.
7. 사용자는 URL을 별도 입력하지 않는다. 외부 링크 미리보기는 AI/MCP가 신뢰 가능한 사이트를 자동으로 찾은 경우에만 연결하며, 찾지 못한 경우에는 링크 영역을 노출하지 않는다.
