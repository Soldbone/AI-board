# Screen Map

> 목적: Arena frontend의 route, 권한, 주요 정보, 주요 action을 한눈에 정리한다.

---

## 1. Route 초안

| Route                 | 이름             | 접근   | 목적                                |
| --------------------- | ---------------- | ------ | ----------------------------------- |
| `/`                   | 게시글 목록      | 공개   | 최신 토론 탐색, 검색, tag filter    |
| `/posts/:postId`      | 게시글 상세      | 공개   | 영상, 본문, 댓글, AI 보조 정보 확인 |
| `/posts/new`          | 게시글 작성      | 로그인 | YouTube URL 기반 게시글 작성        |
| `/posts/:postId/edit` | 게시글 수정      | 작성자 | 제목, 본문, tag 수정                |
| `/login`              | 로그인           | 비회원 | access token과 csrf 준비            |
| `/signup`             | 회원가입         | 비회원 | 사용자 생성                         |
| `/me`                 | 내 정보          | 로그인 | 계정 정보, 회원탈퇴 진입            |
| `/admin/comments`     | 관리자 댓글 검토 | 관리자 | NEEDS_REVIEW 댓글 처리              |

초기 구현에서는 `/login`, `/signup`을 독립 route로 두고, 이후 modal 전환을 검토한다.

---

## 2. 게시글 목록

API:

```http
GET /api/v1/posts?page=&limit=&q=&tag=&sort=
GET /api/v1/tags
```

주요 UI:

- 상단 navigation
- 검색 input
- tag filter
- 정렬 filter: 최신순, 댓글순, 좋아요순, 조회순
- 게시글 list
- pagination
- empty state

게시글 list item 정보:

- 제목
- 본문 preview
- 작성자 nickname
- tag
- 댓글 수, 조회 수, 좋아요 수
- 로그인 사용자의 좋아요 여부
- video 처리 상태 badge
- 생성일

---

## 3. 게시글 상세

API:

```http
GET /api/v1/posts/:postId
POST /api/v1/posts/:postId/views
GET /api/v1/posts/:postId/comments
GET /api/v1/videos/:videoId
```

주요 UI:

- 제목/작성자/시간/tag
- YouTube video card
- video metadata/transcript/embedding 상태
- 본문
- 댓글 thread
- evidence sheet
- Agent panel

Desktop layout:

```text
main column: video + post + comments
right panel: processing status + agent + thread summary
```

Mobile layout:

```text
single column
agent/evidence/status는 sheet 또는 collapsible panel
```

---

## 4. 인증 화면

API:

```http
POST /api/v1/auth/signup
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET /api/v1/auth/csrf
GET /api/v1/users/me
```

로그인 성공 시:

- `accessToken` 저장
- user 저장
- csrf token은 cookie 또는 `/auth/csrf` 응답 기준으로 동기화
- 이전 진입 경로로 이동

주의:

- refresh token은 httpOnly cookie라 JS에서 직접 읽지 않는다.
- state-changing API 호출 전 csrf token을 준비한다.

---

## 5. 작성 화면

API:

```http
POST /api/v1/posts
PATCH /api/v1/posts/:postId
DELETE /api/v1/posts/:postId
```

Form field:

- title
- youtubeUrl
- content
- tags

정책:

- `youtubeUrl`은 생성 시에만 받는다.
- 생성 성공 후 video 처리는 비동기이므로 `PENDING` 상태가 정상이다.
- YouTube provider 실패는 게시글 작성 실패가 아니다.

---

## 6. 댓글 Thread

API:

```http
GET /api/v1/posts/:postId/comments
POST /api/v1/posts/:postId/comments
POST /api/v1/comments/:commentId/replies
PATCH /api/v1/comments/:commentId
DELETE /api/v1/comments/:commentId
```

표현 규칙:

- root comment와 reply는 최대 2단계로만 보여준다.
- 삭제 댓글은 placeholder text를 그대로 보여준다.
- 댓글별 AI 상태 요약을 작게 붙인다.
- evidence 상세는 댓글 list에 직접 펼치지 않고 sheet/drawer에서 조회한다.

---

## 7. Evidence Sheet

API:

```http
GET /api/v1/comments/:commentId/evidences
```

표시 정보:

- ragStatus
- evidenceCount
- transcript 구간
- similarity score
- startTime/endTime

용어:

- "근거 후보"
- "관련 있을 수 있는 자막 구간"
- "최종 사실 판정은 아닙니다"

금지:

- "AI가 참으로 확인"
- "검증 완료"
- "팩트 체크 완료"

---

## 8. Agent Panel

API:

```http
POST /api/v1/posts/:postId/agent/runs
GET /api/v1/agent/runs/:runId
```

동작:

- 사용자가 질문 입력
- run 생성 후 polling
- `PENDING`/`RUNNING`/`SUCCESS`/`FAILED` 상태 표시
- answer, usedTools, evidenceCandidates, limitations 표시

MVP에서는 SSE/WebSocket을 사용하지 않는다.

---

## 9. Admin Comments

API:

```http
GET /api/v1/admin/comments
DELETE /api/v1/admin/comments/:commentId
POST /api/v1/admin/comments/:commentId/analysis/retry
```

주요 UI:

- moderation status filter
- 검토 댓글 list/table
- 작성자, 게시글, 댓글 내용
- AI 분석 type/status
- 삭제 action
- retry action

권한:

- `ADMIN`만 접근
- 접근 실패 시 일반 403 화면을 보여준다.
