# Frontend Plan

> 목적: Arena frontend를 처음 구현할 때 작업 순서와 의사결정 기준을 고정한다.
> 전제: backend API는 Phase 14 문서 기준으로 준비되어 있고 frontend는 placeholder 상태다.

---

## 1. 제품 방향

Arena frontend는 YouTube 영상 기반 토론을 읽고, 작성하고, 검토하는 작업 화면이다. 랜딩 페이지가 아니라 게시판 제품 화면이 첫 진입점이어야 한다.

핵심 원칙:

- 사용자는 게시글과 댓글 흐름을 먼저 이해해야 한다.
- AI 결과는 보조 정보로 배치하고, 본문 토론보다 앞서지 않는다.
- RAG 결과는 "근거 후보" 또는 "관련 있을 수 있는 자막 구간"으로 표현한다.
- 영상 처리, AI 분석, RAG, Agent처럼 시간이 걸리는 기능은 상태를 명확히 보여준다.
- 관리자 기능은 별도 고도화 dashboard가 아니라 검토 작업 목록부터 작게 시작한다.

---

## 2. Phase 15 목표

Phase 15는 production frontend 전체 구현이 아니라 첫 구현을 위한 기반 phase다.

산출물:

1. frontend 문서 기준 정리
2. 화면 map과 권한 map
3. shadcn/ui 기반 디자인 방향
4. 정적 preview HTML
5. React 구현 시작 전 API client 설계

완료 기준:

- 신규 참여자가 어떤 화면부터 구현할지 알 수 있다.
- API 호출에서 auth/CSRF를 어디서 처리할지 알 수 있다.
- AI/RAG/Agent 상태를 UI에서 어떤 단어로 보여줄지 합의되어 있다.
- 첫 React 구현 대상이 게시글 목록/상세로 좁혀져 있다.

---

## 3. 구현 순서

### Step 1. Foundation

- route 구조 결정
- API client wrapper 생성
- auth session 저장 방식 결정
- 공통 layout shell 생성
- shadcn/ui 기본 컴포넌트 추가

권장 shadcn/ui 우선순위:

```text
button, input, textarea, badge, separator, skeleton,
dialog, sheet, tabs, dropdown-menu, toast
```

### Step 2. Read-only Board

- 게시글 목록 조회
- 검색어와 tag filter
- pagination
- 게시글 상세 조회
- YouTube/video 정보 영역
- 댓글 목록 read-only 표시

이 단계는 로그인 없이 가능한 흐름부터 완성한다.

### Step 3. Auth

- 회원가입
- 로그인
- access token 저장
- refresh/csrf 흐름
- 내 정보 조회
- 로그아웃

State-changing API는 auth client에서 `Authorization`과 `X-CSRF-Token`을 일관되게 붙인다.

### Step 4. Write Flows

- 게시글 작성
- 게시글 수정/삭제
- 댓글 작성/수정/삭제
- 대댓글 작성
- 좋아요

작성 성공 후 서버 비동기 처리 상태가 즉시 완료되지 않는다는 점을 toast와 상태 badge로 안내한다.

### Step 5. AI-assisted Debate

- 댓글 AI 분석 상태 표시
- FACT_CLAIM 댓글의 evidence count 표시
- evidence drawer/sheet 조회
- 댓글 스레드 요약 생성/조회
- Agent run 생성과 polling 조회

Agent는 사용자를 대신해 댓글을 쓰지 않는다. 답변 영역은 근거 후보와 한계를 함께 보여준다.

### Step 6. Admin

- `NEEDS_REVIEW` 댓글 목록
- moderation status filter
- 댓글 삭제
- 실패 분석 retry

관리자 화면은 운영형 table/list 중심으로 시작한다.

---

## 4. 권장 폴더 구조

```text
frontend/src/
  api/
    client.ts
    auth.ts
    posts.ts
    comments.ts
    videos.ts
    agent.ts
    admin.ts
  components/
    layout/
    posts/
    comments/
    video/
    ai/
    admin/
    ui/
  hooks/
  lib/
  routes/
  styles/
```

처음부터 상태 관리 library를 추가하지 않는다. React state와 custom hook으로 시작하고, auth/session이나 server cache가 복잡해질 때 TanStack Query 같은 도입을 검토한다.

---

## 5. 구현 원칙

- backend 문서의 response shape를 frontend type으로 먼저 옮긴다.
- write API는 CSRF 누락 가능성이 있으므로 fetch wrapper 밖에서 직접 호출하지 않는다.
- empty/loading/error 상태를 모든 목록 화면에 둔다.
- "AI가 판정했다"처럼 들리는 문구를 쓰지 않는다.
- 운영형 화면은 card mosaic보다 table/list/detail panel 중심으로 만든다.
- 모바일에서는 게시글 상세의 side panel을 sheet로 전환한다.

---

## 6. 첫 구현 티켓 후보

1. `frontend/src/api/client.ts`와 API type 초안 작성
2. `/posts` 목록 화면 구현
3. `/posts/:postId` 상세 read-only 화면 구현
4. 로그인/회원가입 dialog 또는 route 구현
5. 댓글 작성 form 연결

첫 PR은 1~3만 포함하는 편이 가장 안전하다.
