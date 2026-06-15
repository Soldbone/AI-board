# API 명세서

## 1. 문서 목적

이 문서는 프론트엔드와 백엔드가 주고받는 API의 목적, 요청값, 응답값, 인증 여부를 정리합니다.

## 2. 공통 규칙

### Base URL

```text
http://127.0.0.1:8000
```

### 인증 방식

로그인이 필요한 API는 HTTP Header에 JWT 토큰을 전달합니다.

```text
Authorization: Bearer {access_token}
```

### 공통 오류

| 상태 코드 | 의미 |
| --- | --- |
| 400 | 잘못된 요청 |
| 401 | 인증 필요 또는 토큰 오류 |
| 403 | 권한 없음 |
| 404 | 리소스 없음 |
| 422 | 요청 데이터 검증 실패 |
| 500 | 서버 내부 오류 |
| 503 | 외부 AI/MCP 처리 실패 |

## 3. Auth API

### 회원가입

```http
POST /auth/signup
```

인증: 불필요

Request:

```json
{
  "email": "hyeok@example.com",
  "nickname": "hyeok",
  "password": "12345678"
}
```

Response:

```json
{
  "id": 1,
  "email": "hyeok@example.com",
  "nickname": "hyeok",
  "bio": null,
  "created_at": "2026-06-15T00:00:00",
  "updated_at": "2026-06-15T00:00:00"
}
```

### 로그인

```http
POST /auth/login
```

인증: 불필요

Request:

```json
{
  "email": "hyeok@example.com",
  "password": "12345678"
}
```

Response:

```json
{
  "access_token": "jwt-token",
  "token_type": "bearer"
}
```

### 내 정보 조회

```http
GET /auth/me
```

인증: 필요

Response: `UserRead`

## 4. User API

### 내 정보 수정

```http
PATCH /users/me
```

인증: 필요

Request:

```json
{
  "nickname": "new_nickname",
  "bio": "소개글입니다."
}
```

Response: `UserRead`

## 5. Post API

### 게시글 작성

```http
POST /posts
```

인증: 필요

Request:

```json
{
  "title": "진샤이 어때요?",
  "content": "진샤이 가보신 분 후기 궁금해요.",
  "region": "용인 처인구",
  "store_name": "진샤이",
  "category": "중식>중식당",
  "tag_names": ["중식", "중국집", "맛집"]
}
```

Response: `PostRead`

### 게시글 목록 조회

```http
GET /posts?page=1&size=10&keyword=카페&tag=카페&sort=latest
```

인증: 불필요

Query:

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| page | 선택 | 페이지 번호, 기본값 1 |
| size | 선택 | 페이지 크기, 기본값 10 |
| keyword | 선택 | 제목/본문/태그 검색어 |
| tag | 선택 | 태그 필터 |
| sort | 선택 | latest, views, comments |

Response:

```json
{
  "items": [],
  "total_count": 0,
  "page": 1,
  "size": 10,
  "total_pages": 0
}
```

### 게시글 상세 조회

```http
GET /posts/{post_id}
```

인증: 불필요

Response: `PostRead`

### 게시글 수정

```http
PATCH /posts/{post_id}
```

인증: 필요, 작성자만 가능

Request:

```json
{
  "title": "수정된 제목",
  "content": "수정된 본문",
  "region": "사당역",
  "store_name": "탐앤탐스커피 사당역점",
  "category": "카페",
  "tag_names": ["카페", "사당역"]
}
```

Response: `PostRead`

### 게시글 삭제

```http
DELETE /posts/{post_id}
```

인증: 필요, 작성자만 가능

Response:

```text
204 No Content
```

## 6. Comment API

### 댓글 작성

```http
POST /posts/{post_id}/comments
```

인증: 필요

Request:

```json
{
  "content": "직원이 친절하고 위치도 괜찮았어요.",
  "is_anonymous": false,
  "parent_id": null
}
```

Response: `CommentRead`

### 댓글 목록 조회

```http
GET /posts/{post_id}/comments
```

인증: 불필요

Response:

```json
[
  {
    "id": 1,
    "post_id": 1,
    "author_id": 1,
    "author_nickname": "hyeok",
    "parent_id": null,
    "content": "댓글 내용",
    "is_anonymous": false,
    "is_deleted": false,
    "created_at": "2026-06-15T00:00:00",
    "updated_at": "2026-06-15T00:00:00"
  }
]
```

### 댓글 수정

```http
PATCH /comments/{comment_id}
```

인증: 필요, 작성자만 가능

Request:

```json
{
  "content": "수정된 댓글"
}
```

### 댓글 삭제

```http
DELETE /comments/{comment_id}
```

인증: 필요, 작성자만 가능

Response:

```text
204 No Content
```

## 7. Tag API

### 태그 목록 조회

```http
GET /tags
```

인증: 불필요

### 인기 태그 조회

```http
GET /tags/suggestions?limit=10
```

인증: 불필요

## 8. AI / RAG API

### 비슷한 게시글 추천

```http
POST /ai/similar-posts
```

인증: 불필요

Request:

```json
{
  "title": "갑짬뽕 처인구점 어때요?",
  "content": "처음 가보려는데 괜찮을까요?",
  "store_name": "갑짬뽕 처인구점",
  "tag_names": ["용인 처인구", "중식", "중식당"],
  "limit": 5,
  "exclude_post_id": 1
}
```

핵심 규칙:

- `store_name`이 있으면 같은 가게명이 포함된 글만 추천 후보로 사용합니다.
- `kiwipiepy` 기반 명사 추출로 불용어를 줄입니다.

Response:

```json
{
  "items": [
    {
      "id": 2,
      "title": "갑짬뽕 처인구점 후기 궁금해요",
      "content_preview": "처인구에서 중식 정보를 찾다가...",
      "region": "용인 처인구",
      "store_name": "갑짬뽕 처인구점",
      "category": "중식>중식당",
      "score": 12,
      "matched_keywords": ["갑짬뽕", "처인구", "중식"],
      "matched_fields": ["제목", "가게명", "분류"],
      "created_at": "2026-06-15T00:00:00"
    }
  ]
}
```

### AI 태그 추천

```http
POST /ai/tag-suggestions
```

인증: 불필요

Request:

```json
{
  "title": "사당역 조용한 카페 추천",
  "content": "공부하기 좋은 카페 찾습니다.",
  "limit": 5
}
```

## 9. Agent API

### AI 장소 추천

```http
POST /agent/place-recommendation
```

인증: 불필요

Request:

```json
{
  "region": "용인 처인구",
  "title": "갑짬뽕 처인구점 어때요?",
  "content": "처음 가보려는데 괜찮을까요?",
  "keyword": "갑짬뽕 처인구점",
  "display": 3
}
```

Response:

```json
{
  "answer": "DB 기반 평가 요약 문장",
  "used_mcp": true,
  "query": "용인 처인구 갑짬뽕 처인구점",
  "places": [],
  "local_review_summary": "DB 기반 평가...",
  "fallback_map_url": "https://map.naver.com/p/search/...",
  "reasoning_summary": "LangChain Agent가 RAG 참고 글과 MCP 장소 검색 도구를 함께 사용했습니다.",
  "tool_status": "agent_mcp_success"
}
```

## 10. MCP 관련 백엔드 API

### 장소 검색

```http
POST /ai/place-search
```

Request:

```json
{
  "region": "사당역",
  "keyword": "카페",
  "display": 5
}
```

Response:

```json
{
  "status": "success",
  "query": "사당역 카페",
  "display": 5,
  "total": 100,
  "places": [],
  "fallback_map_url": "https://map.naver.com/p/search/..."
}
```
