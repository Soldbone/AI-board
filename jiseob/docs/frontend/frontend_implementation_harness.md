# Frontend Implementation Harness

> 목적: Arena frontend 구현 순서를 Codex 또는 사람이 순차적으로 적용할 수 있는 하네스로 고정한다.
> 기준 디자인: `frontend/preview.html`의 `Arena Neutral`
> 기준 문서: `frontend_plan.md`, `screen_map.md`, `api_usage.md`, `ui_states.md`, `design_system.md`

---

## 0. 공통 규칙

각 하네스는 이전 하네스가 완료된 상태에서 별도 작업 단위로 진행한다.

공통 구현 원칙:

- 실제 사용자 첫 화면은 게시글 목록이다. 랜딩/마케팅 hero를 만들지 않는다.
- 디자인은 `Arena Neutral` preset을 따른다.
- `components.json`의 `style: "radix-nova"`와 `baseColor: "neutral"` 설정은 변경하지 않는다.
- `frontend/preview.html`은 시안 비교용 산출물이며, React 구현은 `frontend/src` 안에서 진행한다.
- API 호출은 `api_usage.md`의 client wrapper 원칙을 따른다.
- AI/RAG/Agent는 사실 판정이 아니라 근거 후보와 한계를 보여주는 보조 layer로 표현한다.
- 하네스 완료마다 `pnpm.cmd --filter @arena/frontend typecheck`, `pnpm.cmd --filter @arena/frontend build`, `pnpm.cmd format:check`를 실행한다.

권장 브랜치/커밋 단위:

```text
feature/jiseob/phase16-frontend-foundation
→ Harness 1~2

feature/jiseob/phase17-frontend-readonly-board
→ Harness 3~4

feature/jiseob/phase18-frontend-auth-write
→ Harness 5~6

feature/jiseob/phase19-frontend-ai-admin
→ Harness 7~9
```

---

## Harness 1. UI Foundation

목표:

- Arena Neutral 기반 app shell과 route skeleton을 만든다.
- 실제 데이터 연결 없이 화면 구조와 공통 UI를 먼저 고정한다.

구현 범위:

- `frontend/src/App.tsx` placeholder를 제거한다.
- top navigation, content container, main/side responsive layout을 만든다.
- route는 최소한 다음 화면을 표현할 수 있게 준비한다.
  - `/`: 게시글 목록
  - `/posts/:postId`: 게시글 상세
  - `/login`
  - `/signup`
  - `/posts/new`
  - `/admin/comments`
- 아직 router library를 추가하지 않는다. 초기에는 React state 또는 URL path 분기로 시작한다.
- shadcn/ui 컴포넌트는 필요한 것만 추가한다.
  - 우선순위: `button`, `input`, `textarea`, `badge`, `separator`, `skeleton`

완료 기준:

- 모바일과 데스크톱에서 top navigation, list 영역, detail 영역, side panel placeholder가 깨지지 않는다.
- Auth, write, admin, agent는 placeholder로 표시되어도 된다.

Codex 요청 예시:

```text
docs/frontend 기준으로 Harness 1 UI Foundation을 구현해줘.
Arena Neutral 스타일을 따르고, 실제 API 연결은 아직 하지 마.
```

---

## Harness 2. API Client Foundation

목표:

- backend API 호출 방식을 한 곳으로 모은다.
- 이후 화면 구현자가 fetch 정책을 매번 결정하지 않게 한다.

구현 범위:

- `src/api/client.ts`를 만든다.
- `VITE_API_BASE_URL` 기본값은 `http://localhost:3000/api/v1`로 둔다.
- 모든 fetch는 `credentials: "include"`를 사용한다.
- `204 No Content` 응답을 안전하게 처리한다.
- error는 `{ status, message, code? }` 형태로 normalize한다.
- `src/api/types.ts`에 Phase 14 API 문서 기준 최소 response type을 둔다.
- domain API 파일을 만든다.
  - `auth.ts`
  - `posts.ts`
  - `comments.ts`
  - `videos.ts`
  - `agent.ts`
  - `admin.ts`

완료 기준:

- 아직 UI에서 모든 API를 쓰지 않아도 된다.
- 타입은 read-only board 구현에 필요한 수준부터 시작한다.
- write API는 함수만 준비하되 실제 화면 연결은 Harness 6에서 한다.

Codex 요청 예시:

```text
docs/frontend/api_usage.md 기준으로 Harness 2 API Client Foundation을 구현해줘.
아직 화면 동작은 게시글 read-only에 필요한 API만 연결 가능하면 돼.
```

---

## Harness 3. Posts Index Read-only

목표:

- 비회원도 볼 수 있는 게시글 목록 화면을 실제 API로 구현한다.

구현 범위:

- `/`에서 `GET /posts`를 호출한다.
- `GET /tags`를 호출해 tag filter를 표시한다.
- 검색어 `q`, tag, page, limit query를 UI state와 동기화한다.
- 목록 item에는 다음 정보를 표시한다.
  - title
  - contentPreview
  - author nickname
  - tags
  - commentCount, viewCount, likeCount
  - video processing summary
  - createdAt
- loading, empty, error 상태를 모두 구현한다.
- post item 클릭 시 `/posts/:postId` 화면으로 이동한다.

완료 기준:

- backend가 꺼져 있으면 error state가 보인다.
- item이 없으면 empty state가 보인다.
- 모바일에서 검색/filter/list item text가 겹치지 않는다.

Codex 요청 예시:

```text
Harness 3 Posts Index Read-only를 구현해줘.
API는 실제 backend /posts, /tags를 사용하고, loading/empty/error 상태를 모두 포함해줘.
```

---

## Harness 4. Post Detail Read-only

목표:

- 게시글 상세, video 상태, 댓글 thread를 읽기 전용으로 연결한다.

구현 범위:

- `/posts/:postId`에서 다음 API를 호출한다.
  - `GET /posts/:postId`
  - `POST /posts/:postId/views`
  - `GET /posts/:postId/comments`
  - `GET /videos/:videoId`
- 상세 화면은 desktop 2-column, mobile single-column로 구성한다.
- 댓글은 최대 2단계 thread로 표시한다.
- 댓글별 AI 분석 요약 badge를 표시한다.
- evidence 상세 조회 버튼은 비활성 또는 placeholder로 둔다.
- Agent, summary, admin 관련 UI는 placeholder로 유지한다.

완료 기준:

- 존재하지 않는 post는 not found state를 보여준다.
- video metadata/transcript/embedding 상태 badge가 보인다.
- 삭제 댓글 placeholder가 댓글 흐름을 깨지 않는다.

Codex 요청 예시:

```text
Harness 4 Post Detail Read-only를 구현해줘.
댓글 작성, evidence sheet, Agent 실행은 아직 연결하지 말고 읽기 화면만 완성해줘.
```

---

## Harness 5. Auth / Session

목표:

- 로그인 사용자 상태와 CSRF 준비 흐름을 만든다.

구현 범위:

- `/login`, `/signup` route를 실제 form으로 구현한다.
- login 성공 시 access token과 user를 memory state에 저장한다.
- 앱 초기화 시 refresh 또는 me 조회로 session 복구를 시도한다.
- logout을 연결한다.
- state-changing API 호출 전 CSRF token을 준비할 수 있는 helper를 만든다.

완료 기준:

- 비회원/로그인 사용자 navigation이 달라진다.
- 401이면 로그인 화면으로 유도한다.
- token, cookie, password hash를 UI에 노출하지 않는다.

Codex 요청 예시:

```text
Harness 5 Auth / Session을 구현해줘.
access token은 memory 우선으로 보관하고, refresh/csrf 정책은 docs/frontend/api_usage.md를 따라줘.
```

---

## Harness 6. Write Flows

목표:

- 로그인 사용자의 게시글, 댓글, 좋아요 작성 흐름을 연결한다.

구현 범위:

- 게시글 작성/수정/삭제
- 댓글 작성/수정/삭제
- 대댓글 작성
- 좋아요/좋아요 취소
- write 성공 후 관련 read API를 재조회한다.
- toast 또는 inline notice로 비동기 처리 상태를 안내한다.

완료 기준:

- CSRF 누락 없이 write API가 호출된다.
- 작성 성공 후 video/AI 처리가 즉시 끝나지 않아도 UI가 정상이다.
- 권한 실패는 403 안내로 표시된다.

Codex 요청 예시:

```text
Harness 6 Write Flows를 구현해줘.
게시글/댓글/좋아요 write API를 연결하되, AI/evidence/Agent 실행은 아직 다음 하네스로 남겨줘.
```

---

## Harness 7. Evidence / Summary

목표:

- 댓글 분석 결과와 RAG 근거 후보, 댓글 스레드 요약을 사용자에게 안전하게 보여준다.

구현 범위:

- FACT_CLAIM 댓글의 evidence count를 action으로 표시한다.
- `GET /comments/:commentId/evidences`를 sheet 또는 drawer로 연다.
- `POST /comments/:rootCommentId/summary`, `GET /comments/:rootCommentId/summary`를 연결한다.
- summary 생성 최소 댓글 수 10개 정책을 UI에 안내한다.
- stale summary 안내를 표시한다.

완료 기준:

- 근거 후보 문구는 "관련 있을 수 있는 자막 구간"으로 표현한다.
- 사실 여부 최종 판정처럼 보이는 copy를 쓰지 않는다.
- evidence 조회 실패와 no result 상태가 구분된다.

Codex 요청 예시:

```text
Harness 7 Evidence / Summary를 구현해줘.
RAG와 summary는 사실 판정이 아니라 근거 후보와 요약 보조 정보로 표현해줘.
```

---

## Harness 8. Agent Panel

목표:

- 게시글 상세 화면에서 Agent 질문과 polling 결과를 연결한다.

구현 범위:

- `POST /posts/:postId/agent/runs`로 질문을 생성한다.
- `GET /agent/runs/:runId`를 polling한다.
- `PENDING`, `RUNNING`, `SUCCESS`, `FAILED` 상태를 표시한다.
- answer, usedTools, evidenceCandidates, limitations를 분리해서 보여준다.

완료 기준:

- Agent는 사용자를 대신해 게시글이나 댓글을 작성하지 않는다.
- 90초 이상 완료되지 않으면 수동 재조회 action을 제공한다.
- limitations가 비어 있지 않으면 답변 아래에 표시한다.

Codex 요청 예시:

```text
Harness 8 Agent Panel을 구현해줘.
polling 기반으로 시작하고 SSE/WebSocket은 도입하지 마.
```

---

## Harness 9. Admin Comments

목표:

- 관리자 검토 작업 목록을 최소 운영 화면으로 구현한다.

구현 범위:

- `/admin/comments` route를 구현한다.
- `GET /admin/comments`를 연결한다.
- moderation status filter를 둔다.
- `DELETE /admin/comments/:commentId`를 연결한다.
- `POST /admin/comments/:commentId/analysis/retry`를 연결한다.
- 일반 사용자가 접근하면 403 state를 표시한다.

완료 기준:

- 관리자 화면은 dense list/table 중심이다.
- 삭제와 retry action은 성공 후 목록을 재조회한다.
- raw provider error, token, cookie를 노출하지 않는다.

Codex 요청 예시:

```text
Harness 9 Admin Comments를 구현해줘.
운영형 dense list/table 중심으로 만들고, admin delete/retry만 연결해줘.
```

---

## 최종 검증

모든 하네스 완료 후 실행한다.

```powershell
pnpm.cmd --filter @arena/frontend typecheck
pnpm.cmd --filter @arena/frontend build
pnpm.cmd format:check
```

브라우저 수동 검증:

- desktop 1440px, mobile 390px에서 horizontal overflow 없음
- 게시글 목록 검색/filter/page 동작
- 게시글 상세 read-only 동작
- 로그인/로그아웃/session 복구
- 댓글 작성과 대댓글 depth 제한 안내
- evidence sheet 문구와 상태 표현
- Agent polling 결과
- Admin 403, 목록, 삭제, retry

구현 중 판단이 필요한 경우:

- `frontend_plan.md`보다 이 문서를 우선한다.
- 이 문서가 다루지 않는 API shape는 `docs/api/backend_api.md`를 우선한다.
- UI 상태 문구는 `ui_states.md`를 우선한다.
