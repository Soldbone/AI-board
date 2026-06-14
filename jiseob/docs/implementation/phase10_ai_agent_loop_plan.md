# Phase 10. AI Agent 추론 루프 구현 계획

> 기준 단계: `arena_implementation_plan.md`의 Phase 10  
> 선행 권장 단계: `phase9_5_mcp_protocol_alignment.md`  
> 목표: 게시글 상세 화면에서 사용자의 질문에 답하는 토론 보조 Agent를 구현한다.

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
errorCode varchar null
errorMessage text null
model varchar null
maxSteps integer not null default 4
stepCount integer not null default 0
startedAt timestamptz null
completedAt timestamptz null
createdAt timestamptz not null
updatedAt timestamptz not null
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
```

주의:

- `toolArguments`와 `toolResult`에는 API key, access token, cookie, raw provider error, stack trace를 저장하지 않는다.
- LLM prompt 전체를 저장하면 민감한 정보가 섞일 수 있으므로 MVP에서는 필요한 요약 또는 구조화된 step 결과만 저장한다.
- 같은 `runId` 안에서 `stepIndex`는 unique해야 한다.

---

## 5. 모듈 의존성

권장 구조:

```text
AgentModule
→ PostsModule
→ McpModule
→ AiModule 또는 LlmProvider
```

실제 방향:

```text
AgentModule -> PostsModule
AgentModule -> McpModule
AgentModule -> AiModule
```

금지:

```text
McpModule -> AgentModule
PostsModule -> AgentModule
VideosModule -> AgentModule
```

Agent는 게시글/영상/RAG 기능을 직접 구현하지 않고 MCP tool을 통해 사용한다. LLM provider가 이미 `AiModule`에 있다면 `AiModule`이 provider를 export하고 `AgentModule`이 import한다.

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
→ LLM 호출
→ LLM이 tool call 선택
→ McpServerService.handleRequest(JSON-RPC envelope)
→ AgentStep 저장
→ observe 결과를 다음 LLM 입력에 반영
→ 최대 step 또는 충분한 근거 도달 시 FINAL
→ SUCCESS 또는 FAILED 저장
```

초기 MVP에서는 첫 step으로 `post.getContext`를 강제 호출해도 된다. 이렇게 하면 Agent가 최소한 게시글 제목, 본문, video 상태를 알고 답변을 시작할 수 있다.

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
- 삭제된 게시글에는 AgentRun을 생성할 수 없다.
- question이 비어 있거나 너무 길면 실패한다.
- AgentService는 domain service를 직접 호출하지 않고 MCP caller를 사용한다.
- `post.getContext`가 첫 tool로 호출된다.
- `transcript.searchChunks` tool 결과가 answer의 evidenceCandidates에 반영된다.
- tool failure가 run 전체 무한 retry로 이어지지 않는다.
- maxSteps를 넘기지 않는다.
- OpenAI provider 실패 시 run이 `FAILED`가 된다.
- `video.retryProcessing`은 자동 Agent allowlist에 포함되지 않는다.

기존 검증:

```bash
pnpm.cmd typecheck
pnpm.cmd --filter @arena/backend test --runInBand
pnpm.cmd lint
pnpm.cmd format:check
```

---

## 11. 구현 순서

1. Phase 9.5 MCP response shape 보강을 먼저 끝낸다.
2. Agent enum과 entity migration을 추가한다.
3. `AgentModule`, `AgentRun`, `AgentStep` entity를 만든다.
4. Agent run 생성/조회 API를 만든다.
5. MCP caller wrapper를 만든다.
6. LLM provider function calling adapter를 붙인다.
7. 작은 상태 머신으로 `plan -> tool call -> observe -> final` loop를 구현한다.
8. max step, timeout, 반복 호출 방지를 넣는다.
9. answer/evidenceCandidates/limitations 응답을 정리한다.
10. 테스트와 문서를 갱신한다.

---

## 12. 외부 MCP 서버에 대한 판단

Phase 10 구현은 YouTube나 뉴스사가 제공하는 외부 MCP 서버에 의존하지 않는다.

이유:

- YouTube는 공식 YouTube Data API를 제공하지만, Arena가 의존할 공식 YouTube MCP 서버를 전제로 삼지 않는다.
- 뉴스 서비스도 각자 API는 있을 수 있지만, Arena MVP에서 쓸 범용 공식 뉴스 MCP 서버를 전제로 두지 않는다.
- community MCP 서버는 품질, 권한, API key 처리, 배포 안정성을 통제하기 어렵다.

따라서 Arena는 기존 provider adapter와 domain service를 직접 노출하지 않고, 우리가 통제하는 MCP tool wrapper로 감싼다. 과제의 MCP 요구사항은 이 자체 MCP server와 `youtube.fetchMetadata`의 실제 YouTube Data API 연동으로 충족한다.
