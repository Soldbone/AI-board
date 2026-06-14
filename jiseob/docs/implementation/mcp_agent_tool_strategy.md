# MCP Agent Tool 전략

> 목표: 과제 요구사항의 MCP와 AI Agent를 Arena 구조에 어떻게 반영할지 정리한다.

---

## 1. 과제 요구사항 해석

첨부 과제 요구사항은 AI 활용 기능으로 RAG, MCP, AI Agent를 모두 요구한다.

MCP 요구사항의 핵심:

- LLM이 외부 시스템을 호출할 수 있게 한다.
- MCP Server를 구현한다.
- JSON-RPC 기반 요청/응답을 처리한다.
- 최소 1개 이상의 실제 외부 서비스와 연동한다.
- API key와 권한 관리 전략을 포함한다.

AI Agent 요구사항의 핵심:

- Agent가 스스로 도구를 선택하고 실행하는 추론 루프를 관리한다.
- Function Calling을 사용한다.
- Memory 또는 State를 관리한다.
- LangGraph 또는 유사 구조를 고려한다.
- 무한 루프 방지와 예외 처리를 설계한다.

---

## 2. Arena의 결정

Arena에서 MCP는 일반 제품 흐름의 필수 호출 경로가 아니라, **Agent에게 제공하는 Tool 계층**으로 둔다.

즉, 게시글 작성 직후 영상 처리 흐름은 기존처럼 NestJS service가 직접 처리한다.

```text
Post 생성
→ VideoProcessingService
→ provider adapter
→ YouTube Data API / transcript CLI / OpenAI API
→ DB 상태 저장
```

반면 Agent 기능에서는 MCP tool을 통해 같은 기능을 선택적으로 호출한다.

```text
사용자 Agent 요청
→ AgentService
→ LLM Function Calling
→ JSON-RPC envelope 기반 MCP tool 선택
→ McpModule tools/call
→ 기존 service / provider adapter
→ DB 또는 외부 API
```

이렇게 나누는 이유:

- 기본 게시판 기능과 영상 처리 기능은 Agent 없이도 안정적으로 동작해야 한다.
- MCP는 과제 요구사항의 “LLM이 외부 시스템을 호출하는 도구 계층”으로 명확히 설명할 수 있다.
- Phase 6의 provider adapter를 재사용할 수 있어 중복 구현을 줄인다.
- 나중에 외부 tool을 늘려도 Agent와 domain service의 경계가 무너지지 않는다.

여기서 JSON-RPC envelope은 tool 호출 내용을 감싸는 표준 외피다.

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

이 envelope은 모든 내부 service 호출을 복잡하게 만들기 위한 구조가 아니다. 일반 제품 흐름은 기존 service를 직접 호출하고, Agent가 tool을 사용할 때만 MCP envelope을 사용한다. 이렇게 해야 tool allowlist, argument validation, 권한 context, error sanitation, tool trace 저장을 같은 경계에서 처리할 수 있다.

---

## 3. MCP Tool 후보

MVP에서 우선순위가 높은 tool:

```text
youtube.fetchMetadata
- input: youtubeVideoId
- output: title, channelTitle, thumbnailUrl, publishedAt, youtube statistics
- external service: YouTube Data API v3
- side effect: 없음. DB를 수정하지 않는다.

video.getProcessingStatus
- input: videoId
- output: metadataStatus, transcriptStatus, embeddingStatus, errorCode/errorMessage

video.retryProcessing
- input: videoId
- output: accepted, current status
- 권한: 게시글 작성자 또는 관리자
- 조건: metadataStatus, transcriptStatus, embeddingStatus 중 하나라도 FAILED

post.getContext
- input: postId
- output: post title/body/tags/video summary/comment count

transcript.searchChunks
- input: postId, query, limit
- output: related transcript chunks
- search: pgvector similarity search
- default: limit 5, max 10, threshold 0.70, similarity = 1 - cosineDistance
```

과제의 “최소 1개 이상의 실제 외부 서비스 연동”은 `youtube.fetchMetadata`로 충족한다. 이 tool은 내부적으로 Phase 6의 `YoutubeMetadataProvider`를 재사용하고, API key는 서버 환경변수에서 읽는다.

---

## 4. Agent 기능 후보

MVP Agent는 “토론 보조 Agent”로 시작한다.

사용자가 게시글 화면에서 질문을 입력하면 Agent는 다음 tool 중 필요한 것을 선택한다.

```text
post.getContext
video.getProcessingStatus
transcript.searchChunks
youtube.fetchMetadata
```

답변 예시:

- 영상 또는 게시글 맥락 요약
- 댓글 논쟁에서 확인할 만한 자막 구간 제안
- 영상 처리가 실패한 경우 현재 실패 상태 설명
- 메타데이터가 부족한 경우 YouTube metadata 재조회

초기 Agent는 게시글 작성, 댓글 작성, 삭제 같은 write action을 자동 수행하지 않는다. `video.retryProcessing` 같은 write 성격의 tool은 명시적 사용자 요청과 권한 확인이 있을 때만 허용한다.

Phase 10 MVP의 자동 Agent loop에서는 다음 읽기 tool만 기본 allowlist에 둔다.

```text
post.getContext
video.getProcessingStatus
transcript.searchChunks
youtube.fetchMetadata
```

`video.retryProcessing`은 tool server에는 존재하지만, 별도 확인 UI나 사용자 승인 흐름이 생기기 전까지 Agent 자동 loop의 기본 allowlist에 포함하지 않는다.

---

## 5. 보안과 권한 관리

API key 정책:

- `YOUTUBE_API_KEY`, `OPENAI_API_KEY`는 서버 `.env` 또는 배포 secret에만 저장한다.
- API key를 MCP tool argument로 받지 않는다.
- API key를 Agent prompt, Agent memory, tool response, 로그에 남기지 않는다.

권한 정책:

- MCP Server는 공개 사용자 API처럼 열지 않는다.
- Phase 9에서는 `POST /api/v1/mcp` HTTP JSON-RPC endpoint를 두고 `Authorization: Bearer` access token을 요구한다.
- AgentService 또는 인증된 tool caller만 MCP tool을 호출할 수 있게 한다.
- tool 호출에는 현재 사용자 context를 전달한다.
- 읽기 tool은 공개 게시글과 접근 가능한 리소스로 제한한다.
- write tool은 게시글 작성자 또는 관리자 권한을 확인한다.
- `video.retryProcessing`은 권한 조건을 만족해도 metadata/transcript/embedding 중 하나라도 `FAILED`인 경우에만 허용한다.

CSRF 정책:

- 일반 사용자 화면의 state-changing REST API는 기존처럼 `JwtAuthGuard + CsrfGuard`를 사용한다.
- MCP endpoint는 Bearer token 기반 tool boundary이므로 Phase 9에서는 `JwtAuthGuard`만 적용한다.
- 현재 access token은 cookie에서 자동 전송되지 않고 Authorization header에서만 읽는다.
- 악성 사이트는 사용자의 Bearer token 값을 모르면 Authorization header를 만들 수 없으므로 CSRF 위험 모델이 cookie 인증 API와 다르다.
- 나중에 access token을 cookie에서 읽도록 바꾸거나 MCP를 브라우저 사용자 액션 API로 공개하면 CSRF 또는 internal-only 인증 정책을 재검토한다.

입력 검증:

- `youtube.fetchMetadata`는 URL 전체가 아니라 검증된 `youtubeVideoId`를 받는다.
- 임의 URL fetch tool은 MVP에서 제공하지 않는다.
- tool argument는 DTO 또는 schema로 검증한다.

오류 노출:

- provider raw error는 사용자에게 그대로 반환하지 않는다.
- tool response는 `errorCode`, `errorMessage` 형태로 정제한다.
- stack trace, 내부 URL, API key, cookie 값은 response에 포함하지 않는다.

Agent loop 제한:

- 최대 step 수를 둔다.
- tool별 timeout을 둔다.
- 같은 tool과 같은 argument를 반복 호출하지 않도록 guard를 둔다.
- tool 실패 시 무한 retry하지 않고 관찰 결과로 남긴 뒤 답변을 종료할 수 있게 한다.

---

## 6. Phase 배치

현재 Phase 6은 영상 처리 provider adapter와 DB 상태 저장을 구현한다.

이후 순서는 다음을 기준으로 한다.

```text
Phase 7: AI 댓글 분석
Phase 8: RAG 근거 후보
Phase 9: MCP Agent Tool Server
Phase 9.5: MCP Protocol Alignment
Phase 10: AI Agent 추론 루프
Phase 11: 댓글 스레드 요약
Phase 12: 관리자 기능
```

MCP와 Agent는 RAG 이후에 붙인다. Agent가 의미 있는 tool 선택을 하려면 게시글 context, 영상 처리 상태, transcript chunk, RAG 검색 기반이 먼저 필요하기 때문이다.

Phase 9.5에서 MCP endpoint의 응답 shape를 공식 MCP tools 구조에 더 가깝게 맞췄다. `tools/list`는 `{ tools: [...] }`를 반환하고, `tools/call`은 `content`, `structuredContent`, `isError`를 포함하는 tool result를 반환한다. 자세한 구현 내용은 `phase9_5_mcp_protocol_alignment.md`를 따른다.

Phase 10에서는 Agent run 생성/조회 API, AgentRun/AgentStep 저장, LLM function calling, MCP tool caller, max step/timeout/retry guard를 구현한다. 자세한 구현 계획은 `phase10_ai_agent_loop_plan.md`를 따른다.
