# Backend API 문서

> 기준 코드: Phase 13 완료 backend
> 기본 prefix: `/api/v1`
> 목적: Arena MVP backend API의 인증, CSRF, 권한, 요청/응답 shape, 실패 정책을 빠르게 확인한다.

---

## 1. 공통 규칙

- 로그인 후 state-changing REST API는 `Authorization: Bearer <accessToken>`과 `X-CSRF-Token` header를 함께 보낸다.
- CSRF token은 `arena_csrf_token` cookie 값과 같은 값을 `X-CSRF-Token` header로 보낸다.
- refresh token은 httpOnly cookie로 관리되며 응답 body에 포함하지 않는다.
- MCP endpoint는 Agent tool boundary다. Bearer access token만 사용하고 CSRF guard를 적용하지 않는다.
- 응답 예시는 실제 shape를 설명하기 위한 축약본이다. `passwordHash`, refresh token, cookie 값, API key, raw provider error, stack trace는 응답 예시에 포함하지 않는다.
- AI/RAG 결과는 사실 여부의 최종 판정이 아니라 근거 후보와 처리 상태를 제공한다.

주요 실패 status:

```text
400 Bad Request      잘못된 입력 또는 정책 위반
401 Unauthorized     인증 없음 또는 유효하지 않은 인증
403 Forbidden        인증은 되었지만 권한 없음 또는 CSRF 실패
404 Not Found        리소스 없음, 삭제됨, 노출 불가
409 Conflict         중복 또는 현재 상태에서 허용되지 않는 요청
503 Service Unavailable  DB health check 실패
```

---

## 2. Health

### GET `/health`

- 인증: 불필요
- 성공: `200 OK`

```json
{
  "status": "ok",
  "service": "arena-api"
}
```

### GET `/health/db`

- 인증: 불필요
- 성공: `200 OK`
- 실패: DB query 실패 시 `503 Service Unavailable`

```json
{
  "status": "ok",
  "service": "arena-api",
  "database": {
    "status": "ok"
  }
}
```

---

## 3. Auth / Users

### POST `/auth/signup`

- 인증: 불필요
- body:

```json
{
  "email": "user@example.com",
  "password": "password123",
  "nickname": "arena-user"
}
```

- 성공: `201 Created`

```json
{
  "id": "01J00000000000000000000000",
  "email": "user@example.com",
  "nickname": "arena-user",
  "role": "USER",
  "createdAt": "2026-06-15T00:00:00.000Z",
  "updatedAt": "2026-06-15T00:00:00.000Z"
}
```

- 주요 실패: `400` validation 실패, `409` 이미 가입된 이메일
- 정책 메모: signup request는 role을 받지 않는다. 관리자 승격은 DB update로만 수행한다.

### POST `/auth/login`

- 인증: 불필요
- body:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

- 성공: `200 OK`

```json
{
  "accessToken": "<jwt-access-token>",
  "user": {
    "id": "01J00000000000000000000000",
    "email": "user@example.com",
    "nickname": "arena-user",
    "role": "USER",
    "createdAt": "2026-06-15T00:00:00.000Z",
    "updatedAt": "2026-06-15T00:00:00.000Z"
  }
}
```

- 주요 실패: `401` 이메일 또는 비밀번호 불일치
- 정책 메모: refresh token과 CSRF token은 cookie로 설정된다.

### POST `/auth/refresh`

- 인증: refresh token cookie 필요
- CSRF: `X-CSRF-Token` 필요
- 성공: `200 OK`

```json
{
  "accessToken": "<new-jwt-access-token>",
  "csrfToken": "<new-csrf-token>"
}
```

- 주요 실패: `401` refresh token 없음/만료/폐기, `403` CSRF 실패

### POST `/auth/logout`

- 인증: Bearer access token 필요
- CSRF: 필요
- 성공: `204 No Content`
- 주요 실패: `401`, `403`

### GET `/auth/csrf`

- 인증: refresh token cookie 필요
- 성공: `200 OK`

```json
{
  "csrfToken": "<csrf-token>"
}
```

### GET `/users/me`

- 인증: Bearer access token 필요
- CSRF: 불필요
- 성공: `200 OK`

```json
{
  "id": "01J00000000000000000000000",
  "email": "user@example.com",
  "nickname": "arena-user",
  "role": "USER",
  "createdAt": "2026-06-15T00:00:00.000Z",
  "updatedAt": "2026-06-15T00:00:00.000Z"
}
```

### DELETE `/users/me`

- 인증: Bearer access token 필요
- CSRF: 필요
- 성공: `204 No Content`
- 정책 메모: user는 soft delete되고 현재 auth session은 revoke된다. 기존 게시글/댓글 작성자는 조회 시 `탈퇴한 회원`으로 표시된다.

---

## 4. Posts / Tags / Videos

### GET `/posts`

- 인증: 불필요
- query: `page` 기본 1, `limit` 기본 20/최대 50, `q`, `tag`
- 성공: `200 OK`

```json
{
  "items": [
    {
      "id": "01J00000000000000000000010",
      "title": "토론 게시글",
      "contentPreview": "본문 미리보기",
      "youtubeUrl": "https://www.youtube.com/watch?v=jNQXAC9IVRw",
      "commentCount": 0,
      "viewCount": 0,
      "likeCount": 0,
      "author": {
        "id": "01J00000000000000000000000",
        "nickname": "arena-user"
      },
      "video": {
        "id": "01J00000000000000000000020",
        "youtubeVideoId": "jNQXAC9IVRw",
        "metadataStatus": "PENDING",
        "transcriptStatus": "PENDING",
        "embeddingStatus": "PENDING",
        "isProcessing": false
      },
      "tags": [{ "id": "01J00000000000000000000030", "name": "뉴스" }],
      "createdAt": "2026-06-15T00:00:00.000Z",
      "updatedAt": "2026-06-15T00:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### POST `/posts`

- 인증: Bearer access token 필요
- CSRF: 필요
- body:

```json
{
  "title": "토론 게시글",
  "content": "게시글 본문",
  "youtubeUrl": "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  "tags": ["뉴스", "경제"]
}
```

- 성공: `201 Created`, `PostResponse`
- 주요 실패: `400` validation 또는 YouTube URL parsing 실패, `401`, `403`
- 정책 메모: 게시글 생성은 YouTube/OpenAI 처리를 기다리지 않는다. 영상 처리 실패는 게시글 생성 실패로 이어지지 않고 video 상태값으로 남는다.

### GET `/posts/:postId`

- 인증: 불필요
- 성공: `200 OK`, 목록 item shape에 `content`가 추가된 `PostResponse`
- 주요 실패: `404`

### PATCH `/posts/:postId`

- 인증: Bearer access token 필요
- CSRF: 필요
- 권한: 게시글 작성자만 가능
- body:

```json
{
  "title": "수정된 제목",
  "content": "수정된 본문",
  "tags": ["뉴스"]
}
```

- 성공: `200 OK`, `PostResponse`
- 주요 실패: `400` 수정값 없음 또는 `youtubeUrl` 수정 시도, `403` 작성자 아님, `404`

### DELETE `/posts/:postId`

- 인증: Bearer access token 필요
- CSRF: 필요
- 권한: 게시글 작성자만 가능
- 성공: `204 No Content`

### POST `/posts/:postId/views`

- 인증: 불필요
- 성공: `200 OK`

```json
{
  "viewCount": 1
}
```

- 정책 메모: MVP에서는 중복 조회 방지 이벤트 테이블 없이 post counter를 직접 증가시킨다.

### POST `/posts/:postId/like`

- 인증: Bearer access token 필요
- CSRF: 필요
- 성공: `200 OK`

```json
{
  "likeCount": 1
}
```

- 주요 실패: `409` 이미 좋아요한 게시글

### DELETE `/posts/:postId/like`

- 인증: Bearer access token 필요
- CSRF: 필요
- 성공: `204 No Content`
- 정책 메모: 좋아요하지 않은 상태에서 취소해도 no-op이다.

### GET `/tags`

- 인증: 불필요
- 성공: `200 OK`

```json
[
  {
    "id": "01J00000000000000000000030",
    "name": "뉴스"
  }
]
```

### GET `/videos/:videoId`

- 인증: 불필요
- 성공: `200 OK`

```json
{
  "id": "01J00000000000000000000020",
  "youtubeVideoId": "jNQXAC9IVRw",
  "youtubeUrl": "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  "title": null,
  "channelName": null,
  "thumbnailUrl": null,
  "publishedAt": null,
  "description": null,
  "youtubeViewCount": null,
  "youtubeLikeCount": null,
  "youtubeCommentCount": null,
  "metadataStatus": "PENDING",
  "transcriptStatus": "PENDING",
  "embeddingStatus": "PENDING",
  "metadataErrorCode": null,
  "metadataErrorMessage": null,
  "transcriptErrorCode": null,
  "transcriptErrorMessage": null,
  "embeddingErrorCode": null,
  "embeddingErrorMessage": null,
  "processedAt": null,
  "isProcessing": false,
  "createdAt": "2026-06-15T00:00:00.000Z",
  "updatedAt": "2026-06-15T00:00:00.000Z"
}
```

### POST `/videos/:videoId/processing/retry`

- 인증: Bearer access token 필요
- CSRF: 필요
- 권한: 연결 게시글 작성자 또는 관리자
- 성공: `202 Accepted`

```json
{
  "videoId": "01J00000000000000000000020",
  "accepted": true
}
```

- 주요 실패: `403`, `404`, `409` 재시도 가능한 `FAILED` 상태가 없음
- 정책 메모: `NOT_AVAILABLE`은 자막 부재가 확정된 상태라 retry 조건에 포함하지 않는다.

---

## 5. Comments / Replies

### GET `/posts/:postId/comments`

- 인증: 불필요
- 성공: `200 OK`

```json
[
  {
    "id": "01J00000000000000000000040",
    "postId": "01J00000000000000000000010",
    "parentCommentId": null,
    "content": "댓글 내용",
    "moderationStatus": "NORMAL",
    "analysis": {
      "commentType": "FACT_CLAIM",
      "aiAnalysisStatus": "SUCCESS",
      "ragStatus": "SUCCESS",
      "evidenceCount": 2,
      "analyzedAt": "2026-06-15T00:00:01.000Z"
    },
    "isDeleted": false,
    "author": {
      "id": "01J00000000000000000000000",
      "nickname": "arena-user"
    },
    "replies": [],
    "createdAt": "2026-06-15T00:00:00.000Z",
    "updatedAt": "2026-06-15T00:00:00.000Z"
  }
]
```

- 정책 메모: 삭제된 댓글은 목록에 남고 원문 대신 `삭제된 댓글입니다` 또는 `관리자에 의해 삭제된 댓글입니다`를 반환한다. RAG 근거 상세는 포함하지 않는다.

### POST `/posts/:postId/comments`

- 인증: Bearer access token 필요
- CSRF: 필요
- body:

```json
{
  "content": "2024년 공식 통계가 이렇게 말합니다."
}
```

- 성공: `201 Created`, `CommentResponse`
- 정책 메모: 댓글 작성 직후 `CommentAnalysis`를 `PENDING`으로 만들고 AI 분석을 내부 비동기로 시도한다. AI 분석 실패는 댓글 작성 실패가 아니다.

### POST `/comments/:commentId/replies`

- 인증: Bearer access token 필요
- CSRF: 필요
- body:

```json
{
  "content": "대댓글 내용"
}
```

- 성공: `201 Created`, `CommentResponse`
- 주요 실패: `400` 대댓글에 다시 답글 작성 시도
- 정책 메모: 댓글 depth는 최대 2단계다.

### PATCH `/comments/:commentId`

- 인증: Bearer access token 필요
- CSRF: 필요
- 권한: 댓글 작성자만 가능
- body:

```json
{
  "content": "수정된 댓글 내용"
}
```

- 성공: `200 OK`, `CommentResponse`
- 정책 메모: 수정 후 기존 분석과 RAG 근거 후보는 최신 상태가 아니므로 재분석 대상으로 초기화한다.

### DELETE `/comments/:commentId`

- 인증: Bearer access token 필요
- CSRF: 필요
- 권한: 댓글 작성자만 가능
- 성공: `204 No Content`
- 정책 메모: 댓글은 soft delete되고 대댓글은 유지된다. `posts.commentCount`는 transaction 안에서 감소한다.

---

## 6. RAG Evidences

### GET `/comments/:commentId/evidences`

- 인증: 불필요
- 성공: `200 OK`

```json
{
  "commentId": "01J00000000000000000000040",
  "ragStatus": "SUCCESS",
  "evidenceCount": 2,
  "ragErrorCode": null,
  "ragErrorMessage": null,
  "evidences": [
    {
      "id": "01J00000000000000000000050",
      "transcriptChunkId": "01J00000000000000000000060",
      "evidenceText": "관련 있을 수 있는 자막 구간",
      "similarityScore": 0.84,
      "startTime": 12.3,
      "endTime": 20.1,
      "createdAt": "2026-06-15T00:00:02.000Z"
    }
  ]
}
```

- 주요 실패: `404` 댓글 또는 게시글 삭제/없음
- 정책 메모: 조회 API는 새 RAG 작업을 트리거하지 않는다. 저장된 근거 후보만 반환한다.

---

## 7. MCP JSON-RPC Endpoint

### POST `/mcp`

- 인증: Bearer access token 필요
- CSRF: 불필요
- 용도: 일반 사용자 공개 REST API가 아니라 Agent tool boundary
- 성공: `200 OK`, JSON-RPC response

`tools/list` request:

```json
{
  "jsonrpc": "2.0",
  "id": "list-1",
  "method": "tools/list"
}
```

`tools/list` response:

```json
{
  "jsonrpc": "2.0",
  "id": "list-1",
  "result": {
    "tools": [
      {
        "name": "post.getContext",
        "description": "게시글 본문, 태그, 영상 요약 상태, 카운터를 조회한다.",
        "readOnly": true,
        "annotations": {
          "readOnlyHint": true
        }
      }
    ]
  }
}
```

`tools/call` request:

```json
{
  "jsonrpc": "2.0",
  "id": "call-1",
  "method": "tools/call",
  "params": {
    "name": "transcript.searchChunks",
    "arguments": {
      "postId": "01J00000000000000000000010",
      "query": "이 주장이 영상에서 언급되나요?",
      "limit": 5
    }
  }
}
```

`tools/call` success response:

```json
{
  "jsonrpc": "2.0",
  "id": "call-1",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"postId\":\"01J00000000000000000000010\",\"chunks\":[]}"
      }
    ],
    "structuredContent": {
      "postId": "01J00000000000000000000010",
      "chunks": []
    },
    "isError": false
  }
}
```

등록 tool:

```text
post.getContext
video.getProcessingStatus
video.retryProcessing
transcript.searchChunks
youtube.fetchMetadata
```

정책 메모:

- protocol 오류는 JSON-RPC `error` envelope로 반환한다.
- provider/business failure는 `result.isError=true` tool result로 반환한다.
- `video.retryProcessing`은 write tool이며 작성자 또는 관리자 권한과 실패 상태 조건을 검증한다.
- tool argument와 response에는 API key, token, cookie, raw provider error, stack trace를 포함하지 않는다.

---

## 8. Agent Runs

### POST `/posts/:postId/agent/runs`

- 인증: Bearer access token 필요
- CSRF: 필요
- body:

```json
{
  "question": "이 게시글 주장과 관련된 영상 근거 후보를 찾아줘."
}
```

- 성공: `202 Accepted`

```json
{
  "runId": "01J00000000000000000000070",
  "postId": "01J00000000000000000000010",
  "status": "PENDING",
  "question": "이 게시글 주장과 관련된 영상 근거 후보를 찾아줘.",
  "createdAt": "2026-06-15T00:00:00.000Z"
}
```

- 정책 메모: Agent는 사용자를 대신해 게시글이나 댓글을 작성하지 않는다. 자동 allowlist는 read 중심 tool로 제한된다.

### GET `/agent/runs/:runId`

- 인증: Bearer access token 필요
- CSRF: 불필요
- 권한: run 생성자 본인만 가능
- 성공: `200 OK`

```json
{
  "runId": "01J00000000000000000000070",
  "postId": "01J00000000000000000000010",
  "status": "SUCCESS",
  "question": "이 게시글 주장과 관련된 영상 근거 후보를 찾아줘.",
  "answer": "검색된 자막 구간을 기준으로 설명합니다.",
  "usedTools": [
    {
      "stepIndex": 1,
      "toolName": "post.getContext",
      "status": "SUCCESS"
    }
  ],
  "evidenceCandidates": [
    {
      "chunkId": "01J00000000000000000000060",
      "startSec": 12.3,
      "endSec": 20.1,
      "text": "관련 있을 수 있는 자막 구간",
      "similarityScore": 0.84
    }
  ],
  "limitations": ["자막 검색 결과는 근거 후보이며 사실 여부의 최종 판정이 아닙니다."],
  "errorCode": null,
  "errorMessage": null,
  "stepCount": 2,
  "createdAt": "2026-06-15T00:00:00.000Z",
  "startedAt": "2026-06-15T00:00:01.000Z",
  "completedAt": "2026-06-15T00:00:05.000Z"
}
```

---

## 9. Comment Summaries

### POST `/comments/:rootCommentId/summary`

- 인증: Bearer access token 필요
- CSRF: 필요
- body: 없음
- 성공:
  - `202 Accepted`: 새 요약 생성, 실패 재시도, stale 갱신, 기존 PENDING 반환
  - `200 OK`: 최신 SUCCESS 요약이 이미 있어 provider 호출 없이 반환

```json
{
  "summaryId": "01J00000000000000000000080",
  "rootCommentId": "01J00000000000000000000040",
  "postId": "01J00000000000000000000010",
  "status": "PENDING",
  "summaryText": null,
  "summarizedCommentCount": 10,
  "currentCommentCount": 10,
  "isStale": false,
  "errorCode": null,
  "errorMessage": null,
  "createdAt": "2026-06-15T00:00:00.000Z",
  "updatedAt": "2026-06-15T00:00:00.000Z",
  "generatedAt": null
}
```

- 주요 실패: `400` 삭제되지 않은 루트 댓글과 직계 대댓글 수가 10개 미만, `404`
- 정책 메모: 삭제된 댓글은 요약 입력에서 제외한다.

### GET `/comments/:rootCommentId/summary`

- 인증: 불필요
- 성공: `200 OK`, `SummaryResponse`
- 주요 실패: `404` 요약 없음, 루트 댓글 아님, 댓글/게시글 삭제
- 정책 메모: 비회원도 이미 생성된 요약은 조회할 수 있다.

---

## 10. Admin Comments

관리자 계정은 public API로 생성하지 않는다. 로컬/데모 환경에서는 DB에서 role을 변경한다.

```sql
UPDATE users
SET role = 'ADMIN'
WHERE email = 'admin@example.com'
  AND deleted_at IS NULL;
```

### GET `/admin/comments`

- 인증: Bearer access token 필요
- CSRF: 불필요
- 권한: `ADMIN`
- query: `moderationStatus=NEEDS_REVIEW`, `page` 기본 1, `limit` 기본 20/최대 50
- 성공: `200 OK`

```json
{
  "items": [
    {
      "id": "01J00000000000000000000040",
      "postId": "01J00000000000000000000010",
      "parentCommentId": null,
      "content": "검토가 필요한 댓글",
      "moderationStatus": "NEEDS_REVIEW",
      "author": {
        "id": "01J00000000000000000000000",
        "nickname": "arena-user"
      },
      "analysis": {
        "commentType": "TOXIC",
        "aiAnalysisStatus": "SUCCESS",
        "ragStatus": "NOT_REQUIRED",
        "evidenceCount": 0,
        "errorCode": null,
        "errorMessage": null,
        "analyzedAt": "2026-06-15T00:00:01.000Z"
      },
      "createdAt": "2026-06-15T00:00:00.000Z",
      "updatedAt": "2026-06-15T00:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### DELETE `/admin/comments/:commentId`

- 인증: Bearer access token 필요
- CSRF: 필요
- 권한: `ADMIN`
- 성공: `204 No Content`
- 정책 메모: 관리자 삭제는 `moderationStatus=DELETED_BY_ADMIN`으로 구분한다.

### POST `/admin/comments/:commentId/analysis/retry`

- 인증: Bearer access token 필요
- CSRF: 필요
- 권한: `ADMIN`
- 성공: `202 Accepted`

```json
{
  "commentId": "01J00000000000000000000040",
  "accepted": true,
  "aiAnalysisStatus": "PENDING"
}
```

- 주요 실패: `404` 댓글/게시글/analysis 없음, `409` `aiAnalysisStatus`가 `FAILED`가 아님
- 정책 메모: 재시도는 실패한 AI 댓글 분석에만 허용된다.
