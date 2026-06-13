# Phase 6. Video Processing 구현 계획

> 기준 단계: `arena_implementation_plan.md`의 Phase 6  
> 목표: Video metadata, transcript, embedding 처리 흐름을 실제 외부 provider와 연결한다.

---

## 1. 확정된 방향

Phase 6에서는 실제 외부 API를 사용한다.

```text
metadata   → YouTube Data API v3
transcript → youtube-transcript-api CLI
embedding  → OpenAI embeddings API
```

단, provider 구현은 모두 adapter 뒤에 둔다. 외부 API 세부사항이 `PostsService`, `VideosService`, `CommentsService`에 직접 퍼지지 않게 한다.

게시글 작성 API는 계속 YouTube API를 기다리지 않는다.

```text
POST /api/v1/posts
→ Post / Video 생성
→ 201 Created 응답
→ transaction commit 이후 video processing 비동기 시작
```

영상 처리 실패는 게시글 작성 실패로 처리하지 않는다.

---

## 2. Docker와 Python CLI

`youtube-transcript-api`는 Python 패키지이므로 backend 런타임에 Python과 CLI가 필요하다.

Phase 6에서는 backend Docker 구성을 추가하거나 확장해 다음을 이미지 안에 설치한다.

```bash
pip install youtube-transcript-api
```

이 방식이면 로컬 개발자나 배포 서버가 직접 Python 패키지를 맞추지 않아도 된다. Docker 컨테이너 안에서 `youtube_transcript_api` 명령이 실행 가능하면 NestJS는 `child_process`로 CLI를 호출할 수 있다.

현재 `docker-compose.yml`은 PostgreSQL만 실행하므로, Phase 6 구현 시 backend service 또는 backend Dockerfile을 추가한다.

---

## 3. 환경 변수

실제 secret은 `.env`에만 적고 커밋하지 않는다. `.env.example`에는 placeholder와 기본 정책만 둔다.

```env
YOUTUBE_API_KEY=
OPENAI_API_KEY=
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSION=1536

YOUTUBE_TRANSCRIPT_COMMAND=youtube_transcript_api
TRANSCRIPT_LANGUAGES=ko,en
TRANSCRIPT_CHUNK_SIZE=1000
TRANSCRIPT_CHUNK_OVERLAP=200
```

기본 언어 우선순위는 한국어, 영어 순서다.

```text
ko → en
```

chunk는 우선 문자 수 기준으로 시작한다.

```text
chunk size: 1000 characters
overlap: 200 characters
```

---

## 4. 실패 상태 설계

런타임에서는 mock transcript를 사용자에게 반환하지 않는다.

외부 provider 호출에 실패하면 상태값과 정제된 실패 사유를 저장한다.

```text
metadataStatus:   PENDING | SUCCESS | FAILED
transcriptStatus: PENDING | SUCCESS | FAILED | NOT_AVAILABLE
embeddingStatus:  PENDING | SUCCESS | FAILED
```

추가할 실패 정보:

```text
metadataErrorCode
metadataErrorMessage
transcriptErrorCode
transcriptErrorMessage
embeddingErrorCode
embeddingErrorMessage
processedAt
```

raw provider error는 서버 로그에만 남긴다. API key, 내부 URL, stack trace가 섞일 수 있으므로 사용자 응답에는 그대로 노출하지 않는다.

---

## 5. Retry 정책

영상 처리 retry API를 둔다.

```http
POST /api/v1/videos/:videoId/processing/retry
```

정책:

- 로그인과 CSRF가 필요하다.
- MVP에서는 해당 video로 작성한 게시글의 작성자만 retry할 수 있다.
- 관리자 retry 권한은 Phase 10 Admin 기능에서 확장한다.
- retry는 metadata, transcript, embedding을 다시 시도한다.
- 이미 처리 중인 video에 대한 중복 retry는 막는다.

---

## 6. 주요 리스크

`youtube-transcript-api`는 비공식 provider다.

예상 리스크:

- YouTube 내부 응답 변경으로 깨질 수 있다.
- cloud provider IP에서 차단될 수 있다.
- 일부 영상은 자막이 없거나 자동 자막을 가져오지 못할 수 있다.
- 긴 transcript와 embedding 호출은 처리 시간과 비용을 증가시킨다.

이 리스크 때문에 transcript 수집은 반드시 adapter 뒤에 둔다. 추후 `yt-dlp`, hosted transcript API, STT provider로 교체할 수 있어야 한다.

---

## 7. 테스트와 검증

자동 테스트는 외부 API key와 YouTube 네트워크에 의존하지 않는다.

테스트 방향:

- metadata provider 성공/실패 상태 전이
- transcript provider 성공/자막 없음/차단 실패 상태 전이
- embedding provider 성공/실패 상태 전이
- chunking size/overlap 정책
- retry 권한 정책
- 게시글 작성 성공과 video processing 실패 분리

실제 provider smoke test는 API key와 Docker 환경을 갖춘 뒤 별도로 수행하고 결과를 Phase 6 구현 문서에 남긴다.
