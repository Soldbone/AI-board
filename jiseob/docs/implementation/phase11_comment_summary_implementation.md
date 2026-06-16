# Phase 11. 댓글 스레드 요약 구현 결과

> 구현 기준: `phase11_comment_summary_plan.md`  
> 구현 범위: 백엔드 API, DB 모델, OpenAI 요약 provider, 테스트  
> 제외 범위: 프론트엔드 UI, streaming/SSE/WebSocket, Redis/BullMQ, Agent/MCP 연동

---

## 1. 구현 요약

Phase 11에서는 루트 댓글 스레드 단위의 AI 요약 기능을 `AiModule` 하위 기능으로 추가했다.

요약은 자동 생성되지 않는다. 로그인 사용자가 생성 API를 호출할 때만 생성 작업을 시작하며, 이미 생성된 요약은 비회원도 조회할 수 있다.

핵심 구현 파일:

```text
backend/src/ai/summary/
  summary.controller.ts
  summary.service.ts
  summary.provider.ts
  openai-summary.provider.ts
  entities/ai-summary.entity.ts

backend/src/database/migrations/2026061501000-CreateAiSummaries.ts
```

`AiModule`에는 `SummaryController`, `SummaryService`, `SummaryProvider`, `AiSummary` entity를 등록했다. 별도 `SummaryModule`은 만들지 않았다.

---

## 2. API 동작

### 요약 생성

```http
POST /api/v1/comments/:rootCommentId/summary
```

- `JwtAuthGuard + CsrfGuard`를 요구한다.
- 요청 body는 받지 않는다.
- `rootCommentId`는 삭제되지 않은 최상위 댓글이어야 한다.
- 삭제되지 않은 루트 댓글과 직계 대댓글이 총 10개 이상일 때만 생성한다.
- 10개 미만이면 `400 Bad Request`와 `요약할 댓글이 충분하지 않습니다.`를 반환한다.
- 새 작업, 실패 재시도, stale 갱신은 `202 Accepted`를 반환한다.
- 이미 최신 `SUCCESS` 요약이 있으면 provider를 호출하지 않고 `200 OK`로 기존 요약을 반환한다.
- 기존 `PENDING` 요약이 있으면 중복 작업을 만들지 않고 같은 row를 `202 Accepted`로 반환한다.

### 요약 조회

```http
GET /api/v1/comments/:rootCommentId/summary
```

- guard를 적용하지 않는다.
- 비회원도 기존 요약을 조회할 수 있다.
- 삭제된 루트 댓글, 대댓글 id, 삭제된 게시글에 대한 요청은 `404 Not Found`로 처리한다.
- 요약 row가 없으면 `404 Not Found`로 처리한다.

응답 공통 shape:

```json
{
  "summaryId": "01J00000000000000000000000",
  "rootCommentId": "01J00000000000000000000001",
  "postId": "01J00000000000000000000002",
  "status": "SUCCESS",
  "summaryText": "요약 내용",
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

---

## 3. 데이터 모델과 stale 정책

`ai_summaries` 테이블을 추가했다.

주요 저장값:

- `target_type`: Phase 11에서는 항상 `COMMENT_THREAD`
- `post_id`, `root_comment_id`, `created_by_id`
- `summary_text`, `summary_status`
- `summarized_comment_count`
- `last_comment_id`
- `last_comment_updated_at`
- `error_code`, `error_message`, `generated_at`

`root_comment_id`에는 `deleted_at IS NULL` 조건의 partial unique index를 둬 루트 댓글 스레드당 active 요약 row를 1개만 유지한다.

`isStale`은 DB 컬럼으로 저장하지 않고 조회 시 계산한다. 다음 중 하나라도 다르면 stale로 본다.

- 저장된 `summarizedCommentCount`와 현재 active 댓글 수
- 저장된 `lastCommentId`와 현재 마지막 active 댓글 id
- 저장된 `lastCommentUpdatedAt`과 현재 active 댓글들의 최대 `updatedAt`

사용자 결정에 따라 댓글 수정도 stale 원인에 포함했다.

---

## 4. 생성과 갱신 흐름

최초 요약:

- 삭제되지 않은 루트 댓글과 직계 대댓글 전체를 provider 입력으로 사용한다.
- provider 입력 댓글 본문 합계가 `SUMMARY_MAX_INPUT_CHARS`를 초과하면 provider 호출 없이 `400 Bad Request`를 반환한다.

stale 갱신:

- 기존 `summaryText`가 있으면 전체 댓글을 다시 보내지 않는다.
- 기존 요약과 새 댓글, 수정된 댓글만 provider 입력으로 사용한다.
- 삭제만으로 stale이 된 경우 삭제된 내용을 복원하거나 추측하지 않고 변경 메모만 provider에 전달한다.
- 갱신 실패 시 기존 `summaryText`는 보존하고 row 상태만 `FAILED`로 변경한다.

provider 실패:

- `summary_status=FAILED`
- 정제된 `error_code`, `error_message`만 저장한다.
- provider raw error, stack trace, API key, token, cookie는 DB와 응답에 저장하지 않는다.

---

## 5. OpenAI Summary Provider

`OpenAiSummaryProvider`는 Agent LLM provider를 재사용하지 않고 독립 구현했다.

사용 환경 변수:

```text
OPENAI_API_KEY
SUMMARY_MODEL=gpt-4.1-mini
SUMMARY_TIMEOUT_MS=30000
SUMMARY_MAX_OUTPUT_TOKENS=900
SUMMARY_MAX_INPUT_CHARS=700
```

OpenAI Responses API를 직접 호출하며, structured JSON 응답 `{ "summaryText": "..." }`만 정상 응답으로 인정한다.

runtime mock fallback은 만들지 않았다. 테스트는 provider mock 또는 `globalThis.fetch` mock으로 검증한다.

---

## 6. 테스트와 검증

추가 테스트:

```text
backend/src/ai/summary/summary.service.spec.ts
backend/src/ai/summary/openai-summary.provider.spec.ts
backend/src/ai/summary/summary.controller.spec.ts
```

검증한 주요 정책:

- active 댓글 10개 미만 생성 거절
- 최신 `SUCCESS` 요약 재사용
- `PENDING` 중복 큐잉 방지
- stale `SUCCESS`와 `FAILED` row 재사용
- 새 댓글, 댓글 수정, 댓글 삭제 stale 판정
- stale 갱신 시 변경분 중심 provider 입력
- 700자 초과 시 provider 미호출
- provider 성공/실패 상태 저장
- 민감정보 미저장
- 생성 API guard와 조회 API 비회원 접근

최종 검증 명령:

```powershell
pnpm.cmd typecheck
pnpm.cmd --filter @arena/backend test --runInBand
pnpm.cmd lint
pnpm.cmd format:check
```

모두 통과했다.
