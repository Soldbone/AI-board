# Demo Scenarios

> 기준: Frontend Harness 9 및 demo seed 적용 상태
> 전제: demo seed의 댓글 본문은 실제 YouTube 댓글을 복사하지 않은 합성 데이터다.

---

## 0. 공통 준비

1. 서버 실행

```powershell
pnpm.cmd db:up
pnpm.cmd --filter @arena/backend migration:run
pnpm.cmd seed:demo
pnpm.cmd dev
```

Backend API만 확인할 때는 다음처럼 실행해도 된다.

```powershell
pnpm.cmd dev:backend
```

1. Demo seed는 `NODE_ENV=production`에서 실행을 거부한다.
2. Demo seed는 기존 테이블을 truncate하지 않고, demo 전용 계정/게시글/댓글 ID를 upsert한다.
3. HTTP client는 cookie jar를 유지한다.
4. 로그인 후 응답의 `accessToken`을 `Authorization: Bearer <accessToken>`으로 보낸다.
5. state-changing REST API에는 `arena_csrf_token` cookie 값을 `X-CSRF-Token` header로 보낸다.
6. 실제 provider key가 없는 환경에서는 provider 관련 흐름을 seed 상태 또는 E2E mock 검증 결과로 설명한다.

Demo 계정:

| 역할  | 이메일                     | 비밀번호      |
| ----- | -------------------------- | ------------- |
| Admin | `demo-admin@arena.local`   | `password123` |
| User  | `demo-minji@arena.local`   | `password123` |
| User  | `demo-jaehyun@arena.local` | `password123` |
| User  | `demo-sora@arena.local`    | `password123` |

Demo seed가 만드는 주제:

- 열차 좌석 등받이 예절
- 교실 월드컵 시청과 교사 색출 논란
- 노키즈존과 업장 자율
- 무인점포 사과 쪽지와 책임 교육
- 촉법소년 논란과 피해 회복

---

## 0-1. Frontend 데모 빠른 확인

```text
http://localhost:5173/
http://localhost:5173/login
http://localhost:5173/posts/:postId
http://localhost:5173/admin/comments?moderationStatus=NEEDS_REVIEW
```

확인 포인트:

- `/` 게시글 목록이 5개 demo 게시글과 태그, 댓글 수, 좋아요 수를 표시한다.
- 게시글 상세는 합성 댓글과 대댓글을 표시한다.
- 좌석 등받이 게시글에는 root 댓글 아래 대댓글 20개 이상이 있어 요약 UI와 긴 스레드를 확인할 수 있다.
- 일반 사용자 로그인 상태에서 댓글 작성/대댓글 작성 UI를 확인한다.
- 비로그인 상태의 `/admin/comments`는 인증 필요 상태를 표시한다.
- 일반 사용자 상태의 `/admin/comments`는 권한 없음 상태를 표시한다.
- Admin 상태의 `/admin/comments?moderationStatus=NEEDS_REVIEW`는 검토 필요 댓글, `FAILED` 분석 재시도 버튼, RAG 상태와 evidence count를 표시한다.
- 관리자 화면에는 token, cookie, raw provider error가 노출되지 않아야 한다.

수동 화면 QA:

- Desktop 1440px, mobile 390px에서 게시글 목록과 댓글 스레드가 가로 overflow 없이 표시되는지 확인한다.
- 긴 댓글과 버튼 텍스트가 서로 겹치지 않는지 확인한다.
- Admin 삭제 후 목록이 재조회되고, 게시글 상세에는 `관리자에 의해 삭제된 댓글입니다`가 표시되는지 확인한다.

---

## 0-2. Demo seed 재실행

Demo seed는 같은 명령을 다시 실행해도 동일 계정과 demo 게시글/댓글을 갱신한다.

```powershell
pnpm.cmd seed:demo
```

재실행 후 확인할 기본 기대값:

- Admin 계정과 일반 사용자 계정 비밀번호는 다시 `password123`으로 맞춰진다.
- Demo 댓글의 AI 분석 상태는 seed에 정의된 `SUCCESS`/`FAILED` 상태로 복원된다.
- Demo 게시글의 `commentCount`, `likeCount`는 현재 active 데이터 기준으로 다시 계산된다.

---

## 1. 회원가입 / 로그인 / 내 정보 조회

```http
POST /api/v1/auth/signup
```

```json
{
  "email": "user@example.com",
  "password": "password123",
  "nickname": "토론러"
}
```

```http
POST /api/v1/auth/login
GET /api/v1/users/me
```

확인 포인트:

- signup 응답에 `passwordHash`가 없다.
- login 응답은 `accessToken`과 public user만 포함한다.
- refresh token은 body가 아니라 cookie로 관리된다.

---

## 2. YouTube URL 게시글 작성

```http
POST /api/v1/posts
Authorization: Bearer <accessToken>
X-CSRF-Token: <csrf-token>
```

```json
{
  "title": "영상 속 주장에 대해 토론해봅시다",
  "content": "이 영상에서 언급된 수치와 맥락을 댓글로 검토해봅시다.",
  "youtubeUrl": "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  "tags": ["뉴스", "경제"]
}
```

확인 포인트:

- `201 Created`가 즉시 반환된다.
- `video.metadataStatus`, `video.transcriptStatus`, `video.embeddingStatus`는 처음 `PENDING`일 수 있다.
- 외부 API 실패는 게시글 생성 실패로 이어지지 않는다.

---

## 3. 영상 처리 상태 확인

```http
GET /api/v1/videos/:videoId
```

확인 포인트:

- metadata/transcript/embedding 상태가 독립적으로 표시된다.
- 실패 시 raw provider error 대신 정제된 `metadataErrorCode`, `transcriptErrorCode`, `embeddingErrorCode` 계열 값이 저장된다.
- transcript가 확정적으로 없으면 `transcriptStatus=NOT_AVAILABLE`로 볼 수 있다.

---

## 4. 댓글과 대댓글 작성

```http
POST /api/v1/posts/:postId/comments
```

```json
{
  "content": "이 영상은 2024년 통계를 근거로 설명하는 것 같습니다."
}
```

```http
POST /api/v1/comments/:commentId/replies
```

```json
{
  "content": "그 통계가 어느 구간에서 나오는지 궁금합니다."
}
```

확인 포인트:

- 댓글 작성 후 `analysis.aiAnalysisStatus`는 `PENDING`으로 시작한다.
- 대댓글의 대댓글 작성은 `400 Bad Request`다.
- 댓글 수는 `posts.commentCount`에 반영된다.

---

## 5. 사실 주장 댓글 작성 후 AI 분석 / RAG 상태 확인

사실 주장처럼 보이는 댓글을 작성한다.

```json
{
  "content": "영상에서는 2024년에 수치가 증가했다고 말합니다."
}
```

이후 댓글 목록 조회:

```http
GET /api/v1/posts/:postId/comments
```

확인 포인트:

- 분석이 성공하면 `commentType=FACT_CLAIM`일 수 있다.
- FACT_CLAIM만 RAG 검색 대상이다.
- RAG는 참/거짓 판정이 아니라 관련 있을 수 있는 자막 구간 후보를 찾는다.

---

## 6. 근거 후보 조회

```http
GET /api/v1/comments/:commentId/evidences
```

확인 포인트:

- 응답에는 `ragStatus`, `evidenceCount`, `evidences`가 포함된다.
- evidence item은 `evidenceText`, `similarityScore`, `startTime`, `endTime`을 가진다.
- 조회 API는 새 RAG 작업을 만들지 않는다.

---

## 7. 댓글 10개 이상 스레드 요약 생성 / 조회

루트 댓글 1개와 직계 대댓글 9개 이상을 준비한다.

```http
POST /api/v1/comments/:rootCommentId/summary
Authorization: Bearer <accessToken>
X-CSRF-Token: <csrf-token>
```

```http
GET /api/v1/comments/:rootCommentId/summary
```

확인 포인트:

- 10개 미만이면 `400 Bad Request`와 `요약할 댓글이 충분하지 않습니다.`가 반환된다.
- 생성 API는 `202 Accepted`로 시작할 수 있다.
- 이미 최신 SUCCESS 요약이 있으면 `200 OK`로 기존 요약을 반환한다.
- 비회원도 기존 요약 조회는 가능하다.

---

## 8. 검토 필요 댓글 admin 목록 조회

Demo seed에는 `NEEDS_REVIEW` 댓글이 미리 포함되어 있다.

Admin 계정:

```text
demo-admin@arena.local / password123
```

Admin으로 로그인 후:

```http
GET /api/v1/admin/comments?moderationStatus=NEEDS_REVIEW&page=1&limit=20
Authorization: Bearer <adminAccessToken>
```

확인 포인트:

- 일반 사용자는 `403 Forbidden`이다.
- admin GET은 read API라 CSRF 없이 가능하다.
- 목록 응답은 `{ items, meta }` shape다.
- 일부 댓글은 `commentType=TOXIC` 또는 `aiAnalysisStatus=FAILED` 상태로 표시된다.
- error message, token, cookie, raw provider error가 화면에 노출되지 않는지 확인한다.

---

## 9. admin 댓글 삭제

```http
DELETE /api/v1/admin/comments/:commentId
Authorization: Bearer <adminAccessToken>
X-CSRF-Token: <admin-csrf-token>
```

이후 댓글 목록 조회:

```http
GET /api/v1/posts/:postId/comments
```

확인 포인트:

- 삭제 성공은 `204 No Content`다.
- 댓글 목록에서는 `관리자에 의해 삭제된 댓글입니다`로 표시된다.
- 대댓글은 유지된다.

---

## 10. 실패한 AI 댓글 분석 retry

Demo seed의 admin 목록에는 `aiAnalysisStatus=FAILED` 댓글이 1개 포함되어 있다.

Admin retry:

```http
POST /api/v1/admin/comments/:commentId/analysis/retry
Authorization: Bearer <adminAccessToken>
X-CSRF-Token: <admin-csrf-token>
```

확인 포인트:

- `aiAnalysisStatus=FAILED` 상태에서만 `202 Accepted`다.
- 실패하지 않은 분석에 retry하면 `409 Conflict`다.
- retry 응답은 `accepted=true`, `aiAnalysisStatus=PENDING`을 반환한다.

---

## 11. Agent run 생성 / 조회

```http
POST /api/v1/posts/:postId/agent/runs
Authorization: Bearer <accessToken>
X-CSRF-Token: <csrf-token>
```

```json
{
  "question": "이 게시글의 핵심 주장과 관련된 자막 근거 후보를 찾아줘."
}
```

```http
GET /api/v1/agent/runs/:runId
Authorization: Bearer <accessToken>
```

확인 포인트:

- 생성 API는 `202 Accepted`와 `runId`를 반환한다.
- 조회 API는 run 생성자 본인만 가능하다.
- 응답에는 `answer`, `usedTools`, `evidenceCandidates`, `limitations`가 포함된다.
- Agent는 사용자를 대신해 게시글/댓글을 작성하지 않는다.
- Agent 답변은 근거 후보와 한계를 함께 설명해야 한다.
