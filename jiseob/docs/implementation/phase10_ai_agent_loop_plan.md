# Phase 10. AI Agent 추론 루프 구현 계획

> 기준 단계: `arena_implementation_plan.md`의 Phase 10  
> 선행 권장 단계: `phase9_5_mcp_protocol_alignment.md`  
> 목표: 게시글 상세 화면에서 사용자의 질문에 답하는 토론 보조 Agent를 구현한다.

---

## 0. Phase 10 구현 하네스

이 문서는 Phase 10 구현자가 `AGENTS.md`와 이 문서만 읽고 바로 작업을 시작할 수 있게 하기 위한 handoff 문서다. Phase 1~9 문서는 세부 배경이 필요할 때만 참고한다.

### 현재 기준 상태

- Phase 9.5까지 완료된 상태에서 시작한다.
- 현재 브랜치 기준 MCP endpoint와 service는 `tools/list`, `tools/call`을 처리한다.
- `tools/list` result는 `{ tools: [...] }` 형태다.
- `tools/call` result는 `{ content, structuredContent, isError }` 형태다.
- protocol 오류는 JSON-RPC `error` envelope로 오고, tool 실행 실패는 `result.isError=true`로 온다.
- Agent는 HTTP self-call을 하지 않고 `McpServerService.handleRequest()`를 직접 호출한다.

### 먼저 볼 코드

Phase 10 구현 전에는 아래 파일만 먼저 읽으면 된다.

```text
backend/src/app.module.ts
backend/src/posts/posts.controller.ts
backend/src/posts/posts.service.ts
backend/src/mcp/mcp.module.ts
backend/src/mcp/mcp-server.service.ts
backend/src/mcp/mcp.types.ts
backend/src/ai/ai.module.ts
backend/src/ai/comment-analysis/openai-comment-analyzer.provider.ts
backend/src/common/entities/base.entity.ts
backend/src/database/migrations/2026061402000-CreateRagEvidences.ts
```

### 새로 만들 구조

Phase 10은 `backend/src/agent` 디렉터리를 새로 만든다.

```text
backend/src/agent/
  agent.module.ts
  agent.controller.ts
  agent.service.ts
  agent-llm.provider.ts
  agent-mcp-caller.service.ts
  dto/create-agent-run.dto.ts
  entities/agent-run.entity.ts
  entities/agent-step.entity.ts
```

공통 enum은 별도 파일로 둔다.

```text
backend/src/common/enums/agent-status.enum.ts
```

DB migration은 다음 순서 번호로 추가한다.

```text
backend/src/database/migrations/2026061500000-CreateAgentRuns.ts
```

`AppModule`에는 `AgentModule`을 import한다. `McpModule`은 `AgentModule`이 내부 호출할 수 있게 `McpServerService`를 export해야 한다.

### Phase 10에서 구현할 API

```http
POST /api/v1/posts/:postId/agent/runs
GET  /api/v1/agent/runs/:runId
```

- 생성 API는 `JwtAuthGuard + CsrfGuard`를 적용하고 `202 Accepted`를 반환한다.
- 조회 API는 `JwtAuthGuard`를 적용하고 run 생성자 본인만 조회할 수 있게 한다.
- 요청 body는 Phase 10에서 `{ "question": "..." }`만 허용한다.
- `question`은 trim 후 1자 이상 1000자 이하로 검증한다.

### Phase 10의 고정 설계 결정

- Agent run 생성 시 게시글 존재 여부와 삭제 여부는 `PostsService.getPost(postId)`로 검증해도 된다.
- Agent 실행 loop 안에서 게시글 맥락, 영상 상태, 자막 검색은 domain service를 직접 호출하지 않고 MCP tool만 사용한다.
- 첫 tool call은 항상 `post.getContext`로 시작한다.
- 자동 loop allowlist는 `post.getContext`, `video.getProcessingStatus`, `transcript.searchChunks`, `youtube.fetchMetadata`만 허용한다.
- `video.retryProcessing`은 MCP server에는 남아 있지만 Phase 10 자동 loop에서는 호출하지 않는다.
- OpenAI API key가 없거나 Agent LLM provider가 실패하면 run은 `FAILED`가 된다. 댓글 분석처럼 rule-based 성공 fallback을 만들지 않는다.
- 서버 내부 비동기 실행은 MVP 한계로 인정한다. Redis/BullMQ는 도입하지 않는다.
- Phase 10에서는 streaming, SSE, WebSocket, cancellation, frontend UI를 만들지 않는다.

### AgentService 최소 책임

`AgentService`는 다음 public method를 제공한다.

```ts
createRun(user, postId, dto): Promise<CreateAgentRunResponse>
getRun(user, runId): Promise<AgentRunResponse>
executeRun(runId): Promise<void>
```

`createRun`은 `AgentRun(PENDING)`을 저장하고 `void this.executeRun(run.id)`로 내부 실행을 시작한 뒤 즉시 `202 Accepted` 응답 데이터를 반환한다. `executeRun` 내부 오류는 run을 `FAILED`로 저장하고 raw stack을 사용자 응답에 노출하지 않는다.

### MCP caller 계약

`AgentMcpCallerService`는 `McpServerService.handleRequest()`를 감싸고 다음 형태로 반환한다.

```ts
type AgentToolCallOutcome =
  | { ok: true; structuredContent: unknown; contentText: string }
  | { ok: false; errorCode: string; errorMessage: string };
```

처리 규칙:

- JSON-RPC `error` envelope은 protocol failure로 보고 `{ ok:false }`로 정제한다.
- `result.isError=true`도 `{ ok:false }`로 정제한다.
- `result.isError=false`이면 `structuredContent`를 Agent state와 step 저장에 사용한다.
- tool timeout은 10초로 둔다.
- 같은 run에서 같은 tool name과 같은 arguments를 두 번 호출하지 않는다.

### Agent LLM provider 계약

`AgentLlmProvider`는 테스트에서 쉽게 mock할 수 있게 얇은 interface 성격으로 둔다.

```ts
type AgentModelDecision =
  | {
      type: 'tool_call';
      toolName: string;
      arguments: Record<string, unknown>;
      rationale?: string;
    }
  | {
      type: 'final';
      answer: string;
      limitations: string[];
    };
```

구현은 기존 `OpenAiCommentAnalyzerProvider`와 같은 방식으로 OpenAI Responses API를 직접 `fetch`로 호출한다. 환경 변수는 다음을 사용한다.

```text
OPENAI_API_KEY
AGENT_MODEL=gpt-4.1-mini
AGENT_TIMEOUT_MS=30000
AGENT_MAX_OUTPUT_TOKENS=1200
```

`AGENT_MODEL`, `AGENT_TIMEOUT_MS`, `AGENT_MAX_OUTPUT_TOKENS`는 `.env.example`과 `backend/.env.example`에 추가한다.

### 저장 정책

조회 응답을 단순하게 만들기 위해 `AgentRun`에는 최종 표시용 데이터를 저장한다.

- `answer`
- `evidenceCandidates` jsonb, 기본 `[]`
- `limitations` jsonb, 기본 `[]`

`AgentStep`은 audit/debug용이다. API key, access token, cookie, raw provider error, stack trace, 전체 prompt 원문은 저장하지 않는다.

### 완료 후 검증

Phase 10 완료 시 다음 명령을 모두 통과해야 한다.

```powershell
pnpm.cmd typecheck
pnpm.cmd --filter @arena/backend test --runInBand
pnpm.cmd lint
pnpm.cmd format:check
```

---

## 1. Agent의 제품상 역할

Arena의 Agent는 게시글 작성자나 댓글 작성자를 대신하는 자동 작성 봇이 아니다. 또한 AI가 참/거짓을 최종 판정하는 팩트체커도 아니다.

MVP Agent의 역할은 **게시글 상세 화면의 토론 보조자**다.

사용자가 게시글 화면에서 질문을 입력하면 Agent는 게시글 맥락, 영상 처리 상태, 자막 검색 결과를 tool로 조회하고, 관련 근거 후보와 한계를 함께 설명한다.

답할 수 있는 질문 예시:

- 이 게시글의 핵심 쟁점은 뭐야?
- 이 댓글의 주장이 영상에서 실제로 언급되었는지 확인할 자막 구간이 있어?
- 영상 처리가 실패했다면 지금 어떤 상태야?
- 이 주제에 대해 자막에서 확인해 볼 만한 부분을 찾아줘.

답하지 않거나 조심해야 하는 것:

- AI가 사실 여부를 최종 단정하지 않는다.
- 사용자 대신 게시글이나 댓글을 작성하지 않는다.
- 사용자 대신 삭제, 관리자 조치, 자동 반박 댓글 작성을 하지 않는다.
- API key, token, 내부 stack trace를 답변에 포함하지 않는다.

---

## 2. API 설계

### Agent run 생성

```http
POST /api/v1/posts/:postId/agent/runs
```

인증:

- 로그인 사용자만 생성 가능하다.
- 사용자 화면에서 호출하는 state-changing REST API이므로 `JwtAuthGuard + CsrfGuard`를 적용한다.

요청 body:

```json
{
  "question": "이 댓글 주장이 영상에서 언급되었는지 확인해줘."
}
```

MVP에서는 body를 `question` 하나로 시작한다. 나중에 특정 댓글을 UI에서 선택해 질문하는 흐름이 필요하면 `targetCommentId`를 optional로 추가할 수 있다. 그 경우 `targetCommentId`가 `postId`에 속하고 삭제되지 않은 댓글인지 반드시 검증한다.

생성 응답:

```json
{
  "runId": "01J00000000000000000000000",
  "postId": "01J00000000000000000000001",
  "status": "PENDING",
  "question": "이 댓글 주장이 영상에서 언급되었는지 확인해줘.",
  "createdAt": "2026-06-15T00:00:00.000Z"
}
```

권장 HTTP status:

```http
202 Accepted
```

Agent는 LLM과 tool 호출을 포함하므로 요청 안에서 모든 처리를 기다리지 않는다. run을 만들고 서버 내부 비동기 작업으로 실행한 뒤, 클라이언트는 조회 API로 결과를 polling한다.

### Agent run 조회

```http
GET /api/v1/agent/runs/:runId
```

조회 권한:

- Phase 10 MVP에서는 run 생성자만 조회할 수 있게 한다.
- 질문 내용이 사용자 입력이므로 공개 조회로 시작하지 않는다.

응답 예시:

```json
{
  "runId": "01J00000000000000000000000",
  "postId": "01J00000000000000000000001",
  "question": "이 댓글 주장이 영상에서 언급되었는지 확인해줘.",
  "status": "SUCCESS",
  "answer": "영상 자막에서 직접적으로 같은 표현은 확인되지 않았지만, 관련성이 있어 보이는 구간은 다음과 같습니다...",
  "usedTools": [
    {
      "stepIndex": 1,
      "toolName": "post.getContext",
      "status": "SUCCESS"
    },
    {
      "stepIndex": 2,
      "toolName": "transcript.searchChunks",
      "status": "SUCCESS"
    }
  ],
  "evidenceCandidates": [
    {
      "chunkId": "01J00000000000000000000002",
      "startSec": 31.2,
      "endSec": 43.9,
      "text": "...",
      "similarityScore": 0.82
    }
  ],
  "limitations": ["자막 검색 결과는 근거 후보이며 사실 여부의 최종 판정이 아닙니다."],
  "errorCode": null,
  "errorMessage": null,
  "stepCount": 3,
  "createdAt": "2026-06-15T00:00:00.000Z",
  "startedAt": "2026-06-15T00:00:01.000Z",
  "completedAt": "2026-06-15T00:00:07.000Z"
}
```

---

## 3. 상태값

Agent run 상태:

```text
PENDING   - run은 생성됐지만 실행 전이다.
RUNNING   - LLM/tool loop가 실행 중이다.
SUCCESS   - 최종 답변 생성에 성공했다.
FAILED    - 복구 불가능한 오류로 답변 생성에 실패했다.
```

MVP에서는 취소 API가 없으므로 `CANCELLED`는 만들지 않는다.

Agent step type:

```text
MODEL      - LLM 호출 또는 LLM 응답 기록
TOOL_CALL  - MCP tool 호출 요청
TOOL_RESULT - MCP tool 호출 결과
FINAL      - 최종 답변 저장
```

Agent step status:

```text
SUCCESS
FAILED
```

---

## 4. 데이터 모델 초안

### `agent_runs`

필드 초안:

```text
id char(26) primary key
postId char(26) not null
userId char(26) not null
question text not null
status varchar not null
answer text null
evidenceCandidates jsonb not null default '[]'
limitations jsonb not null default '[]'
errorCode varchar null
errorMessage text null
model varchar null
maxSteps integer not null default 4
stepCount integer not null default 0
startedAt timestamptz null
completedAt timestamptz null
createdAt timestamptz not null
updatedAt timestamptz not null
deletedAt timestamptz null
```

관계:

- `AgentRun -> Post`
- `AgentRun -> User`
- `AgentRun -> AgentStep[]`

### `agent_steps`

필드 초안:

```text
id char(26) primary key
runId char(26) not null
stepIndex integer not null
type varchar not null
status varchar not null
toolName varchar null
toolArguments jsonb null
toolResult jsonb null
modelOutput jsonb null
errorCode varchar null
errorMessage text null
startedAt timestamptz null
completedAt timestamptz null
createdAt timestamptz not null
updatedAt timestamptz not null
deletedAt timestamptz null
```

주의:

- `toolArguments`와 `toolResult`에는 API key, access token, cookie, raw provider error, stack trace를 저장하지 않는다.
- LLM prompt 전체를 저장하면 민감한 정보가 섞일 수 있으므로 MVP에서는 필요한 요약 또는 구조화된 step 결과만 저장한다.
- 같은 `runId` 안에서 `stepIndex`는 unique해야 한다.
- `AgentRun.stepCount`는 tool call 시도 수를 의미한다. `MODEL`, `FINAL` step row까지 모두 더한 값이 아니다.
- 조회 API는 `AgentRun.answer`, `AgentRun.evidenceCandidates`, `AgentRun.limitations`를 우선 사용하고, `AgentStep`은 `usedTools` 요약과 추적용으로 사용한다.

---

## 5. 모듈 의존성

권장 구조:

```text
AgentModule
→ TypeOrmModule.forFeature([AgentRun, AgentStep])
→ PostsModule
→ McpModule
→ ConfigModule
```

실제 방향:

```text
AppModule -> AgentModule
AgentModule -> PostsModule
AgentModule -> McpModule
AgentModule -> ConfigModule
```

금지:

```text
McpModule -> AgentModule
PostsModule -> AgentModule
VideosModule -> AgentModule
```

Agent는 게시글/영상/RAG 기능을 직접 구현하지 않고 MCP tool을 통해 사용한다. Phase 10에서는 Agent 전용 LLM provider를 `AgentModule` 안에 둔다. 현재 `AiModule`의 OpenAI provider는 댓글 분석 전용이고 rule-based fallback 정책을 가지므로 Agent loop에 재사용하지 않는다.

`McpModule`은 `McpServerService`를 export해야 한다. `AgentModule`이 `McpModule`을 import하면 내부 JSON-RPC envelope 호출이 가능해야 한다.

---

## 6. MCP 사용 방식

Agent는 domain service를 직접 호출하지 않는다. 대신 `McpServerService.handleRequest()`에 JSON-RPC envelope을 넘겨 tool을 호출한다.

```ts
await mcpServerService.handleRequest(
  {
    jsonrpc: '2.0',
    id: `${runId}:${stepIndex}`,
    method: 'tools/call',
    params: {
      name: 'transcript.searchChunks',
      arguments: {
        postId,
        query: question,
        limit: 5,
      },
    },
  },
  { user },
);
```

이 방식은 HTTP self-call이 아니다. 같은 프로세스 내부의 service method를 호출하지만, JSON-RPC envelope, tool registry, argument validation, 권한 context, error sanitation은 그대로 통과한다.

Phase 9.5 이후 MCP 응답은 다음처럼 해석한다.

```ts
if ('error' in response) {
  // protocol failure: run 실패 또는 tool observation 실패로 정제
}

const result = response.result as McpToolCallResult;

if (result.isError) {
  // tool 실행 실패: structuredContent.errorCode/errorMessage를 observation으로 저장
} else {
  // tool 실행 성공: structuredContent를 다음 Agent state에 반영
}
```

Agent는 `content[0].text`보다 `structuredContent`를 우선 사용한다. `content`는 사람이 읽는 trace 또는 LLM observation text를 만들 때만 사용한다.

Phase 10 Agent가 기본적으로 사용할 tool:

```text
post.getContext
video.getProcessingStatus
transcript.searchChunks
youtube.fetchMetadata
```

`video.retryProcessing`은 Phase 10 자동 Agent loop의 기본 allowlist에서 제외한다. write 성격의 tool이므로, 별도 확인 UI나 명시적인 사용자 승인 흐름이 생긴 뒤에 Agent가 호출할 수 있게 한다.

---

## 7. 실행 흐름

권장 흐름:

```text
POST /posts/:postId/agent/runs
→ AgentRun(PENDING) 생성
→ 202 Accepted 반환
→ 서버 내부 비동기 executeRun(runId)
→ RUNNING 저장
→ tools/list로 사용 가능한 tool 확인
→ post.getContext tool 강제 호출
→ LLM 호출
→ LLM이 allowlist 내 tool call 또는 final 선택
→ McpServerService.handleRequest(JSON-RPC envelope)
→ AgentStep 저장
→ observe 결과를 다음 LLM 입력에 반영
→ 최대 step 또는 충분한 근거 도달 시 FINAL
→ SUCCESS 또는 FAILED 저장
```

Phase 10 MVP에서는 첫 step으로 `post.getContext`를 강제 호출한다. 이렇게 하면 Agent가 최소한 게시글 제목, 본문, video 상태를 알고 답변을 시작할 수 있다.

`transcript.searchChunks` 성공 결과의 `chunks`는 `AgentRun.evidenceCandidates`에 정규화해 저장한다. 필드명은 조회 응답 기준으로 `chunkId`, `startSec`, `endSec`, `text`, `similarityScore`를 사용한다.

---

## 8. Loop 제한

초기값:

```text
maxSteps: 4
totalTimeoutMs: 30000
toolTimeoutMs: 10000
questionMaxLength: 1000
answerMaxLength: 2000 characters
```

반복 방지:

- 같은 run 안에서 같은 tool name과 같은 arguments를 반복 호출하지 않는다.
- tool failure가 발생해도 같은 tool을 무한 retry하지 않는다.
- maxSteps에 도달하면 지금까지 얻은 정보와 한계를 설명하고 종료한다.

LLM 실패 정책:

- OpenAI API key가 없거나 provider 호출이 실패하면 run은 `FAILED`가 된다.
- rule-based 가짜 답변으로 성공 처리하지 않는다.
- 사용자에게는 정제된 `errorCode`, `errorMessage`만 보여준다.

---

## 9. 답변 정책

Agent 답변은 다음 구조를 따른다.

```text
짧은 결론
근거 후보
한계
다음에 확인하면 좋은 것
```

표현 원칙:

- "사실입니다", "거짓입니다"처럼 최종 판정하지 않는다.
- "자막에서 확인되는 관련 구간", "관련 있을 수 있는 근거 후보"로 표현한다.
- transcript 검색 결과가 없으면 없다고 말하고, 영상 처리 상태나 자막 부재 가능성을 설명한다.
- 출처 없이 단정적인 외부 지식을 보태지 않는다.

---

## 10. 테스트 계획

단위 테스트:

- 로그인 사용자가 AgentRun을 생성할 수 있다.
- Agent run 생성 API는 `202 Accepted`를 반환한다.
- Agent run 조회는 생성자 본인만 가능하다.
- 삭제된 게시글에는 AgentRun을 생성할 수 없다.
- question이 비어 있거나 너무 길면 실패한다.
- Agent 실행 loop는 게시글 맥락/영상 상태/자막 검색을 domain service로 직접 조회하지 않고 MCP caller를 사용한다.
- `post.getContext`가 첫 tool로 호출된다.
- `transcript.searchChunks` tool 결과가 answer의 evidenceCandidates에 반영된다.
- MCP `result.isError=true`는 run 전체 무한 retry가 아니라 정제된 observation 또는 실패로 처리된다.
- JSON-RPC protocol error는 raw error 노출 없이 run 실패 또는 tool observation 실패로 정제된다.
- tool failure가 run 전체 무한 retry로 이어지지 않는다.
- maxSteps를 넘기지 않는다.
- OpenAI provider 실패 시 run이 `FAILED`가 된다.
- OpenAI API key가 없을 때 rule-based 성공 fallback을 만들지 않고 run이 `FAILED`가 된다.
- `video.retryProcessing`은 자동 Agent allowlist에 포함되지 않는다.
- `AgentStep.toolArguments`, `AgentStep.toolResult`, `AgentStep.modelOutput`에 API key, token, cookie, stack trace가 저장되지 않는다.
- `McpModule`이 `McpServerService`를 export해 `AgentModule`에서 내부 호출할 수 있다.

기존 검증:

```bash
pnpm.cmd typecheck
pnpm.cmd --filter @arena/backend test --runInBand
pnpm.cmd lint
pnpm.cmd format:check
```

---

## 11. 구현 순서

1. `AgentRunStatus`, `AgentStepType`, `AgentStepStatus` enum을 추가한다.
2. `AgentRun`, `AgentStep` entity와 `CreateAgentRuns` migration을 추가한다.
3. `McpModule`에서 `McpServerService`를 export한다.
4. `AgentModule`을 만들고 `AppModule`에 연결한다.
5. `CreateAgentRunDto`, `AgentController`, `AgentService`로 생성/조회 API를 만든다.
6. `AgentMcpCallerService`로 MCP JSON-RPC response unwrap, timeout, 반복 호출 방지를 구현한다.
7. `AgentLlmProvider`로 OpenAI Responses API 기반 `AgentModelDecision` 생성을 구현한다.
8. `AgentService.executeRun()`에서 `post.getContext -> plan -> tool call -> observe -> final` 상태 머신을 구현한다.
9. `answer`, `evidenceCandidates`, `limitations`, `usedTools` 응답을 정리한다.
10. `.env.example`, `backend/.env.example`, 테스트, 문서를 갱신한다.

---

## 12. 외부 MCP 서버에 대한 판단

Phase 10 구현은 YouTube나 뉴스사가 제공하는 외부 MCP 서버에 의존하지 않는다.

이유:

- YouTube는 공식 YouTube Data API를 제공하지만, Arena가 의존할 공식 YouTube MCP 서버를 전제로 삼지 않는다.
- 뉴스 서비스도 각자 API는 있을 수 있지만, Arena MVP에서 쓸 범용 공식 뉴스 MCP 서버를 전제로 두지 않는다.
- community MCP 서버는 품질, 권한, API key 처리, 배포 안정성을 통제하기 어렵다.

따라서 Arena는 기존 provider adapter와 domain service를 직접 노출하지 않고, 우리가 통제하는 MCP tool wrapper로 감싼다. 과제의 MCP 요구사항은 이 자체 MCP server와 `youtube.fetchMetadata`의 실제 YouTube Data API 연동으로 충족한다.
