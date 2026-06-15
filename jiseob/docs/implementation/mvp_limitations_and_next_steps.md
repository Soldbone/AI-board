# MVP 한계와 개선 방향

> 기준: Phase 13 완료 backend MVP
> 목적: 현재 구현의 의도적 범위 결정과 운영 고도화 방향을 과장 없이 정리한다.

---

## 1. 현재 MVP 범위 결정

- Arena MVP는 backend API 중심으로 구현되어 있다.
- frontend는 placeholder 상태이며 실제 사용자 화면은 아직 구현되지 않았다.
- YouTube metadata, transcript, embedding, AI 댓글 분석, RAG, Agent, 요약은 외부 provider 또는 내부 비동기 작업에 의존한다.
- 외부 provider 실패는 게시글/댓글 작성 실패로 묶지 않고 상태값과 정제된 오류 메시지로 표현한다.

---

## 2. 서버 내부 비동기 작업

현재 비동기 작업은 Redis/BullMQ 없이 서버 내부 fire-and-forget 방식으로 시작한다.

대상:

- 영상 metadata/transcript/embedding 처리
- 댓글 AI 분석
- FACT_CLAIM 댓글 RAG 검색
- Agent run 실행
- 댓글 스레드 요약 생성

한계:

- 서버 재시작 시 아직 실행되지 않았거나 진행 중인 작업이 유실될 수 있다.
- 여러 backend instance로 scale-out하면 작업 중복과 lock 정책을 더 정교하게 다뤄야 한다.
- 실패 작업 관찰, 재시도 backoff, dead letter queue가 없다.

개선 방향:

- PostgreSQL `jobs` table로 MVP 친화적인 durable job queue를 먼저 검토한다.
- 운영 scale-out 단계에서는 Redis/BullMQ를 검토한다.
- 작업별 retry count, next run time, last error code, idempotency key를 저장한다.

---

## 3. AI / RAG 한계

- AI 댓글 분석은 댓글 유형과 moderation 보조 정보다.
- RAG는 관련 있을 수 있는 자막 구간 후보를 찾는 기능이다.
- Agent 답변은 도구 결과를 바탕으로 한 토론 보조 설명이다.
- 이 세 기능은 사실 여부의 최종 판정자가 아니다.

한계:

- 자막이 없거나 embedding이 실패하면 근거 후보를 제공할 수 없다.
- similarity threshold 이상 결과가 없으면 `NO_RESULT`가 될 수 있다.
- LLM provider 응답은 비용, timeout, rate limit, 모델 변경의 영향을 받는다.
- 댓글 요약은 입력 길이 제한이 있고, 삭제/수정 이후 stale 상태가 될 수 있다.

개선 방향:

- 사용자 UI에서 “근거 후보”, “관련 있을 수 있는 구간”, “한계”를 분리해 보여준다.
- 실제 provider smoke test를 자동 E2E와 분리해 운영 환경에서만 수행한다.
- RAG 품질 개선은 chunk 전략, embedding model, threshold, reranking을 별도 실험으로 다룬다.

---

## 4. YouTube transcript provider

현재 transcript 수집은 `youtube-transcript-api` CLI 기반이다.

한계:

- 공식 YouTube Data API의 transcript 제공 한계를 우회하기 위한 MVP 선택이다.
- YouTube 측 차단, 응답 구조 변경, cloud IP 제한에 영향을 받을 수 있다.
- 영상에 자막이 없거나 언어가 맞지 않으면 `NOT_AVAILABLE` 또는 `FAILED` 상태가 된다.

개선 방향:

- provider adapter boundary는 유지하고 대체 transcript provider를 추가할 수 있게 한다.
- 운영에서는 provider별 실패율과 error code를 수집한다.
- 필요 시 사용자 업로드 자막, 수동 transcript 보정, 공식 caption 권한 연동을 별도 phase로 검토한다.

---

## 5. Frontend

현재 frontend는 Vite/React placeholder다.

한계:

- 실제 게시글 목록, 상세, 댓글, evidence, Agent, admin 화면은 없다.
- 현재 데모는 backend API 또는 E2E 테스트 중심으로 진행해야 한다.

개선 방향:

- 게시글 목록/상세와 인증 UI를 먼저 구현한다.
- 댓글 thread와 evidence drawer를 붙인다.
- Agent run은 polling 기반으로 시작하고, 운영 고도화 시 SSE/WebSocket을 검토한다.
- Admin UI는 `NEEDS_REVIEW` 댓글 목록과 삭제/retry action부터 작게 만든다.

---

## 6. 테스트와 운영 검증

현재 E2E는 외부 network/API key에 의존하지 않는다.

한계:

- E2E mock은 provider integration 자체를 검증하지 않는다.
- 실제 provider smoke test는 API key, 비용, 네트워크, provider 상태에 영향을 받는다.
- performance, load, browser UI test는 아직 없다.

개선 방향:

- `pnpm.cmd test:e2e`는 정책 회귀 방지용으로 유지한다.
- provider smoke test는 별도 환경과 명시적 opt-in으로 실행한다.
- frontend 구현 이후 Playwright browser flow를 추가한다.
- 운영 전에는 structured logging, request id, job status dashboard를 검토한다.

---

## 7. 보안 / 권한 개선 방향

현재 정책:

- REST write API는 `JwtAuthGuard + CsrfGuard`를 사용한다.
- MCP endpoint는 Bearer access token 기반 tool boundary로 CSRF guard를 적용하지 않는다.
- tool response와 Agent trace는 민감한 key를 sanitize한다.

추가 개선:

- access token 저장/전달 방식이 cookie 기반으로 바뀌면 MCP CSRF 정책을 재검토한다.
- admin audit log를 추가한다.
- provider error sanitation test를 더 넓힌다.
- rate limit, request body size limit, abuse detection을 운영 phase에서 추가한다.
