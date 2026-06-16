# Phase 8. RAG 근거 후보 구현 정리

> 브랜치: `feature/jiseob/phase8-rag-evidence`  
> 기준 단계: `arena_implementation_plan.md`의 Phase 8  
> 목표: 사실 주장 댓글에 대해 영상 자막 청크 기반 근거 후보를 자동 생성하고 별도 API로 조회한다.

---

## 1. 이번 단계에서 추가한 것

Phase 8에서는 Phase 7의 댓글 분석 결과 위에 RAG 근거 후보 검색을 연결했다.

핵심 원칙:

```text
RAG 결과는 참/거짓 판정이 아니라 관련 있을 수 있는 자막 근거 후보다.
```

댓글 분석이 성공하고 `commentType=FACT_CLAIM`이면 `ragStatus=PENDING`으로 저장한 뒤 서버 내부 비동기 작업으로 RAG 검색을 시도한다.

```text
댓글 분석 SUCCESS
→ FACT_CLAIM 여부 확인
→ ragStatus=PENDING
→ 댓글 embedding 생성
→ transcript_chunks pgvector similarity search
→ RagEvidence 최신 결과 저장
```

사용자의 “근거 후보 보기” 동작은 이미 생성된 evidence를 조회만 한다. MVP에서는 조회 API가 RAG 생성이나 재실행을 트리거하지 않는다.

---

## 2. 추가한 DB 구조

새 migration:

```text
backend/src/database/migrations/2026061402000-CreateRagEvidences.ts
```

추가 테이블:

- `rag_evidences`

주요 컬럼:

- `comment_id`: 근거 후보가 연결된 댓글
- `transcript_chunk_id`: 근거 후보로 선택된 자막 청크
- `evidence_text`: 사용자에게 보여줄 자막 청크 텍스트 스냅샷
- `similarity_score`: `1 - cosineDistance`로 계산한 유사도

`comment_analyses`에는 RAG 전용 실패 정보를 추가했다.

- `rag_error_code`
- `rag_error_message`

기존 `error_code`, `error_message`는 댓글 분석 실패 사유 전용으로 유지한다.

---

## 3. 검색 정책

기본 검색은 pgvector cosine distance 기반 exact search로 시작한다.

```text
similarity = 1 - cosineDistance
topK = 3
similarityThreshold = 0.70
```

정책:

- threshold 미만 결과는 저장하지 않는다.
- threshold 이상 결과가 없으면 `ragStatus=NO_RESULT`로 처리한다.
- 근거 후보는 최신 결과만 유지한다.
- 댓글 재분석, 재검색, 영상 재처리 시 기존 evidence는 hard delete한다.
- 운영 런타임에서는 mock evidence를 사용자에게 반환하지 않는다.
- 자동 테스트에서만 provider와 검색 결과를 mock한다.

---

## 4. 상태 전이

```text
FACT_CLAIM 분석 성공
→ ragStatus=PENDING
```

RAG 처리 결과:

```text
영상 embedding 처리 중       → PENDING 유지
근거 후보 있음              → SUCCESS
threshold 이상 후보 없음    → NO_RESULT
자막 없음 / embedding 실패   → FAILED
```

영상 transcript 또는 embedding을 재처리하면 연결된 댓글의 기존 evidence를 삭제하고 `FACT_CLAIM` 분석 결과를 다시 `PENDING`으로 돌린다. embedding 재생성이 성공하면 해당 video의 pending/failed RAG 대상 댓글을 다시 enqueue한다.

---

## 5. API

```http
GET /api/v1/comments/:commentId/evidences
```

특징:

- 비회원도 조회할 수 있다.
- 이미 생성된 evidence만 반환한다.
- RAG 생성이나 재실행을 트리거하지 않는다.
- 삭제된 댓글 또는 삭제된 게시글의 evidence는 노출하지 않는다.

응답 요약:

```text
commentId
ragStatus
evidenceCount
ragErrorCode
ragErrorMessage
evidences[]
```

`evidences[]`에는 evidence text, transcript chunk id, similarity score, 자막 시작/종료 시간이 포함된다.

---

## 6. Smoke test 기준

자동 테스트는 실제 API key와 외부 네트워크에 의존하지 않는다.

실제 provider smoke test는 아래 고정 영상으로 별도 수행한다.

```text
YouTube metadata smoke videoId: jNQXAC9IVRw
Transcript/RAG smoke videoId: uehJDFfKMpU
```

실제 API key 또는 네트워크 권한이 준비되지 않은 환경에서는 smoke test를 완료 조건에 포함하지 않고, provider smoke 미검증 상태로 기록한다.

---

## 7. 테스트 추가

추가 테스트:

- FACT_CLAIM 댓글만 RAG 실행 대상
- 비사실 주장 댓글은 `NOT_REQUIRED`
- embedding 처리 중이면 `PENDING` 유지
- transcript 없음 또는 embedding provider 실패 시 `FAILED`
- threshold 이상 결과가 없으면 `NO_RESULT`
- 성공 시 기존 evidence 삭제 후 최신 결과 저장
- GET evidences는 조회만 수행하고 RAG를 트리거하지 않음
- 영상 재처리 시 관련 evidence와 evidenceCount 초기화

자동 테스트는 embedding provider와 pgvector query 결과를 mock한다.

---

## 8. 다음 단계

다음은 Phase 9 `MCP Agent Tool Server 구현`이다.

Phase 9에서 이어받을 핵심:

- Agent가 사용할 수 있는 tool boundary를 McpModule로 제공한다.
- RAG evidence와 transcript chunk 검색 결과는 Agent 답변의 근거 후보로 재사용할 수 있다.
- MCP tool response에도 API key, raw provider error, stack trace를 노출하지 않는다.
