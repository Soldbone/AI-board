# Phase 6. Video Processing 구현 정리

> 브랜치: `feature/jiseob/phase6-video-processing`  
> 기준 단계: `arena_implementation_plan.md`의 Phase 6  
> 목표: Video metadata, transcript, embedding 처리 흐름을 실제 외부 provider와 연결한다.

---

## 1. 이번 단계에서 추가한 것

Phase 6에서는 Phase 4에서 만들어 둔 `Video` 상태값을 실제 처리 흐름과 연결했다.

처리 대상:

```text
metadata   → YouTube Data API v3
transcript → youtube-transcript-api CLI
embedding  → OpenAI embeddings API
```

외부 provider는 모두 adapter 뒤에 둔다. 이 구조 덕분에 `youtube-transcript-api`가 막히거나 깨져도 추후 `yt-dlp`, hosted transcript API, STT provider로 교체할 수 있다.

게시글 작성 API는 여전히 외부 API를 기다리지 않는다.

```text
POST /api/v1/posts
→ Post / Video 생성
→ 201 Created 응답
→ 이후 VideoProcessingService가 비동기로 영상 처리 시도
```

---

## 2. 추가한 DB 구조

새 migration:

```text
backend/src/database/migrations/2026061400000-CreateVideoProcessing.ts
```

추가 내용:

- `CREATE EXTENSION IF NOT EXISTS vector`
- `transcript_chunks` 테이블
- `videos` 실패 상태/처리 시각/중복 실행 방지 컬럼

`transcript_chunks` 주요 컬럼:

- `video_id`
- `chunk_index`
- `content`
- `start_time`
- `end_time`
- `embedding vector(1536)`

`videos` 추가 컬럼:

- `metadata_error_code`
- `metadata_error_message`
- `transcript_error_code`
- `transcript_error_message`
- `embedding_error_code`
- `embedding_error_message`
- `processed_at`
- `processing_locked_until`

`processing_locked_until`은 Redis 없이 같은 video processing이 중복 실행되는 것을 줄이기 위한 DB 기반 lock이다.

---

## 3. Docker 구성

backend Dockerfile을 추가했다.

```text
backend/Dockerfile
```

backend 이미지에는 다음을 포함한다.

- Node.js 24
- pnpm
- Python 3
- `youtube-transcript-api`

Docker 컨테이너 안에서 다음 명령이 실행 가능해야 한다.

```bash
youtube_transcript_api --help
```

`docker-compose.yml`에는 backend service를 추가했다.

```bash
docker compose up -d backend
```

기존 `pnpm.cmd db:up`은 PostgreSQL만 올리는 동작을 유지한다.

---

## 4. 구현한 API

```http
GET  /api/v1/videos/:videoId
POST /api/v1/videos/:videoId/processing/retry
```

retry API 정책:

- 로그인과 CSRF가 필요하다.
- MVP에서는 해당 video로 작성한 게시글의 작성자만 retry할 수 있다.
- 이미 processing lock이 잡혀 있으면 `409 Conflict`를 반환한다.
- 관리자 retry 권한은 Phase 10에서 확장한다.

`GET /videos/:videoId` 응답에는 기존 영상 정보와 함께 다음 값이 포함된다.

```text
metadataErrorCode / metadataErrorMessage
transcriptErrorCode / transcriptErrorMessage
embeddingErrorCode / embeddingErrorMessage
processedAt
isProcessing
```

---

## 5. 실패 상태 설계

외부 provider raw error는 사용자에게 그대로 노출하지 않는다.

원칙:

- raw error는 서버 로그에만 남긴다.
- DB와 API 응답에는 정제된 `errorCode`, `errorMessage`만 저장한다.
- API key, 내부 URL, stack trace는 응답에 포함하지 않는다.

상태 전이:

```text
metadataStatus
PENDING → SUCCESS | FAILED

transcriptStatus
PENDING → SUCCESS | FAILED | NOT_AVAILABLE

embeddingStatus
PENDING → SUCCESS | FAILED
```

자막이 없거나 사용할 수 없으면:

```text
transcriptStatus=NOT_AVAILABLE
embeddingStatus=FAILED
embeddingErrorCode=TRANSCRIPT_REQUIRED
```

---

## 6. Chunking 정책

자막은 문자 수 기준으로 chunking한다.

기본값:

```env
TRANSCRIPT_CHUNK_SIZE=1000
TRANSCRIPT_CHUNK_OVERLAP=200
```

overlap은 이전 chunk의 끝부분을 다음 chunk 앞에 중복 포함하는 길이다. chunk 경계에서 문맥이 끊기는 문제를 줄이기 위해 사용한다.

---

## 7. API key와 smoke test

구현, 타입체크, build, migration, 단위 테스트는 API key 없이 가능하다.

실제 외부 provider 성공 smoke test에는 다음 값이 필요하다.

```env
YOUTUBE_API_KEY=
OPENAI_API_KEY=
```

API key가 없으면 실제 provider 호출은 실패 상태로 기록된다. 이는 mock이 아니라 실제 설정 누락 실패로 처리된다.

---

## 8. 테스트 추가

추가 테스트:

- chunk size / overlap 정책
- retry 권한 실패
- processing lock 충돌 시 `409 Conflict`
- metadata provider 실패 시 `metadataStatus=FAILED`
- transcript 없음 시 `transcriptStatus=NOT_AVAILABLE`
- transcript 없음으로 embedding 생성 불가 시 `embeddingStatus=FAILED`

자동 테스트는 외부 API key와 YouTube 네트워크에 의존하지 않고 provider adapter를 mock한다.

---

## 9. 주요 리스크

`youtube-transcript-api`는 비공식 provider다.

리스크:

- YouTube 내부 응답 변경으로 동작이 깨질 수 있다.
- cloud provider IP가 차단될 수 있다.
- 일부 영상은 자막이 없거나 자동 자막을 가져올 수 없다.
- 긴 transcript는 embedding 비용과 처리 시간을 늘린다.

이 리스크 때문에 transcript provider는 반드시 adapter 뒤에 둔다.

---

## 10. 다음 단계

다음은 Phase 7 `AI 댓글 분석 구현`이다.

Phase 7에서 이어받을 핵심:

- 댓글 작성 직후 `CommentAnalysis`를 `PENDING`으로 생성한다.
- 댓글 유형 분석은 댓글 작성 성공과 분리한다.
- 사실 주장 댓글만 RAG 근거 후보 검색 대상으로 넘긴다.
- Phase 6에서 저장된 `transcript_chunks.embedding`은 Phase 8 RAG 검색의 기반 데이터가 된다.

과제 요구사항의 MCP와 Agent 기능은 Phase 9, Phase 10에서 구현한다.

- MCP는 외부 API 호출을 모두 대체하는 경로가 아니라 Agent가 호출할 수 있는 tool server로 제공한다.
- Agent는 MCP tool을 선택하고 실행하는 제한된 추론 루프를 가진다.
- Phase 6의 YouTube metadata provider, video processing status, transcript chunk 저장 결과는 MCP tool의 내부 구현 재료로 재사용한다.
- 자세한 결정은 `docs/implementation/mcp_agent_tool_strategy.md`에 정리한다.
