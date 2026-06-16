# Phase 11. 댓글 스레드 요약 구현 계획

> 기준 단계: `arena_implementation_plan.md`의 Phase 11  
> 선행 단계: Phase 10 `AI Agent 추론 루프 구현`, Phase 10.1 `LangChain Agent LLM Adapter 전환`  
> 목표: 루트 댓글 스레드가 충분히 길 때 사용자가 AI 요약을 요청하고, 누구나 최신 요약을 조회할 수 있게 한다.

---

## 0. Phase 11 구현 하네스

이 문서는 Phase 11 구현자가 `AGENTS.md`와 이 문서만 읽고 바로 작업을 시작할 수 있게 하기 위한 handoff 문서다. Phase 1~10.1 문서는 세부 배경이 필요할 때만 참고한다.

### 현재 기준 상태

- Phase 10.1까지 완료된 상태에서 시작한다.
- `CommentsModule`은 루트 댓글과 대댓글을 최대 2단계로 관리한다.
- `comments.parent_comment_id IS NULL`이면 루트 댓글이고, 값이 있으면 대댓글이다.
- 댓글/대댓글 생성과 삭제는 `posts.comment_count`를 transaction 안에서 증감한다.
- 삭제된 댓글은 soft delete되며 사용자 조회에서는 placeholder로 표시된다.
- `AiModule`에는 댓글 분석과 RAG가 있고, summary 하위 디렉터리는 아직 없다.
- 공통 enum `SummaryStatus`, `SummaryTargetType`은 이미 `backend/src/common/enums/ai-status.enum.ts`에 있다.
- Phase 10에서 `AgentModule`은 별도 모듈로 추가되어 있으며, Phase 11 summary는 AgentModule에 의존하지 않는다.
- Phase 10.1에서 backend package에 LangChain dependency가 추가되어 있지만, Phase 11 summary는 Agent LLM provider를 재사용하지 않는다.
- `OpenAiAgentLlmProvider`는 LangChain adapter지만, Summary provider는 이 문서 기준으로 독립 provider로 구현한다.

### 먼저 볼 코드

Phase 11 구현 전에는 아래 파일만 먼저 읽으면 된다. `AgentModule` 내부 코드는 Summary가 의존하지 않으므로 기본 탐색 대상에서 제외한다.

```text
backend/src/app.module.ts
backend/src/ai/ai.module.ts
backend/src/ai/comment-analysis/openai-comment-analyzer.provider.ts
backend/src/ai/rag/rag.controller.ts
backend/src/comments/comments.controller.ts
backend/src/comments/comments.service.ts
backend/src/comments/entities/comment.entity.ts
backend/src/common/entities/base.entity.ts
backend/src/common/enums/ai-status.enum.ts
backend/src/common/guards/jwt-auth.guard.ts
backend/src/common/guards/csrf.guard.ts
backend/src/database/migrations/2026061500000-CreateAgentRuns.ts
backend/src/database/migrations/2026061402000-CreateRagEvidences.ts
```

### 새로 만들 구조

Phase 11은 `backend/src/ai/summary` 디렉터리를 새로 만든다.

```text
backend/src/ai/summary/
  summary.controller.ts
  summary.service.ts
  summary.provider.ts
  openai-summary.provider.ts
  entities/ai-summary.entity.ts
```

DB migration은 다음 순서 번호로 추가한다.

```text
backend/src/database/migrations/2026061501000-CreateAiSummaries.ts
```

`AiModule`에는 `SummaryController`, `SummaryService`, `SummaryProvider`, `AiSummary` entity를 등록한다. 별도 `SummaryModule`은 만들지 않는다.

### Phase 11에서 구현할 API

```http
POST /api/v1/comments/:rootCommentId/summary
GET  /api/v1/comments/:rootCommentId/summary
```

- 생성 API는 `JwtAuthGuard + CsrfGuard`를 적용하고 `202 Accepted`를 반환한다.
- 조회 API는 guard를 적용하지 않는다. 비회원도 이미 생성된 요약을 조회할 수 있다.
- `rootCommentId`는 반드시 삭제되지 않은 최상위 댓글이어야 한다.
- body는 MVP에서 받지 않는다. 나중에 요약 스타일 옵션이 필요하면 별도 DTO로 추가한다.

### Phase 11의 고정 설계 결정

- 요약 대상은 루트 댓글 1개와 그 대댓글들이다.
- 삭제된 루트 댓글은 조회/생성 모두 `404`로 처리한다.
- 삭제된 대댓글은 요약 대상 댓글 수와 LLM 입력에서 제외한다.
- 요약 생성 최소 조건은 삭제되지 않은 루트 댓글 포함 active 댓글 10개 이상이다.
- 댓글 수가 10개 미만이면 `400 Bad Request`와 “요약할 댓글이 충분하지 않습니다.” 메시지를 반환한다.
- 요약은 자동 생성하지 않는다. 로그인 사용자가 생성 API를 호출할 때만 생성한다.
- 요약 생성 이후 새 댓글이 추가되거나 마지막 active 댓글이 바뀌면 조회 응답에서 `isStale=true`로 계산한다.
- Phase 11 MVP는 루트 댓글 스레드당 최신 요약 1개만 유지한다. 요약 이력 테이블은 만들지 않는다.
- 이미 최신 `SUCCESS` 요약이 있으면 생성 API를 다시 호출해도 provider를 호출하지 않고 기존 요약을 반환한다.
- stale `SUCCESS` 요약이 있으면 전체 댓글을 다시 요약하지 않고 기존 요약과 새 댓글만 provider 입력으로 사용해 같은 row를 갱신한다.
- 성공한 기존 요약이 없으면 루트 댓글 스레드 전체를 최초 요약 대상으로 사용한다.
- LLM 요약 입력은 최대 700자로 제한한다. 최초 요약은 active 댓글 본문 합계, stale 갱신은 기존 `summaryText`와 새 댓글 본문 합계를 기준으로 한다.
- 입력이 700자를 초과하면 provider를 호출하지 않고 `400 Bad Request`와 “요약 가능한 댓글 길이를 초과했습니다.” 메시지를 반환한다.
- 실제 런타임에서 mock summary 성공 fallback을 만들지 않는다. 테스트에서만 provider를 mock한다.
- OpenAI API key가 없거나 summary provider가 실패하면 summary row는 `FAILED`가 된다.
- 서버 내부 비동기 실행은 MVP 한계로 인정한다. Redis/BullMQ는 도입하지 않는다.
- Phase 11에서는 streaming, SSE, WebSocket, cancellation, frontend UI를 만들지 않는다.

---

## 1. 제품상 역할

댓글 스레드 요약은 토론을 대체하지 않는다. 사용자가 긴 댓글 흐름을 빠르게 파악하도록 돕는 보조 정보다.

요약이 해야 하는 것:

- 루트 댓글과 대댓글들의 주요 쟁점과 반복되는 의견을 짧게 정리한다.
- 서로 다른 입장이 있으면 분리해서 보여준다.
- 확인되지 않은 사실 주장에는 단정 표현을 피한다.
- 삭제된 댓글은 요약하지 않는다.

요약이 하지 않는 것:

- AI가 댓글의 참/거짓을 판정하지 않는다.
- 사용자 대신 댓글을 작성하지 않는다.
- 삭제된 댓글 내용을 복원하거나 추측하지 않는다.
- API key, token, provider raw error, stack trace를 응답이나 DB에 저장하지 않는다.

---

## 2. API 설계

### 요약 생성 요청

```http
POST /api/v1/comments/:rootCommentId/summary
```

인증:

- 로그인 사용자만 생성 가능하다.
- 사용자 화면의 state-changing REST API이므로 `JwtAuthGuard + CsrfGuard`를 적용한다.

요청 body:

```json
{}
```

생성 응답:

```json
{
  "summaryId": "01J00000000000000000000000",
  "rootCommentId": "01J00000000000000000000001",
  "postId": "01J00000000000000000000002",
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

권장 HTTP status:

```http
202 Accepted
```

생성 API는 LLM 호출을 기다리지 않는다. 새 요약 또는 stale 갱신이 필요하면 row를 `PENDING`으로 저장하거나 갱신하고 서버 내부 비동기 작업으로 요약 생성을 시작한다. 이미 최신 `SUCCESS` 요약이 있으면 provider를 호출하지 않고 기존 요약을 반환하며, 이 경우 `200 OK`를 반환해도 된다.

### 요약 조회

```http
GET /api/v1/comments/:rootCommentId/summary
```

조회 권한:

- 비회원도 조회 가능하다.
- 단, 루트 댓글 또는 게시글이 삭제되어 노출 불가하면 `404`다.

조회 응답:

```json
{
  "summaryId": "01J00000000000000000000000",
  "rootCommentId": "01J00000000000000000000001",
  "postId": "01J00000000000000000000002",
  "status": "SUCCESS",
  "summaryText": "이 스레드는 영상의 특정 발언이 실제로 있었는지와 그 해석을 중심으로 논의합니다...",
  "summarizedCommentCount": 10,
  "currentCommentCount": 12,
  "isStale": true,
  "errorCode": null,
  "errorMessage": null,
  "createdAt": "2026-06-15T00:00:00.000Z",
  "updatedAt": "2026-06-15T00:00:08.000Z",
  "generatedAt": "2026-06-15T00:00:08.000Z"
}
```

요약 row가 없으면 `404 Not Found`로 처리한다.

---

## 3. 데이터 모델

### `ai_summaries`

필드:

```text
id char(26) primary key
targetType varchar(30) not null default 'COMMENT_THREAD'
postId char(26) not null
rootCommentId char(26) not null
createdById char(26) null
summaryText text null
summaryStatus varchar(20) not null default 'PENDING'
summarizedCommentCount integer not null default 0
lastCommentId char(26) null
errorCode varchar(80) null
errorMessage text null
generatedAt timestamptz null
createdAt timestamptz not null
updatedAt timestamptz not null
deletedAt timestamptz null
```

관계:

- `AiSummary -> Post`
- `AiSummary -> root Comment`
- `AiSummary -> createdBy User`

인덱스:

- `postId`
- `rootCommentId`
- `summaryStatus`
- active row 기준 `rootCommentId` unique

주의:

- `Comment`와 `User` entity에 inverse `summaries` 관계를 꼭 추가하지 않아도 된다.
- `targetType`은 Phase 11에서 항상 `COMMENT_THREAD`로 저장한다.
- `isStale`은 DB 컬럼으로 저장하지 않고 조회 시 계산한다.

---

## 4. 구현 상세

### 댓글 스레드 조회 규칙

`SummaryService`는 `CommentsService` private method에 의존하지 않고 `Comment` repository/query builder로 직접 읽는다.

조회 조건:

```text
root.id = :rootCommentId
root.parent_comment_id IS NULL
root.deleted_at IS NULL
post.deleted_at IS NULL

thread comments:
  comments.post_id = root.post_id
  comments.deleted_at IS NULL
  (comments.id = root.id OR comments.parent_comment_id = root.id)
```

정렬:

```text
created_at ASC, id ASC
```

### SummaryService public method

```ts
createSummary(user, rootCommentId): Promise<SummaryResponse>
getSummary(rootCommentId): Promise<SummaryResponse>
generateSummary(summaryId): Promise<void>
```

`createSummary` 흐름:

```text
root thread 조회
active 댓글 수 10개 이상 검증
기존 SUCCESS summary가 있고 stale=false이면 provider 호출 없이 기존 summary 반환
기존 SUCCESS summary가 있고 stale=true이면 기존 summaryText + 새 댓글만 입력으로 사용
성공한 기존 summary가 없으면 active thread 전체 댓글을 입력으로 사용
요약 입력 문자 수 700자 이하 검증
기존 active AiSummary 있으면 같은 row를 PENDING으로 갱신
없으면 새 AiSummary(PENDING) 생성
void generateSummary(summary.id)
queued면 202 Accepted, fresh summary 반환이면 200 OK 응답 데이터 반환
```

`generateSummary` 흐름:

```text
summary row 조회
root thread 재조회
generation mode가 full이면 active thread 전체 댓글을 provider 입력으로 사용
generation mode가 incremental이면 기존 summaryText와 lastCommentId 이후 새 댓글만 provider 입력으로 사용
provider 입력 문자 수 700자 이하 재검증
summaryStatus=PENDING 유지 또는 RUNNING 상태 없이 provider 호출
SummaryProvider.summarize() 호출
성공: summaryText, summaryStatus=SUCCESS, summarizedCommentCount, lastCommentId, generatedAt 저장
실패: summaryStatus=FAILED, errorCode/errorMessage 저장
```

`SummaryStatus`는 기존 enum의 `PENDING`, `SUCCESS`, `FAILED`만 사용한다. `RUNNING`은 추가하지 않는다.

### SummaryProvider 계약

테스트에서 쉽게 mock할 수 있게 abstract provider로 둔다.

```ts
type SummaryThreadComment = {
  id: string;
  authorNickname: string;
  content: string;
  createdAt: Date;
  isRoot: boolean;
};

type SummaryProviderInput = {
  rootCommentId: string;
  postId: string;
  mode: 'full' | 'incremental';
  previousSummaryText?: string;
  comments: SummaryThreadComment[];
};

type SummaryProviderResult = {
  summaryText: string;
};
```

구현은 `OpenAiCommentAnalyzerProvider`처럼 OpenAI Responses API를 직접 `fetch`로 호출한다. Phase 10.1의 `OpenAiAgentLlmProvider`는 LangChain adapter이므로 구조만 참고하고 재사용하지 않는다.

환경 변수:

```text
OPENAI_API_KEY
SUMMARY_MODEL=gpt-4.1-mini
SUMMARY_TIMEOUT_MS=30000
SUMMARY_MAX_OUTPUT_TOKENS=900
SUMMARY_MAX_INPUT_CHARS=700
```

`SUMMARY_MODEL`, `SUMMARY_TIMEOUT_MS`, `SUMMARY_MAX_OUTPUT_TOKENS`, `SUMMARY_MAX_INPUT_CHARS`는 `.env.example`과 `backend/.env.example`에 추가한다.

### OpenAI 호출 정책

- 실제 API key를 사용하는 자동 테스트를 만들지 않는다.
- provider 테스트는 `globalThis.fetch` mock으로 최소 요청 shape와 응답 parsing만 검증한다.
- LLM 입력 제한은 provider 호출 전에 service에서 검증한다.
- API key가 없으면 `SummaryProviderError('MISSING_OPENAI_API_KEY', ...)`를 던진다.
- provider raw error, stack trace, API key는 DB와 사용자 응답에 저장하지 않는다.
- summary prompt 전체를 DB에 저장하지 않는다.

### 요약 표현 정책

요약은 한국어를 기본으로 한다.

권장 구조:

```text
핵심 요약
주요 쟁점
서로 다른 입장
확인 한계
```

표현 원칙:

- “사실입니다”, “거짓입니다”처럼 최종 판정하지 않는다.
- “댓글들에서는 ...로 논의됩니다”, “확인이 필요한 주장입니다”처럼 말한다.
- 삭제된 댓글이나 없는 댓글 내용을 추측하지 않는다.

---

## 5. 모듈 의존성

권장 구조:

```text
AiModule
→ TypeOrmModule.forFeature([CommentAnalysis, RagEvidence, AiSummary, Comment, Post, User, Video, TranscriptChunk])
→ SummaryController
→ SummaryService
→ SummaryProvider(OpenAiSummaryProvider)
```

금지:

```text
CommentsModule -> SummaryModule
SummaryService -> AgentService
SummaryService -> McpServerService
```

Phase 11 summary는 Agent tool loop가 아니다. 댓글 스레드 조회와 LLM 요약 생성만 담당한다.

---

## 6. 테스트 계획

단위 테스트:

- 로그인 사용자가 active root comment에 summary 생성을 요청하면 `202 Accepted` 응답 데이터를 반환한다.
- 비회원은 생성 API를 호출할 수 없다.
- 비회원은 기존 summary를 조회할 수 있다.
- rootCommentId가 대댓글이면 생성/조회가 실패한다.
- 삭제된 루트 댓글 또는 삭제된 게시글이면 생성/조회가 실패한다.
- active 댓글 수가 10개 미만이면 생성이 실패한다.
- 최초 요약 입력 댓글 본문 합계가 700자를 초과하면 생성이 실패하고 provider를 호출하지 않는다.
- 삭제된 대댓글은 active 댓글 수와 provider 입력에서 제외된다.
- 기존 summary가 최신이면 생성 API가 provider를 호출하지 않고 기존 summary를 반환한다.
- stale summary가 있으면 전체 댓글이 아니라 기존 summary와 `lastCommentId` 이후 새 댓글만 provider 입력으로 사용한다.
- stale 갱신 입력이 700자를 초과하면 생성이 실패하고 provider를 호출하지 않는다.
- 기존 summary 갱신이 필요하면 새 row를 만들지 않고 같은 row를 `PENDING`으로 갱신한다.
- provider 성공 시 `SUCCESS`, `summaryText`, `summarizedCommentCount`, `lastCommentId`, `generatedAt`이 저장된다.
- provider 실패 또는 OpenAI API key 없음은 `FAILED`와 정제된 `errorCode/errorMessage`로 저장된다.
- 새 댓글이 추가되어 현재 댓글 수가 저장된 수보다 많으면 `isStale=true`다.
- 현재 마지막 active 댓글 id가 저장된 `lastCommentId`와 다르면 `isStale=true`다.
- provider 입력과 DB 저장값에 API key, token, cookie, raw provider error, stack trace가 포함되지 않는다.

컨트롤러 테스트:

- `POST /api/v1/comments/:rootCommentId/summary`는 `JwtAuthGuard + CsrfGuard`를 요구한다.
- `GET /api/v1/comments/:rootCommentId/summary`는 guard 없이 접근 가능하다.

기존 검증:

```powershell
pnpm.cmd typecheck
pnpm.cmd --filter @arena/backend test --runInBand
pnpm.cmd lint
pnpm.cmd format:check
```

---

## 7. 구현 순서

1. `AiSummary` entity와 `CreateAiSummaries` migration을 추가한다.
2. `SummaryProvider`, `OpenAiSummaryProvider`, provider error type을 추가한다.
3. `SummaryService`에 root thread 조회, active 댓글 수 계산, stale 계산, 700자 입력 제한을 구현한다.
4. `SummaryController`로 생성/조회 API를 추가한다.
5. `AiModule`에 entity, controller, service, provider를 연결한다.
6. `.env.example`, `backend/.env.example`에 summary 환경 변수를 추가한다.
7. service/provider/controller 단위 테스트를 추가한다.
8. 검증 명령 4개를 모두 통과시킨다.

---

## 8. Phase 10.1 구현 상태에서 이어받을 때 주의할 점

- Phase 10.1 변경사항이 아직 커밋되지 않은 상태라면 Phase 11 브랜치를 만들기 전에 먼저 커밋하거나 stash한다.
- Phase 10.1의 Agent LLM provider는 LangChain adapter다. Summary provider는 Agent provider, AgentService, MCP caller를 재사용하지 않는다.
- backend에는 LangChain dependency가 이미 있지만, Summary에 LangChain을 도입하려면 별도 Phase 문서에서 provider 계약과 테스트 정책을 먼저 갱신한다.
- 댓글 분석 provider에는 rule-based fallback이 있지만, Summary provider에는 runtime 성공 fallback을 두지 않는다.
- 자동 테스트는 실제 OpenAI API key를 사용하지 않는다. 실제 key smoke test가 필요하면 별도 수동 절차로 1회만 수행한다.
