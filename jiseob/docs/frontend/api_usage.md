# API Usage

> 목적: frontend에서 Arena backend API를 호출할 때 auth, CSRF, error, polling을 일관되게 처리한다.

---

## 1. 기본 설정

기본 base URL:

```ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';
```

초기 `.env` 예시:

```env
VITE_API_BASE_URL=http://localhost:3000/api/v1
```

Backend cookie를 받기 위해 fetch는 기본적으로 credentials를 포함한다.

```ts
fetch(url, {
  credentials: 'include',
});
```

---

## 2. API client 책임

`src/api/client.ts`가 담당한다.

- base URL 조합
- JSON 직렬화
- `credentials: 'include'`
- Bearer access token header
- CSRF header
- HTTP error normalization
- `204 No Content` 처리

권장 interface:

```ts
type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  csrf?: boolean;
};
```

---

## 3. Auth 저장 방식

MVP frontend는 access token을 memory 우선으로 보관한다.

- 앱 새로고침 시 `/auth/refresh` 또는 `/users/me` 흐름으로 복구를 시도한다.
- refresh token은 httpOnly cookie이므로 JS에서 직접 읽지 않는다.
- CSRF token은 cookie 또는 `/auth/csrf` 응답 기준으로 동기화한다.

검토 사항:

- memory only: XSS 노출 면은 줄지만 새로고침 복구 로직 필요
- localStorage: 구현은 쉽지만 XSS 시 token 노출 위험 증가

초기 구현은 memory only를 권장한다.

---

## 4. CSRF 규칙

State-changing REST API는 다음 header가 필요하다.

```http
Authorization: Bearer <accessToken>
X-CSRF-Token: <csrfToken>
```

대상:

- POST/PATCH/DELETE auth REST API
- 게시글 작성/수정/삭제
- 댓글 작성/수정/삭제
- 좋아요/좋아요 취소
- 요약 생성
- Agent run 생성
- Admin 삭제/retry

예외:

- `GET` API
- `/api/v1/mcp`는 Bearer access token만 사용하고 CSRF guard를 적용하지 않는다.

---

## 5. Error normalization

Frontend에서는 HTTP status와 backend message를 다음 형태로 정리한다.

```ts
type ApiError = {
  status: number;
  message: string;
  code?: string;
};
```

표시 기준:

- `400`: 입력값 확인
- `401`: 로그인 필요
- `403`: 권한 없음 또는 CSRF 만료
- `404`: 삭제되었거나 존재하지 않음
- `409`: 현재 상태에서 수행 불가
- `503`: 서버 또는 DB 일시 오류

raw stack trace, provider raw error, token, cookie는 UI에 표시하지 않는다.

---

## 6. Module별 함수 초안

```text
auth.ts
  signup()
  login()
  refresh()
  logout()
  getCsrf()
  getMe()

posts.ts
  listPosts()
  getPost()
  createPost()
  updatePost()
  deletePost()
  incrementPostView()
  likePost()
  unlikePost()

comments.ts
  listComments()
  createComment()
  createReply()
  updateComment()
  deleteComment()
  getEvidences()
  createSummary()
  getSummary()

videos.ts
  getVideo()
  retryVideoProcessing()

agent.ts
  createAgentRun()
  getAgentRun()

admin.ts
  listAdminComments()
  deleteAdminComment()
  retryCommentAnalysis()
```

---

## 7. Polling 규칙

Polling 대상:

- video processing status
- Agent run
- comment summary
- AI/RAG 상태 refresh

초기 정책:

- optimistic UI보다 서버 상태 재조회 우선
- detail 화면에 머무는 동안만 polling
- tab/window가 hidden이면 polling 중지
- 90초 이상 완료되지 않으면 수동 새로고침 action 표시

---

## 8. Type 정의 위치

초기에는 API module 근처에 둔다.

```text
src/api/types.ts
```

type이 커지면 domain별로 분리한다.

```text
src/api/types/post.ts
src/api/types/comment.ts
src/api/types/video.ts
```

Backend DTO와 완전히 같다고 가정하지 않는다. Frontend는 화면에 필요한 view model을 별도로 만들 수 있다.
