# Phase 9. MCP Agent Tool Server 구현 정리

> 브랜치: `feature/jiseob/phase9-mcp-agent-tool-server`  
> 기준 단계: `arena_implementation_plan.md`의 Phase 9  
> 목표: AI Agent가 안전하게 호출할 수 있는 tool boundary를 JSON-RPC 기반으로 제공한다.

---

## 1. 이번 단계에서 추가한 것

Phase 9에서는 Arena의 기존 게시판/영상/RAG 기능을 Agent가 호출할 수 있는 MCP tool 계층으로 감쌌다.

핵심 원칙:

```text
MCP는 사용자 공개 REST API가 아니라 Agent가 호출할 tool boundary다.
```

게시글 작성, 영상 처리, RAG 생성 같은 제품 기본 흐름은 기존 서비스가 계속 담당한다. MCP는 이 흐름을 대체하지 않고, Agent가 필요한 정보를 조회하거나 제한된 재시도를 요청할 수 있게 해주는 얇은 wrapper 역할만 한다.

```text
Agent 또는 인증된 tool caller
→ POST /api/v1/mcp
→ JSON-RPC tools/list 또는 tools/call
→ McpModule
→ 기존 VideosService / PostsService / provider / pgvector search
```

새 DB 테이블이나 migration은 추가하지 않았다.

---

## 2. JSON-RPC Endpoint

추가한 endpoint:

```http
POST /api/v1/mcp
```

요청 형식:

```json
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "method": "tools/call",
  "params": {
    "name": "post.getContext",
    "arguments": {
      "postId": "..."
    }
  }
}
```

지원 method:

- `tools/list`: 등록된 tool 목록과 input/output schema를 반환한다.
- `tools/call`: tool name과 arguments로 allowlist에 등록된 tool만 실행한다.

프로토콜 오류와 tool 실행 오류는 JSON-RPC error envelope로 반환한다. provider raw error, stack trace, API key, token, cookie 값은 응답에 포함하지 않는다.

---

## 3. 제공하는 Tools

### `youtube.fetchMetadata`

- input: `youtubeVideoId`
- 실제 YouTube Data API provider를 호출한다.
- DB를 수정하지 않고 조회 결과만 반환한다.
- 과제의 “최소 1개 이상의 실제 외부 서비스 연동” 요구를 충족하는 tool이다.

### `video.getProcessingStatus`

- input: `videoId`
- metadata, transcript, embedding 처리 상태와 정제된 error 정보를 반환한다.
- 영상 처리가 실패했을 때 Agent가 사용자에게 현재 상태를 설명하는 데 사용한다.

### `video.retryProcessing`

- input: `videoId`
- write 성격의 tool이다.
- 게시글 작성자 또는 `ADMIN`만 호출할 수 있다.
- `metadataStatus`, `transcriptStatus`, `embeddingStatus` 중 하나라도 `FAILED`일 때만 허용한다.
- `transcriptStatus=NOT_AVAILABLE`은 자막 부재가 확정된 상태이므로 retry 허용 조건에 포함하지 않는다.
- 성공하면 기존 `VideoProcessingService`의 비동기 처리 흐름을 다시 시작한다.

### `post.getContext`

- input: `postId`
- 게시글 제목, 본문, 태그, 카운터, 작성자 표시 정보, video 요약 정보를 반환한다.
- Phase 10 Agent가 게시글 맥락을 먼저 이해하기 위한 기본 tool이다.

### `transcript.searchChunks`

- input: `postId`, `query`, optional `limit`
- OpenAI embedding provider로 query embedding을 만들고, `transcript_chunks.embedding`에 대해 pgvector cosine similarity search를 수행한다.
- 기본 `limit=5`, 최대 `limit=10`, similarity threshold `0.70`을 사용한다.
- similarity는 Phase 8 RAG와 같이 `1 - cosineDistance`로 계산한다.
- RAG evidence를 저장하지 않고, Agent가 참고할 검색 결과만 즉시 반환한다.

---

## 4. 보안과 권한 판단

MCP endpoint는 `JwtAuthGuard`를 사용한다.

```text
Authorization: Bearer <accessToken>
```

CSRF guard는 적용하지 않았다. 이유는 현재 access token을 cookie에서 자동으로 읽지 않고, Authorization header에서만 읽기 때문이다. CSRF는 브라우저가 자동으로 붙여 보내는 cookie 인증 정보를 악용하는 공격을 막는 방어다. Bearer token 기반 endpoint에서는 공격자가 token 값을 모르면 Authorization header를 만들 수 없으므로 위험 모델이 다르다.

반대로 게시글 작성, 댓글 작성, 일반 영상 retry 같은 사용자 화면의 state-changing REST API는 기존처럼 `JwtAuthGuard + CsrfGuard`를 유지한다.

정리하면 다음과 같다.

```text
사용자 화면 REST write API  → JWT + CSRF
MCP Agent tool endpoint     → Bearer JWT
```

나중에 access token을 cookie에서 읽도록 바꾸거나 MCP endpoint를 브라우저 사용자 액션 API처럼 공개하면, MCP에도 CSRF 또는 internal-only 인증 정책을 다시 검토해야 한다.

---

## 5. 모듈 의존성

MCP는 기존 도메인 서비스를 감싸는 방향으로만 의존한다.

```text
McpModule → VideosModule
McpModule → PostsModule
McpModule → AiModule
```

반대 방향인 `VideosModule -> McpModule`은 만들지 않는다. 이렇게 해야 영상 처리 기본 흐름이 MCP나 Agent 없이도 계속 동작하고, Phase 10에서 Agent를 붙일 때도 순환 의존을 피할 수 있다.

---

## 6. 테스트 추가

추가/수정한 테스트:

- `tools/list`가 등록된 tool schema를 반환한다.
- `tools/call`이 tool name과 arguments로 등록된 tool을 실행한다.
- 알 수 없는 method/tool은 JSON-RPC error로 반환된다.
- provider 실패 응답에 raw error가 섞이지 않는다.
- `transcript.searchChunks`가 pgvector query, limit, threshold를 적용한다.
- `transcript.searchChunks`는 transcript/embedding이 준비되지 않으면 tool error를 반환한다.
- 영상 retry는 작성자 또는 `ADMIN`만 가능하다.
- 영상 retry는 retryable failure가 있을 때만 가능하다.
- `transcriptStatus=NOT_AVAILABLE`은 단독 retry 사유가 아니다.

검증한 명령:

```bash
pnpm.cmd typecheck
pnpm.cmd --filter @arena/backend test --runInBand
pnpm.cmd lint
pnpm.cmd format:check
```

---

## 7. 다음 단계

다음 구현 권장 순서는 Phase 9.5 `MCP Protocol Alignment` 이후 Phase 10 `AI Agent 추론 루프 구현`이다.

Phase 9.5에서 이어받을 핵심:

- JSON-RPC envelope은 유지한다. envelope은 Agent와 tool 사이의 표준 호출 외피이며, 일반 domain service 호출을 전부 대체하려는 구조가 아니다.
- 현재 `tools/list`는 배열을 직접 반환하므로 `{ tools: [...] }` 형태로 감싼다.
- 현재 `tools/call`은 raw result를 직접 반환하므로 `content`, `structuredContent`, `isError`를 포함한 MCP tool result 형태로 감싼다.
- tool 실행 실패는 가능하면 `isError: true` tool result로 반환하고, malformed request나 unknown method 같은 protocol 오류만 JSON-RPC error로 반환한다.
- request id는 string 또는 number만 허용하도록 정리한다.

세부 계획은 `phase9_5_mcp_protocol_alignment.md`를 따른다.

Phase 10에서 이어받을 핵심:

- Agent는 `tools/list`로 사용할 수 있는 tool을 확인한다.
- Agent는 domain service를 직접 호출하지 않고 `McpServerService.handleRequest()`에 JSON-RPC envelope을 넘겨 `tools/call`을 호출한다.
- Agent run에는 tool call 결과와 실패를 step 단위로 저장한다.
- Phase 10 자동 Agent loop는 읽기 tool 중심으로 시작하고, `video.retryProcessing` 같은 write tool은 별도 사용자 승인 흐름이 생기기 전까지 기본 allowlist에서 제외한다.
- Agent가 tool을 반복 호출하지 않도록 최대 step 수, timeout, 반복 호출 방지 정책을 둔다.
- Agent 답변은 MCP/RAG 결과를 근거 후보로 설명하되 참/거짓 단정처럼 표현하지 않는다.

세부 계획은 `phase10_ai_agent_loop_plan.md`를 따른다.
