# Demo Scenarios

> 기준: Phase 13 완료 backend API
> 전제: frontend는 placeholder이므로 HTTP client 또는 E2E mock 흐름 기준으로 시연한다.

---

## 0. 공통 준비

1. 서버 실행

```powershell
pnpm.cmd db:up
pnpm.cmd --filter @arena/backend migration:run
pnpm.cmd dev:backend
```

1. HTTP client는 cookie jar를 유지한다.
2. 로그인 후 응답의 `accessToken`을 `Authorization: Bearer <accessToken>`으로 보낸다.
3. state-changing REST API에는 `arena_csrf_token` cookie 값을 `X-CSRF-Token` header로 보낸다.
4. 실제 provider key가 없는 환경에서는 provider 관련 흐름을 E2E mock 검증 결과로 설명한다.

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

## 8. toxic 댓글 작성 후 admin 목록 조회

E2E mock 환경에서는 `toxic` 또는 `바보`가 포함된 댓글이 `NEEDS_REVIEW`로 분류된다.

```json
{
  "content": "toxic 검토 대상 댓글"
}
```

Admin 계정 준비:

```sql
UPDATE users
SET role = 'ADMIN'
WHERE email = 'admin@example.com'
  AND deleted_at IS NULL;
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

E2E mock 환경에서는 `fail-analysis`가 포함된 댓글이 분석 실패로 처리된다.

```json
{
  "content": "fail-analysis 이 댓글은 분석 실패를 시연합니다."
}
```

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
