# Phase 10.1. LangChain Agent LLM Adapter 전환 계획

> 기준 단계: Phase 10 `AI Agent 추론 루프 구현` 이후  
> 목표: 과제 명세의 LangChain 요구를 충족하되, Arena의 MCP 경계와 Agent 실행 정책은 유지한다.  
> 핵심 결정: Agent orchestration은 직접 구현한 상태 머신을 유지하고, LLM decision 생성 provider만 LangChain 기반 adapter로 교체한다.
> 구현 상태: 2026-06-15 현재 완료. 이후 작업자는 이 문서를 회귀 검증과 유지보수 기준으로 사용한다.

---

## 0. Phase 10.1 구현 하네스

이 문서는 Phase 10 구현 이후 Agent LLM 호출부를 LangChain 기반으로 전환하거나 회귀 검증할 때 필요한 handoff 문서다. 구현자는 `AGENTS.md`, `phase10_ai_agent_loop_plan.md`, 이 문서만 읽고 작업을 시작할 수 있어야 한다.

### 현재 기준 상태

- Phase 10 Agent는 이미 `backend/src/agent`에 구현되어 있다.
- `AgentService`는 `post.getContext -> model decision -> MCP tool call -> observe -> final` 상태 머신을 직접 실행한다.
- `AgentMcpCallerService`는 `McpServerService.handleRequest()`를 감싸고 JSON-RPC `tools/list`, `tools/call` 결과를 정제한다.
- `AgentLlmProvider`는 abstract provider이며, 현재 구현체 `OpenAiAgentLlmProvider`는 `ChatOpenAI.withStructuredOutput()` 기반 LangChain adapter다.
- backend package에는 `@langchain/openai`, `@langchain/core`, `zod`가 추가되어 있다.
- provider 테스트는 `ChatOpenAI`를 mock하며 실제 OpenAI API key나 네트워크 호출을 사용하지 않는다.
- `AgentRun`, `AgentStep`은 DB에 실행 상태와 trace를 저장한다.
- 자동 Agent loop allowlist는 `post.getContext`, `video.getProcessingStatus`, `transcript.searchChunks`, `youtube.fetchMetadata`다.
- `video.retryProcessing`은 MCP tool로 존재하지만 자동 Agent loop에서는 제외되어 있다.

### 먼저 볼 코드

```text
backend/package.json
backend/src/agent/agent.module.ts
backend/src/agent/agent.service.ts
backend/src/agent/agent-llm.provider.ts
backend/src/agent/agent-llm.provider.spec.ts
backend/src/agent/agent-mcp-caller.service.ts
backend/src/mcp/mcp-server.service.ts
backend/src/mcp/mcp.types.ts
```

### 설치할 의존성

현재 기준으로는 이미 설치되어 있다. 새 브랜치나 lockfile 충돌로 누락된 경우에만 backend package에 LangChain OpenAI adapter를 추가한다.

```powershell
pnpm.cmd --filter @arena/backend add @langchain/openai @langchain/core zod
```

판단:

- `@langchain/openai`: `ChatOpenAI` 사용
- `@langchain/core`: message/model type 사용
- `zod`: structured output schema 정의
- LangGraph는 도입하지 않는다.

네트워크 제한이 있는 환경에서는 위 명령이 실패할 수 있다. 실패하면 승인 요청 후 다시 실행한다.

---

## 1. 왜 LangChain을 제한적으로 쓰는가

LangChain은 과제 명세 대응과 structured output 안정화에는 도움이 된다. 하지만 Arena Agent의 핵심은 LangChain tool executor가 아니라 다음 정책이다.

- MCP JSON-RPC boundary를 반드시 통과한다.
- tool allowlist를 서버 코드에서 강제한다.
- `AgentRun`, `AgentStep`을 DB에 저장한다.
- 같은 tool name + arguments 반복 호출을 막는다.
- write tool인 `video.retryProcessing`을 자동 loop에서 제외한다.
- provider 실패 시 rule-based 성공 fallback을 만들지 않는다.

따라서 LangChain은 **LLM 호출 adapter**로만 사용한다. `AgentService`의 loop orchestration, MCP 호출, step 저장 정책은 유지한다.

도입 범위:

```text
변경:
OpenAiAgentLlmProvider
agent-llm.provider.spec.ts
backend/package.json / lockfile

유지:
AgentService
AgentMcpCallerService
AgentRun / AgentStep entity
MCP JSON-RPC envelope
tool allowlist
API route/response shape
```

---

## 2. 목표 아키텍처

전환 전 구조:

```text
AgentService
→ AgentLlmProvider.decide()
→ OpenAI Responses API direct fetch
→ AgentModelDecision
```

전환 후 현재 구조:

```text
AgentService
→ AgentLlmProvider.decide()
→ LangChain ChatOpenAI.withStructuredOutput()
→ AgentModelDecision
```

중요:

- `AgentLlmProvider` public contract는 바꾸지 않는다.
- `AgentService`는 LangChain import를 몰라야 한다.
- LangChain tool calling 기능은 사용하지 않는다.
- MCP tool은 계속 `AgentMcpCallerService`가 호출한다.

---

## 3. Provider 계약

기존 타입을 유지한다.

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

LangChain structured output schema는 이 contract와 같은 shape를 반환해야 한다.

권장 zod schema:

```ts
const agentDecisionSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('tool_call'),
      toolName: z.string(),
      arguments: z.record(z.string(), z.unknown()),
      rationale: z.string().optional(),
    }),
    z.object({
      type: z.literal('final'),
      answer: z.string(),
      limitations: z.array(z.string()),
    }),
  ])
  .describe('Arena agent decision');
```

주의:

- `answer`는 기존처럼 최대 2000 characters로 자른다.
- `limitations`는 trim/filter 처리한다.
- schema가 깨진 응답은 `AgentLlmError('AGENT_LLM_INVALID_RESPONSE', ...)`로 정제한다.

---

## 4. LangChain 구현 방식

`OpenAiAgentLlmProvider`는 `ChatOpenAI`를 사용한다.

권장 생성:

```ts
const model = new ChatOpenAI({
  apiKey,
  model: this.model,
  timeout: this.getTimeoutMs(),
  maxTokens: this.getMaxOutputTokens(),
  maxRetries: 0,
  temperature: 0,
  modelKwargs: {
    store: false,
  },
  zdrEnabled: true,
});

const structuredModel = model.withStructuredOutput(agentDecisionSchema, {
  name: 'agent_decision',
  strict: true,
});

const decision = await structuredModel.invoke([
  new SystemMessage(this.createInstructions(input.finalOnly)),
  new HumanMessage(JSON.stringify(this.toPromptInput(input))),
]);
```

환경 변수는 기존 Phase 10 값을 그대로 쓴다.

```text
OPENAI_API_KEY
AGENT_MODEL=gpt-4.1-mini
AGENT_TIMEOUT_MS=30000
AGENT_MAX_OUTPUT_TOKENS=1200
```

정책:

- API key가 없으면 LangChain model을 만들지 않고 즉시 `MISSING_OPENAI_API_KEY`를 던진다.
- LangChain raw error message는 DB/사용자 응답에 저장하지 않는다.
- prompt 전체를 `AgentStep.modelOutput`에 저장하지 않는다.
- 현재 구현은 `modelKwargs.store=false`와 `zdrEnabled=true`를 설정한다. 단, OpenAI 조직/프로젝트의 Zero Data Retention 자체는 코드가 아니라 플랫폼 설정에서 보장되는 영역이다.
- DB에는 prompt 전체를 저장하지 않고, 모델 decision 또는 정제된 error만 저장한다.

---

## 5. 금지할 변경

다음 변경은 Phase 10.1 범위가 아니다.

- LangGraph 도입
- LangChain AgentExecutor 도입
- LangChain Tool abstraction으로 MCP tool을 감싸기
- `AgentService` loop 제거
- MCP JSON-RPC envelope 우회
- `video.retryProcessing` 자동 allowlist 추가
- Agent API route/response 변경
- `AgentRun`/`AgentStep` schema 변경
- rule-based Agent fallback 추가

LangChain tool calling까지 쓰고 싶다면 별도 Phase 10.2 문서에서 MCP boundary와 step 저장 정책을 다시 설계해야 한다.

---

## 6. 테스트 계획

기존 테스트는 유지하고 provider 테스트만 LangChain mock 중심으로 바꾼다.

필수 테스트:

- `OPENAI_API_KEY`가 없으면 `MISSING_OPENAI_API_KEY`로 실패한다.
- `ChatOpenAI.withStructuredOutput().invoke()`가 final decision을 반환하면 `AgentModelDecision.final`로 normalize된다.
- tool_call decision이 반환되면 `toolName`, `arguments`, `rationale`가 유지된다.
- LangChain invoke가 throw하면 `AGENT_LLM_FAILED` 또는 기존 정책에 맞는 정제된 error로 실패한다.
- invalid structured output은 `AGENT_LLM_INVALID_RESPONSE`로 실패한다.
- API key, token, raw stack trace가 `AgentStep`에 저장되지 않는 기존 AgentService 테스트가 계속 통과한다.

실제 OpenAI API key를 사용하는 자동 테스트는 만들지 않는다.

검증 명령:

```powershell
pnpm.cmd typecheck
pnpm.cmd --filter @arena/backend test --runInBand
pnpm.cmd lint
pnpm.cmd format:check
```

---

## 7. 구현 순서

1. backend에 `@langchain/openai`, `@langchain/core`, `zod`가 있는지 확인한다.
2. `OpenAiAgentLlmProvider`가 `ChatOpenAI.withStructuredOutput()` 기반인지 확인한다.
3. 기존 `AgentLlmProvider` interface와 `AgentModelDecision` 타입이 유지되는지 확인한다.
4. `agent-llm.provider.spec.ts`가 LangChain mock 방식이며 실제 API key를 쓰지 않는지 확인한다.
5. 기존 `agent.service.spec.ts`, `agent-mcp-caller.service.spec.ts`가 그대로 통과하는지 확인한다.
6. 검증 명령 4개를 모두 통과시킨다.

---

## 8. 인수 기준

- `backend/package.json`에 LangChain 관련 dependency가 추가되어 있다.
- Agent의 외부 API와 DB schema는 변경되지 않았다.
- `AgentService`에 LangChain import가 없다.
- Agent loop는 여전히 MCP caller를 통해서만 tool을 호출한다.
- `video.retryProcessing`은 자동 Agent loop에서 계속 제외되어 있다.
- 모든 자동 테스트는 실제 API key 없이 통과한다.
- 문서에서 “LangChain은 LLM decision adapter로 제한 사용”이라는 설계가 유지된다.
