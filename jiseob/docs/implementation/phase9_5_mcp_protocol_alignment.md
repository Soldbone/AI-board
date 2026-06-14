# Phase 9.5. MCP Protocol Alignment 구현 정리

> 기준 브랜치: `feature/jiseob/phase9-mcp-agent-tool-server`  
> 목표: Phase 10 Agent 구현 전에 MCP JSON-RPC tool boundary를 공식 MCP tools 응답 형태에 더 가깝게 정렬한다.

---

## 1. 왜 Phase 9.5가 필요한가

Phase 9에서는 `POST /api/v1/mcp` endpoint와 `tools/list`, `tools/call` method를 구현했다. 이 구현은 이미 JSON-RPC envelope, tool registry, argument validation, 권한 context, provider error sanitation을 갖고 있다.

다만 현재 응답 shape는 Arena 내부 Agent가 사용하기에는 충분하지만, 공식 MCP tools 문서의 응답 형태와 완전히 같지는 않다. Phase 10 Agent가 이 경계를 의존하기 전에 응답 shape를 정리하면, 이후 Agent 구현과 테스트가 더 명확해진다.

---

## 2. Envelope의 의미

여기서 envelope은 실제 tool 호출 내용을 감싸는 JSON-RPC 표준 외피다.

직접 함수 호출:

```ts
searchTranscript({ postId, query, limit: 5 });
```

MCP JSON-RPC envelope 호출:

```json
{
  "jsonrpc": "2.0",
  "id": "run-step-1",
  "method": "tools/call",
  "params": {
    "name": "transcript.searchChunks",
    "arguments": {
      "postId": "01J00000000000000000000000",
      "query": "이 주장이 영상에서 언급되나요?",
      "limit": 5
    }
  }
}
```

이 구조는 억지 래핑이 아니다. Arena에서 MCP는 일반 service-to-service 호출 방식이 아니라, Agent와 도메인 기능 사이의 tool boundary다.

의미 있는 이유:

- Agent가 `PostsService`, `VideosService`, `AiService` 내부 구조를 직접 알지 않아도 된다.
- 모든 tool 호출이 `tools/list`, `tools/call`이라는 동일한 입구를 통과한다.
- tool allowlist, argument validation, 권한 context, error sanitation, audit log를 한 곳에서 다룰 수 있다.
- 나중에 내부 호출을 실제 MCP client/server transport로 바꿔도 Agent 쪽 변경을 줄일 수 있다.
- MCP가 잘 동작하는지 service 단위와 HTTP endpoint 단위에서 검증할 수 있다.

단, 이 envelope을 모든 내부 service 호출에 적용하지 않는다. 일반 제품 흐름은 기존 NestJS service를 직접 호출하고, Agent가 tool을 사용할 때만 MCP envelope을 사용한다.

---

## 3. Phase 9 기준 구현 상태

Phase 9 구현:

```text
POST /api/v1/mcp
→ McpController
→ McpServerService.handleRequest(body, context)
→ tools/list 또는 tools/call
→ tool wrapper
→ 기존 domain service/provider/pgvector query
```

Phase 9의 `tools/list` 응답:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": [
    {
      "name": "post.getContext",
      "description": "...",
      "inputSchema": { "type": "object", "properties": {} },
      "readOnly": true
    }
  ]
}
```

Phase 9의 `tools/call` 성공 응답:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "postId": "01J00000000000000000000000",
    "title": "..."
  }
}
```

Phase 9 기준 한계:

- `tools/list` result가 `{ "tools": [...] }`가 아니라 배열을 직접 반환한다.
- `tools/call` result가 MCP tool result wrapper 없이 raw object를 직접 반환한다.
- provider/business failure도 JSON-RPC error envelope로 반환한다.
- `JsonRpcId` 타입이 `null`을 허용한다.

---

## 4. 목표 응답 Shape

공식 MCP tools 문서 기준으로 Phase 9.5 구현 결과는 다음 형태다.

### `tools/list`

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "post.getContext",
        "description": "게시글 맥락을 조회합니다.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "postId": { "type": "string" }
          },
          "required": ["postId"]
        },
        "outputSchema": {
          "type": "object",
          "properties": {}
        }
      }
    ]
  }
}
```

pagination은 MVP에서 필요하지 않으므로 `nextCursor`는 생략한다. 나중에 tool 수가 많아지면 추가한다.

### `tools/call` 성공

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"postId\":\"01J00000000000000000000000\",\"title\":\"...\"}"
      }
    ],
    "structuredContent": {
      "postId": "01J00000000000000000000000",
      "title": "..."
    },
    "isError": false
  }
}
```

`structuredContent`는 Agent 코드가 안정적으로 파싱할 데이터다. `content`는 MCP client와 LLM이 읽을 수 있는 text representation이다.

### `tools/call` tool 실행 실패

provider 실패, 권한 실패, 비즈니스 조건 불충족처럼 tool을 실행했지만 결과가 실패인 경우:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "YouTube API key가 설정되지 않았습니다."
      }
    ],
    "structuredContent": {
      "errorCode": "MISSING_YOUTUBE_API_KEY",
      "errorMessage": "YouTube API key가 설정되지 않았습니다."
    },
    "isError": true
  }
}
```

unknown method, malformed JSON-RPC request, unknown tool name처럼 protocol 자체가 잘못된 경우에는 기존처럼 JSON-RPC error를 사용한다.

---

## 5. 구현 내용

1. `mcp.types.ts`
   - `JsonRpcId`를 `string | number`로 좁힌다.
   - JSON-RPC error 응답 id에는 `null`을 허용하는 별도 타입을 둔다.
   - `McpToolsListResult`를 추가한다.
   - `McpTextContent`, `McpToolCallResult`를 추가한다.
   - `McpToolDefinition`에는 `title`, `annotations`를 optional로 둘 수 있다.

2. `mcp-server.service.ts`
   - `tools/list` result를 `{ tools: this.listTools() }`로 감싼다.
   - tool 성공 결과를 `content`, `structuredContent`, `isError: false`로 감싼다.
   - tool 실행 실패를 JSON-RPC error 대신 `isError: true` tool result로 반환한다.
   - request id가 없거나 `null`이면 invalid request로 처리한다.
   - notification은 Phase 9.5 범위에서 지원하지 않는다.
   - tool list 응답에는 `annotations.readOnlyHint`를 포함한다.

3. `mcp-server.service.spec.ts`
   - `tools/list` shape 변경 테스트를 수정한다.
   - `tools/call` 성공 shape 변경 테스트를 수정한다.
   - provider failure가 `result.isError=true`로 반환되고 raw stack이 노출되지 않는지 확인한다.
   - `id=null` 또는 id 누락 요청의 처리 정책을 테스트한다.
   - 선택된 tool의 argument validation 실패가 `isError=true`로 반환되는지 확인한다.

4. HTTP endpoint 검증
   - `POST /api/v1/mcp`에 대한 controller 수준 테스트를 추가한다.
   - Bearer JWT 없으면 401을 반환한다.
   - 인증 context에서 `tools/list`, `tools/call` 성공 shape를 검증한다.

5. 문서 갱신
   - `phase9_mcp_agent_tool_server.md`
   - `mcp_agent_tool_strategy.md`
   - `arena_implementation_plan.md`

---

## 6. Phase 10에서 사용하는 방식

Phase 10 Agent는 domain service를 직접 호출하지 않는다. 대신 내부 메서드 호출로 `McpServerService.handleRequest()`에 JSON-RPC envelope을 넘긴다.

```ts
const response = await mcpServerService.handleRequest(
  {
    jsonrpc: '2.0',
    id: stepId,
    method: 'tools/call',
    params: {
      name: 'transcript.searchChunks',
      arguments: {
        postId,
        query,
        limit: 5,
      },
    },
  },
  { user },
);
```

HTTP self-call은 하지 않는다. 같은 서버 안에서 자기 자신에게 HTTP 요청을 보내면 인증, 네트워크, serialization 비용이 늘고 테스트가 불안정해진다. 내부 메서드 호출이어도 JSON-RPC envelope, tool registry, validation, 권한 context, error sanitation은 그대로 지나가므로 MCP boundary 검증 목적을 충족한다.

---

## 7. 완료 기준

Phase 9.5 완료 기준:

- `tools/list`가 `{ tools: [...] }` 형태로 반환된다.
- `tools/call` 성공 결과가 `content`, `structuredContent`, `isError: false`를 포함한다.
- tool 실행 실패는 정제된 `isError: true` 결과로 반환된다.
- protocol 오류는 JSON-RPC error envelope로 반환된다.
- request id는 string 또는 number만 허용한다.
- Agent 구현자는 domain service 대신 `McpServerService.handleRequest()`를 호출하도록 문서와 테스트에서 확인할 수 있다.
- `pnpm.cmd typecheck`
- `pnpm.cmd --filter @arena/backend test --runInBand`
- `pnpm.cmd lint`
- `pnpm.cmd format:check`

---

## 8. 이번 단계에서 하지 않는 것

- MCP lifecycle initialize/capability negotiation 전체 구현
- STDIO transport 구현
- SSE 또는 streamable HTTP transport 구현
- MCP resource/prompt 기능 구현
- 외부 community YouTube MCP server 의존
- Agent 추론 루프 구현

Arena MVP에서는 우선 tools 기능을 Agent boundary로 안정화하고, lifecycle/transport 확장은 제출 이후 고도화 후보로 둔다.

---

## 9. 참고 문서

- MCP Base Protocol 2025-11-25: `https://modelcontextprotocol.io/specification/2025-11-25/basic`
- MCP Tools 2025-11-25: `https://modelcontextprotocol.io/specification/2025-11-25/server/tools`
