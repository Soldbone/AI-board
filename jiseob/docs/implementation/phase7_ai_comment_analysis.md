# Phase 7. AI 댓글 분석 구현 정리

> 브랜치: `feature/jiseob/phase7-ai-comment-analysis`  
> 기준 단계: `arena_implementation_plan.md`의 Phase 7  
> 목표: 댓글 작성/수정 후 댓글 유형과 moderation 상태를 비동기로 분석한다.

---

## 1. 이번 단계에서 추가한 것

Phase 7에서는 댓글 저장 흐름 위에 AI 분석 상태를 얹었다.

핵심 원칙:

```text
댓글 작성/수정 성공 여부와 AI 분석 성공 여부를 분리한다.
```

댓글 또는 대댓글이 생성되면 같은 transaction 안에서 `CommentAnalysis` row를 먼저 `PENDING`으로 만든다. 이후 분석 실행은 서버 내부 비동기 호출로 처리한다.

```text
댓글 저장
→ CommentAnalysis PENDING 생성
→ 201 Created 응답 가능
→ CommentAnalysisService가 분석 실행
→ SUCCESS 또는 FAILED 상태 저장
```

---

## 2. 추가한 DB 구조

새 migration:

```text
backend/src/database/migrations/2026061401000-CreateCommentAnalyses.ts
```

추가 테이블:

- `comment_analyses`

주요 컬럼:

- `comment_id`: 분석 대상 댓글, 댓글 하나당 최신 분석 결과 하나
- `comment_type`: `FACT_CLAIM`, `OPINION`, `QUESTION`, `TOXIC`, `CHITCHAT`
- `ai_analysis_status`: `PENDING`, `SUCCESS`, `FAILED`
- `rag_status`: Phase 8 RAG 후보 상태
- `evidence_count`: 댓글 목록에서 근거 후보 수만 표시하기 위한 요약값
- `analyzed_at`: 분석 완료 또는 실패 시각
- `error_code`, `error_message`: 사용자에게 노출 가능한 정제된 실패 정보

`comments` 테이블에는 AI 분석 세부 결과를 denormalize하지 않고, 기존 `moderation_status`만 유지한다. 댓글 목록은 `comment_analyses`를 left join해서 AI 상태 요약을 내려준다.

---

## 3. Analyzer provider 결정

이번 단계에서는 실제 LLM API를 기본 경로로 사용하되, 실패 시 rule-based analyzer로 fallback한다.

구조:

```text
CommentAnalyzerProvider
└─ OpenAiCommentAnalyzerProvider
   └─ RuleBasedCommentAnalyzerProvider fallback
```

OpenAI provider는 Responses API와 structured output을 사용해 아래 값만 JSON으로 받는다.

```text
commentType
moderationStatus
```

fallback 조건:

- `OPENAI_API_KEY`가 없다.
- OpenAI API가 4xx/5xx를 반환한다.
- 요청 timeout이 발생한다.
- 응답 JSON이 기대한 schema와 다르다.

fallback을 두는 이유:

- 댓글 작성 API가 LLM 비용과 네트워크 상태에 묶이지 않는다.
- OpenAI API가 일시적으로 실패해도 댓글 분석 상태 흐름은 유지된다.
- 테스트는 실제 API key와 외부 네트워크에 의존하지 않고 provider를 mock할 수 있다.

환경 변수:

```env
OPENAI_API_KEY=
COMMENT_ANALYSIS_MODEL=gpt-4.1-mini
COMMENT_ANALYSIS_TIMEOUT_MS=8000
```

---

## 4. 분석 결과 정책

분석 성공 시:

- `aiAnalysisStatus=SUCCESS`
- `commentType` 저장
- `analyzedAt` 저장
- error 정보 초기화
- analyzer 결과에 따라 `comments.moderation_status` 업데이트

RAG 상태 정책:

```text
commentType=FACT_CLAIM → ragStatus=PENDING
그 외 commentType        → ragStatus=NOT_REQUIRED
```

이렇게 해서 Phase 8은 `FACT_CLAIM` 댓글만 RAG 근거 후보 검색 대상으로 가져갈 수 있다.

toxic 댓글 정책:

- 자동 삭제하지 않는다.
- `commentType=TOXIC`으로 저장한다.
- `moderationStatus=NEEDS_REVIEW`로 표시한다.
- 관리자 삭제 또는 재검토 API는 Phase 12 관리자 기능에서 확장한다.

분석 실패 시:

- 댓글 row는 유지한다.
- `aiAnalysisStatus=FAILED`
- `errorCode=COMMENT_ANALYSIS_FAILED`
- `errorMessage`에는 정제된 사용자 메시지만 저장한다.

단, OpenAI provider가 실패하고 rule-based fallback이 성공하면 최종 분석은 성공으로 처리한다. `FAILED`는 실제 provider와 fallback 모두 분석 결과를 만들지 못했을 때 저장된다.

---

## 5. 댓글 생성/수정 연결

댓글 생성과 대댓글 생성:

```text
1. active post/comment 검증
2. 댓글 저장
3. posts.comment_count 증가
4. CommentAnalysis PENDING 생성
5. transaction commit
6. 분석 비동기 요청
```

댓글 수정:

```text
1. 작성자 검증
2. content 갱신
3. moderationStatus=NORMAL로 초기화
4. 기존 분석 결과를 PENDING으로 초기화
5. transaction commit
6. 분석 비동기 요청
```

별도 `STALE` enum은 추가하지 않았다. 기존 enum을 유지하면서 수정된 댓글은 `PENDING` 상태로 재분석 대상으로 표현한다.

---

## 6. 응답 형태 변경

댓글 응답에는 RAG 상세를 포함하지 않고 AI 상태 요약만 포함한다.

```text
analysis
- commentType
- aiAnalysisStatus
- ragStatus
- evidenceCount
- analyzedAt
```

기존 댓글에 아직 분석 row가 없을 수 있으므로 `analysis`는 `null`일 수 있다. Phase 7 이후 생성/수정되는 댓글은 `PENDING` row를 갖는다.

---

## 7. 테스트 추가

추가 테스트:

- 댓글 생성 시 `CommentAnalysis PENDING` 생성과 비동기 분석 요청
- 댓글 수정 시 moderation과 분석 상태 초기화 후 재분석 요청
- 사실 주장 분석 성공 시 `ragStatus=PENDING`
- toxic 분석 성공 시 `moderationStatus=NEEDS_REVIEW`
- analyzer 실패 시 댓글은 유지하고 `aiAnalysisStatus=FAILED`
- 존재하지 않는 댓글 분석 요청 거부

자동 테스트는 OpenAI fetch 응답과 fallback provider를 mock한다. 실제 LLM API key와 외부 네트워크에 의존하지 않는다.

---

## 8. 다음 단계

다음은 Phase 8 `RAG 근거 후보 구현`이다.

Phase 8에서 이어받을 핵심:

- `comment_analyses.rag_status=PENDING`인 `FACT_CLAIM` 댓글만 검색 대상으로 삼는다.
- Phase 6에서 저장한 `transcript_chunks.embedding`을 사용한다.
- RAG 결과는 참/거짓 판정이 아니라 근거 후보로만 저장하고 노출한다.
- 댓글 목록에는 계속 evidence 상세를 포함하지 않고 `evidenceCount`만 표시한다.
