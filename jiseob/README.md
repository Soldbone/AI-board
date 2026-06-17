# Arena

## 1. 프로젝트 개요

Arena는 유튜브 영상을 중심으로 토론하는 AI 보조 게시판입니다.

사용자는 유튜브 링크를 포함한 게시글을 작성하고, 다른 사용자는 댓글과 대댓글로 토론합니다. 시스템은 YouTube 메타데이터와 자막을 수집하고, 댓글이 사실 주장으로 분류되면 자막 기반 RAG 검색으로 관련 근거 후보를 제공합니다. 게시글 상세에서는 Agent에게 영상과 토론 맥락에 대한 질문을 할 수 있고, 충분히 긴 댓글 스레드는 AI 요약을 생성할 수 있습니다.

이 프로젝트의 AI는 사용자를 대신해 결론을 내리거나 참/거짓을 판정하는 역할이 아닙니다. 영상 자막, 댓글 흐름, 처리 상태, 한계를 분리해서 보여주며 토론 맥락 이해를 돕는 보조 레이어로 설계했습니다.

기술 스택은 React/Vite, NestJS, TypeScript, TypeORM, PostgreSQL + pgvector, JWT, CSRF 보호, LangChain `ChatOpenAI.withStructuredOutput()` 기반 adapter입니다. 패키지 관리는 pnpm workspace로 구성합니다.

## 2. 주요 구현 기능

- 회원가입, 로그인, access token, refresh token cookie, CSRF 보호
- 내 정보 조회와 회원 탈퇴
- 게시글 CRUD, soft delete, 검색, 태그 필터, 정렬, 페이지네이션
- YouTube URL 기반 게시글 작성과 Video row 재사용
- YouTube metadata, transcript, embedding 처리 상태 관리
- 서버 내부 비동기 영상 처리와 실패 retry
- 댓글과 대댓글 작성, 수정, 삭제
- 최대 2단계 댓글 구조와 삭제 댓글 placeholder 표시
- 게시글 댓글 수, 좋아요 수, 조회수 파생 카운터 관리
- 댓글 작성/수정 후 AI 댓글 유형 분석
- `FACT_CLAIM` 댓글에 대한 pgvector 기반 RAG 근거 후보 검색
- 댓글별 RAG 근거 후보 조회 API
- MCP JSON-RPC endpoint와 Agent tool boundary
- MCP tool을 사용하는 Agent run 생성/조회
- LangChain structured output 기반 Agent LLM adapter
- 루트 댓글 스레드 AI 요약 생성/조회
- 관리자용 주의 필요 댓글 조회, 삭제, 실패한 AI 분석 retry
- React 사용자 화면: 게시글 목록/상세/작성/수정, 인증, 댓글, 근거 후보, Agent 질문, 관리자 검토
- backend unit test와 HTTP E2E 테스트 하네스

## 3. 전체 아키텍처 구조

```text
jiseob/
  frontend/
    src/App.tsx                         React/Vite 사용자 화면
    src/api/                             REST API client와 응답 타입
    src/components/ui/                   shadcn/ui 기반 공통 UI
    src/styles/                          전역 스타일
  backend/
    src/auth/                            인증, JWT, refresh session
    src/users/                           사용자 조회와 탈퇴
    src/posts/                           게시글, 태그, 좋아요, 조회수
    src/comments/                        댓글, 대댓글, 근거 후보 조회
    src/videos/                          YouTube metadata/transcript/embedding 처리
    src/ai/comment-analysis/             댓글 유형 분석과 moderation 상태
    src/ai/rag/                          RAG 근거 후보 저장/조회
    src/ai/summary/                      댓글 스레드 요약
    src/mcp/                             JSON-RPC MCP server와 tools
    src/agent/                           Agent run, step, LLM decision loop
    src/admin/                           관리자 댓글 검토
    src/database/                        TypeORM config, migration, seed
  docker/
    postgres/init/                       pgvector extension 초기화
  docs/                                  API, ERD, runbook, 데모, 구현 문서
```

런타임 흐름은 다음과 같습니다.

```text
React frontend
  -> NestJS REST API
  -> TypeORM
  -> PostgreSQL + pgvector

게시글 작성
  -> Post/Video 저장
  -> PENDING 상태로 즉시 응답
  -> 서버 내부 비동기 metadata/transcript/embedding 처리

댓글 작성
  -> Comment 저장
  -> AI 댓글 유형 분석
  -> FACT_CLAIM이면 RAG 근거 후보 검색
  -> 댓글 목록에는 AI 상태 요약만 표시
  -> 근거 상세는 별도 API로 조회

Agent 질문
  -> AgentRun 생성
  -> LLM decision
  -> MCP tools/call
  -> tool result와 한계를 모아 답변 저장
```

주요 데이터 모델은 `User`, `AuthSession`, `Post`, `PostLike`, `Tag`, `Video`, `TranscriptChunk`, `Comment`, `CommentAnalysis`, `RagEvidence`, `AgentRun`, `AgentStep`, `AiSummary`입니다. 주요 리소스 ID는 ULID를 사용하고, 게시글/댓글/사용자는 soft delete 정책을 따릅니다.

로컬 실행:

```powershell
cd C:\Users\1472e\Desktop\jungle\AI-board\jiseob
pnpm.cmd install
pnpm.cmd db:up
pnpm.cmd --filter @arena/backend migration:run
pnpm.cmd dev
```

검증 명령:

```powershell
pnpm.cmd typecheck
pnpm.cmd --filter @arena/backend test --runInBand
pnpm.cmd test:e2e
pnpm.cmd lint
pnpm.cmd format:check
```

상세 실행 절차는 [Local Runbook](docs/operations/local_runbook.md), API 계약은 [Backend API](docs/api/backend_api.md), 데이터 모델은 [ERD](docs/database/erd.md)를 참고합니다.

## 4. 각 AI 활용 기능, 기술, 아키텍처 구조

### RAG

RAG는 사실 주장 댓글에 대해 영상 자막에서 관련 있을 수 있는 구간을 찾는 기능입니다.

- 모든 댓글에 RAG를 수행하지 않습니다.
- AI 댓글 분석 결과가 `FACT_CLAIM`인 댓글만 RAG 대상입니다.
- YouTube transcript를 청크로 나누고 embedding을 저장합니다.
- PostgreSQL pgvector similarity search를 사용합니다.
- similarity는 `1 - cosineDistance`로 계산합니다.
- 기본 threshold는 `0.70`입니다.
- 기본 topK는 댓글 근거 후보 3개입니다.
- threshold 이상 결과가 없으면 `NO_RESULT`로 기록합니다.
- 결과는 참/거짓 판정이 아니라 "근거 후보"로 표시합니다.

관련 API:

```http
GET /api/v1/comments/:commentId/evidences
```

관련 구현 위치:

- `backend/src/ai/comment-analysis/`
- `backend/src/ai/rag/`
- `backend/src/videos/transcript-chunking.service.ts`
- `backend/src/videos/providers/embedding.provider.ts`
- `backend/src/videos/entities/transcript-chunk.entity.ts`
- `backend/src/ai/rag/entities/rag-evidence.entity.ts`

### MCP

MCP는 Agent가 사용할 tool boundary입니다. 일반 사용자용 REST API를 모두 대체하지 않고, Agent가 필요한 기능을 제한된 allowlist로 호출할 때만 JSON-RPC endpoint를 통과합니다.

Endpoint:

```http
POST /api/v1/mcp
```

지원 method:

- `tools/list`
- `tools/call`

주요 tool:

- `post.getContext`: 게시글, 영상, 댓글 맥락 조회
- `video.getProcessingStatus`: 영상 처리 상태 조회
- `transcript.searchChunks`: 자막 청크 검색, 기본 `limit=5`, 최대 `limit=10`, threshold `0.70`
- `youtube.fetchMetadata`: YouTube metadata 조회, DB 수정 없음
- `video.retryProcessing`: 실패한 영상 처리 재시도, 게시글 작성자 또는 관리자만 허용

MCP 응답은 `content`, `structuredContent`, `isError` 구조를 사용합니다. protocol 오류는 JSON-RPC error envelope로 반환하고, provider/business failure는 정제된 `isError: true` tool result로 반환합니다.

관련 구현 위치:

- `backend/src/mcp/mcp.controller.ts`
- `backend/src/mcp/mcp-server.service.ts`
- `backend/src/mcp/tools/`
- `backend/src/mcp/mcp.validation.ts`
- `backend/src/mcp/mcp.types.ts`

### Agent

Agent는 게시글 상세 화면의 토론 보조자입니다. 사용자 대신 게시글이나 댓글을 작성하지 않고, 게시글 맥락, 영상 처리 상태, 자막 검색 결과를 바탕으로 질문에 답합니다.

Agent 흐름:

```text
POST /api/v1/posts/:postId/agent/runs
  -> AgentRun PENDING 생성
  -> RUNNING 전환
  -> LLM decision 생성
  -> 필요한 MCP tool 호출
  -> tool result를 AgentStep으로 저장
  -> 최종 answer, evidenceCandidates, limitations 저장

GET /api/v1/agent/runs/:runId
  -> run 상태, 답변, 사용 tool, 근거 후보, 한계 조회
```

운영 정책:

- 생성 API는 로그인 사용자와 CSRF를 요구합니다.
- run 조회는 생성자 본인만 허용합니다.
- 자동 loop 기본 allowlist는 `post.getContext`, `video.getProcessingStatus`, `transcript.searchChunks`, `youtube.fetchMetadata`입니다.
- `video.retryProcessing`은 자동 loop에 넣지 않습니다.
- 초기 loop 제한은 `maxSteps=4`, 전체 timeout 30초, tool timeout 10초입니다.
- API key, token, cookie, raw provider error, stack trace는 Agent step에 저장하지 않습니다.
- LangChain은 LLM decision provider 내부 adapter로만 사용하고, Agent 상태 머신과 MCP JSON-RPC boundary는 유지합니다.

관련 구현 위치:

- `backend/src/agent/agent.controller.ts`
- `backend/src/agent/agent.service.ts`
- `backend/src/agent/agent-llm.provider.ts`
- `backend/src/agent/agent-mcp-caller.service.ts`
- `backend/src/agent/entities/agent-run.entity.ts`
- `backend/src/agent/entities/agent-step.entity.ts`

### 댓글 스레드 요약

댓글 스레드 요약은 Agent loop가 아니라 별도의 AI 요약 기능입니다.

- 로그인 사용자가 요청할 때만 생성합니다.
- 루트 댓글 스레드 기준으로 최신 요약 1개를 유지합니다.
- 댓글 수가 10개 미만이면 생성하지 않습니다.
- 삭제된 댓글은 입력에서 제외합니다.
- 새 댓글이 추가되면 기존 요약을 stale 상태로 볼 수 있게 합니다.

관련 구현 위치:

- `backend/src/ai/summary/summary.controller.ts`
- `backend/src/ai/summary/summary.service.ts`
- `backend/src/ai/summary/openai-summary.provider.ts`
- `backend/src/ai/summary/entities/ai-summary.entity.ts`
