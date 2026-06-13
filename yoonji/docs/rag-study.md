# RAG Study Notes

이 문서는 AI Phase를 구현하면서 RAG 구조와 코드의 역할을 학습하기 위해 정리한다.
현재 문서는 AI Phase 1, 즉 `ContentChunk`, `AiOutput`, `AiOutputSource` 저장 기반 구현 내용을 다룬다.

## 1. Phase 1 구현 요약

이번 Phase에서는 실제 LangChain 호출이나 Vector DB 검색을 붙이지 않았다.
대신 이후 RAG 흐름에서 사용할 공통 저장 기반을 만들었다.

- `ContentChunk`: 게시글과 댓글을 검색 가능한 작은 단위로 나눈 결과를 저장한다.
- `AiOutput`: 질문 참고 답변, 구매 고민 요약처럼 AI가 만든 결과를 사용자 댓글과 분리해서 저장한다.
- `AiOutputSource`: AI 답변이 참고한 게시글, 댓글, chunk 근거를 저장한다.

사용자 흐름으로 보면 다음과 같다.

```text
사용자가 질문 글 또는 구매 고민 글을 작성한다.
-> 이후 Phase에서 게시글/댓글이 ContentChunk로 인덱싱된다.
-> AI 기능이 검색된 chunk를 근거로 답변을 생성한다.
-> 생성 결과는 AiOutput으로 저장된다.
-> 참고 근거는 AiOutputSource로 저장된다.
-> 화면은 댓글과 AI 답변을 서로 다른 영역에 표시할 수 있다.
```

Phase 1의 핵심은 "AI가 쓴 글"을 "사용자가 쓴 댓글"과 섞지 않는 것이다.
이렇게 분리해야 신뢰도, 책임 범위, 근거 표시를 명확하게 유지할 수 있다.

## 2. RAG 개념

RAG는 Retrieval-Augmented Generation의 줄임말이다.
LLM에게 바로 질문을 던지는 방식과 달리, 먼저 우리 서비스의 게시글과 댓글에서 관련 근거를 검색한 뒤 그 근거를 prompt에 넣어 답변을 생성한다.

- Retrieval: 관련 게시글, 댓글, chunk를 찾는 단계다.
- Generation: 검색된 context를 바탕으로 LLM이 답변이나 요약을 만드는 단계다.
- Embedding: 텍스트의 의미를 숫자 벡터로 바꾸는 작업이다.
- Vector DB: embedding vector를 저장하고 비슷한 의미의 문서를 빠르게 찾는 저장소다.
- Retriever: 기능별 조건에 맞게 Vector DB에서 관련 chunk를 가져오는 역할이다.l ,.
- Prompt context: LLM이 근거 없는 내용을 지어내지 않도록 검색된 문서를 함께 전달하는 부분이다.

이번 Phase는 Retrieval과 Generation을 직접 구현하지 않고, 그 결과를 추적할 DB 구조를 먼저 만든다.

## 3. LangChain 구성 요소와 이번 Phase의 위치

아래 구성 요소는 이후 Phase에서 구현한다. Phase 1은 이 구성 요소들이 만든 결과를 저장할 DB 기반이다.

### Document

개념:

- LangChain이 처리할 수 있는 문서 객체다.

우리 코드에서의 역할:

- 이후 `backend/app/ai/rag/document_loader.py`에서 게시글과 댓글을 Document로 변환할 예정이다.
- 변환된 문서의 원본 추적 정보는 `ContentChunk.post_id`, `ContentChunk.comment_id`, `ContentChunk.board_code`에 이어진다.

왜 필요한지:

- DB row 그대로는 LangChain splitter와 retriever가 다루기 불편하다.
- Document로 바꾸면 본문과 metadata를 한 묶음으로 전달할 수 있다.

### RecursiveCharacterTextSplitter

개념:

- 긴 텍스트를 검색하기 좋은 크기의 chunk로 나누는 LangChain splitter다.

우리 코드에서의 역할:

- 이후 `backend/app/ai/rag/text_splitter.py`에서 사용한다.
- 나뉜 순서는 `ContentChunk.chunk_index`에 저장된다.

왜 필요한지:

- 긴 게시글 전체를 한 번에 검색하면 검색 품질이 떨어지고 토큰도 많이 쓴다.
- 작은 chunk 단위로 검색해야 필요한 문단만 근거로 가져올 수 있다.

### OpenAIEmbeddings

개념:

- 텍스트를 vector로 변환하는 embedding 모델 client다.

우리 코드에서의 역할:

- 이후 `backend/app/ai/rag/embedding_client.py`에서 환경변수 기반으로 생성한다.
- 사용한 모델명은 `ContentChunk.embedding_model`에 기록할 수 있다.

왜 필요한지:

- 의미가 비슷한 글을 찾으려면 텍스트를 숫자 벡터로 바꿔야 한다.

### Vector Store

개념:

- embedding vector와 metadata를 저장하고 유사도 검색을 수행하는 저장소다.

우리 코드에서의 역할:

- 이후 `backend/app/ai/rag/vector_store.py` 뒤에 Chroma 또는 pgvector 구현을 숨긴다.
- DB의 `ContentChunk`는 원본 chunk와 상태를 추적하고, vector store는 실제 의미 검색을 담당한다.

왜 필요한지:

- 일반 SQL의 `LIKE` 검색만으로는 의미가 비슷한 게시글을 찾기 어렵다.

### Retriever

개념:

- 기능에 맞는 조건으로 Vector Store에서 관련 문서를 가져오는 객체다.

우리 코드에서의 역할:

- 이후 `backend/app/ai/rag/retriever.py`에서 REVIEW, QUESTION, PURCHASE_HELP 조건을 나눠 검색한다.
- 검색 결과는 `AiOutputSource`로 저장되어 사용자에게 근거로 보여진다.

왜 필요한지:

- 후기 추천, 질문 참고 답변, 구매 고민 요약은 서로 검색 대상과 기준이 다르다.

### ChatPromptTemplate와 ChatOpenAI

개념:

- `ChatPromptTemplate`은 LLM에게 전달할 메시지 틀이다.
- `ChatOpenAI`는 OpenAI chat model 호출 client다.

우리 코드에서의 역할:

- 이후 `backend/app/ai/llm/prompts.py`, `backend/app/ai/llm/llm_client.py`에서 구현한다.
- 생성된 답변은 `AiOutput.content`, 근거 품질은 `AiOutput.grounding_status`에 저장된다.

왜 필요한지:

- 검색된 context를 LLM에게 명확한 형식으로 전달해야 근거 기반 답변을 만들 수 있다.

## 4. 수정한 파일별 설명

### `backend/app/models/enums.py`

AI 저장 기반에 필요한 enum을 추가했다.

- `ContentSourceType`: chunk 원본이 게시글인지 댓글인지 구분한다.
- `ContentChunkStatus`: chunk 인덱싱 상태를 표현한다.
- `AiOutputType`: 질문 참고 답변과 구매 고민 요약을 구분한다.
- `AiOutputStatus`: AI 결과 생성 상태를 추적한다.
- `GroundingStatus`: 답변이 근거에 얼마나 기반했는지 표현한다.

이 enum들이 필요한 이유는 문자열을 자유롭게 저장하면 상태 오타가 생기기 쉽기 때문이다.
DB와 schema가 같은 enum을 쓰면 service 코드가 더 명확해진다.

### `backend/app/models/content_chunk.py`

게시글과 댓글을 RAG 검색 단위로 저장하는 모델이다.

중요 필드:

- `source_type`: `POST`, `COMMENT` 같은 원본 유형
- `post_id`, `comment_id`: 원본 row 연결
- `board_code`: REVIEW, QUESTION 같은 기능별 검색 필터
- `chunk_index`: 한 원본에서 몇 번째 chunk인지
- `chunk_text`: 실제 검색 대상 텍스트
- `embedding_model`, `embedding_vector`: embedding 결과 추적용 필드
- `index_status`: `PENDING`, `INDEXED`, `STALE` 등 최신성 상태
- `metadata_json`: 태그, 피규어명, 가격대 같은 검색 보조 metadata

`embedding_vector`는 Phase 1에서 JSON 컬럼으로 두었다.
이후 Vector Store 구현은 `vector_store.py` 뒤에 숨길 예정이므로, 운영에서 pgvector를 쓰더라도 모델 변경 범위를 줄일 수 있다.

### `backend/app/models/ai_output.py`

AI가 생성한 답변이나 요약을 저장하는 모델이다.

중요 필드:

- `output_type`: AI 결과 유형
- `requester_id`: 요청한 사용자
- `target_post_id`: AI 기능이 실행된 대상 게시글
- `query_text`: 사용자가 실제로 작성한 질문 또는 고민 본문
- `content`: AI 생성 결과
- `status`: 생성 작업 상태
- `grounding_status`: 근거 기반 여부
- `model_name`: 사용한 LLM 모델명
- `metadata_json`: top_k, prompt 버전 같은 실행 옵션
- `error_message`: 실패 사유

AI 답변을 댓글로 저장하지 않고 별도 테이블로 둔 이유는 사용자 작성 콘텐츠와 AI 생성 콘텐츠를 분명하게 분리하기 위해서다.

### `backend/app/models/ai_output_source.py`

AI 결과가 어떤 근거를 참고했는지 저장하는 모델이다.

중요 필드:

- `ai_output_id`: 어떤 AI 결과의 근거인지
- `content_chunk_id`: 어떤 chunk를 참고했는지
- `source_post_id`, `source_comment_id`: 화면 표시와 조회 성능을 위한 원본 ID
- `relevance_score`: 검색 유사도 점수
- `rank_order`: 근거 표시 순서
- `excerpt`: 사용자에게 보여줄 근거 발췌문

이 테이블 덕분에 "이 답변은 어떤 게시글과 댓글을 바탕으로 만들어졌는가"를 나중에 화면에 표시할 수 있다.

### `backend/app/models/user.py`, `post.py`, `comment.py`

기존 모델에 AI 관계를 연결했다.

- User -> AiOutput
- Post -> ContentChunk
- Post -> AiOutput
- Comment -> ContentChunk

이 관계는 service나 repository에서 `post.content_chunks`, `ai_output.sources`처럼 자연스럽게 접근하기 위해 필요하다.

### `backend/app/models/__init__.py`

새 모델과 enum을 import 목록에 추가했다.
현재 프로젝트는 `init_db.py`에서 `import app.models` 후 `Base.metadata.create_all()`을 호출하므로, 여기에 등록되어야 테이블 생성 대상에 포함된다.

### `backend/app/schemas/ai_schema.py`

AI 요청, chunk, AI 결과, 근거 응답 schema를 정의했다.

- `ReferenceAnswerRequest`
- `PurchaseSummaryRequest`
- `ContentChunkCreate`
- `ContentChunkResponse`
- `AiOutputCreate`
- `AiOutputSourceCreate`
- `AiOutputSourceResponse`
- `AiOutputResponse`
- `SimilarPostListResponse`

특히 `AiOutputResponse.sources`를 포함해 AI 결과 조회 API가 근거 목록을 함께 반환할 수 있게 했다.

### `backend/app/repositories/content_chunk_repository.py`

chunk 저장과 상태 변경 함수를 구현했다.

- `create_content_chunk`
- `create_content_chunks`
- `get_content_chunk_by_id`
- `list_chunks_for_post`
- `list_chunks_for_comment`
- `list_indexed_chunks`
- `mark_post_chunks_stale`
- `mark_comment_chunks_stale`
- `mark_chunk_indexed`
- `mark_chunk_failed`
- `mark_chunk_deleted`

repository는 DB 조회와 저장만 담당한다.
어떤 글을 인덱싱할지, 어떤 metadata를 넣을지는 이후 `indexing_service.py`가 결정한다.

### `backend/app/repositories/ai_output_repository.py`

AI 결과와 근거 저장 함수를 구현했다.

- `create_ai_output`
- `get_ai_output_by_id`
- `list_ai_outputs_for_post`
- `mark_ai_output_processing`
- `mark_ai_output_generated`
- `mark_ai_output_failed`
- `add_ai_output_source`
- `replace_ai_output_sources`

repository는 `commit()`을 호출하지 않고 `flush()`까지만 한다.
그래야 service 계층에서 `AiOutput`과 `AiOutputSource` 저장을 하나의 트랜잭션으로 묶을 수 있다.

## 5. 핵심 코드 설명

### AI 결과와 근거 분리

```python
class AiOutput(Base):
    __tablename__ = "ai_outputs"

    output_type: Mapped[AiOutputType]
    requester_id: Mapped[int]
    target_post_id: Mapped[int]
    content: Mapped[str | None]
    status: Mapped[AiOutputStatus]
    grounding_status: Mapped[GroundingStatus]
    sources: Mapped[list["AiOutputSource"]]
```

이 구조는 AI 답변을 댓글과 섞지 않는다.
질문 게시글 화면에서는 사용자 댓글 목록과 AI 참고 답변 영역을 별도로 그릴 수 있다.

### 근거 source 저장

```python
class AiOutputSource(Base):
    __tablename__ = "ai_output_sources"

    ai_output_id: Mapped[int]
    content_chunk_id: Mapped[int | None]
    source_post_id: Mapped[int | None]
    source_comment_id: Mapped[int | None]
    relevance_score: Mapped[float | None]
    rank_order: Mapped[int]
    excerpt: Mapped[str]
```

RAG 답변에서 중요한 것은 답변 내용뿐 아니라 근거다.
`AiOutputSource`가 있어야 사용자가 AI 답변의 참고 게시글과 댓글을 확인할 수 있다.

### chunk 최신성 상태

```python
def mark_post_chunks_stale(db: Session, *, post_id: int) -> int:
    return _mark_chunks_stale(db, ContentChunk.post_id == post_id)
```

게시글이 수정되면 기존 chunk를 그대로 쓰면 안 된다.
이 함수는 이후 Phase 2에서 수정 전 chunk를 `STALE`로 바꾸고 새 chunk를 다시 만들 때 사용한다.

### AI 결과 생성 완료 처리

```python
def mark_ai_output_generated(
    ai_output: AiOutput,
    *,
    content: str,
    grounding_status: GroundingStatus,
    confidence_score: float | None = None,
    model_name: str | None = None,
    metadata_json: dict[str, Any] | None = None,
) -> AiOutput:
    ai_output.content = content
    ai_output.status = AiOutputStatus.GENERATED
    ai_output.grounding_status = grounding_status
    ai_output.completed_at = utc_now()
    return ai_output
```

AI 작업은 요청, 처리 중, 성공, 실패 상태를 가진다.
이 상태가 있어야 클라이언트가 `GET /ai/outputs/{id}`를 폴링하면서 현재 결과가 준비되었는지 알 수 있다.

## 6. 실행 및 검증 방법

현재 Phase 1은 DB 모델, schema, repository 기반만 구현했다.
실제 OpenAI API Key나 LangChain 실행은 아직 필요하지 않다.

문법 검증:

```powershell
& "C:\Users\yoonj\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m compileall backend\app
```

SQLAlchemy metadata 등록 검증:

```powershell
$env:PYTHONPATH = "backend;backend\.venv\Lib\site-packages"
& "C:\Users\yoonj\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -c "import app.models; from app.db.base import Base; print(sorted(Base.metadata.tables.keys()))"
```

예상 테이블 목록에는 다음 테이블이 포함되어야 한다.

```text
content_chunks
ai_outputs
ai_output_sources
```

## 7. 한계와 다음 개선 방향

이번 Phase의 한계:

- 아직 게시글/댓글을 LangChain `Document`로 변환하지 않는다.
- 아직 `RecursiveCharacterTextSplitter`로 chunk를 나누지 않는다.
- 아직 embedding을 생성하지 않는다.
- 아직 Chroma 또는 pgvector Vector Store에 저장하지 않는다.
- 아직 AI 답변 생성 API를 연결하지 않는다.

다음 Phase에서 할 일:

- 게시글과 댓글을 `Document`로 변환한다.
- Text Splitter로 본문을 chunk 단위로 나눈다.
- `ContentChunk`를 생성하고 상태를 관리한다.
- Vector Store 추상화를 만든다.
- 게시글/댓글 생성 및 수정 후 chunk를 갱신한다.

운영 개선 방향:

- 운영 환경에서는 pgvector 또는 관리형 Vector DB를 검토할 수 있다.
- 단순 top-k 검색 이후 reranker나 hybrid search를 추가할 수 있다.
- `metadata_json`에는 prompt 버전, 검색 조건, token 사용량을 남겨 디버깅 가능성을 높일 수 있다.

---

## 8. Phase 2 구현 요약

AI Phase 2에서는 게시글과 댓글을 RAG 검색에 사용할 수 있는 `ContentChunk`로 만드는 인덱싱 흐름을 구현했다.
이번 단계도 AI 답변 생성은 하지 않는다.
핵심 목표는 "나중에 retriever가 검색할 수 있는 근거 조각을 미리 만들어 두는 것"이다.

구현된 흐름은 다음과 같다.

```text
Post 또는 Comment 조회
-> LangChain Document 변환
-> RecursiveCharacterTextSplitter 우선 사용
-> chunk 단위 분리
-> OpenAI embedding 생성
-> ContentChunk 저장
-> 기존 chunk는 STALE 처리
```

인덱싱 대상은 설계 범위에 맞춰 제한했다.

- `REVIEW` 게시글: 유사 후기 추천과 구매 고민 요약 근거
- `QUESTION` 게시글: 질문 참고 답변의 과거 질문 근거
- `QUESTION` 게시글의 댓글: 과거 답변 근거
- `PURCHASE_HELP` 게시글: 구매 고민 문맥과 추후 유사 고민 검색 확장

`INFO` 게시글은 MVP 게시판 기능에는 포함되지만 이번 RAG 인덱싱 대상은 아니다.

## 9. Phase 2 수정 파일별 설명

### `backend/app/core/config.py`

AI 인덱싱에 필요한 환경변수를 추가했다.

- `OPENAI_API_KEY`
- `OPENAI_EMBEDDING_MODEL`
- `OPENAI_CHAT_MODEL`
- `VECTOR_STORE_PROVIDER`
- `CHROMA_PERSIST_DIR`
- `RAG_CHUNK_SIZE`
- `RAG_CHUNK_OVERLAP`
- `AUTO_INDEX_AFTER_WRITE`

`AUTO_INDEX_AFTER_WRITE`의 기본값은 `false`다.
게시글 작성 API가 자동으로 OpenAI embedding 호출 비용을 만들지 않도록 기본은 꺼 두고, 개발자가 원할 때 켤 수 있게 했다.

### `backend/app/ai/rag/document_loader.py`

DB 모델을 LangChain `Document`로 변환한다.

게시글 Document에는 다음 정보가 들어간다.

- 제목
- 본문
- 게시판 코드
- 후기 피규어명
- 제조사
- 가격대
- 만족도
- 태그

댓글 Document는 질문 게시판의 댓글만 대상으로 삼고, 부모 질문 제목과 본문, 댓글 내용을 함께 넣는다.
질문 참고 답변 기능에서 댓글만 따로 검색되더라도 어떤 질문 맥락의 답변인지 알 수 있어야 하기 때문이다.

### `backend/app/ai/rag/text_splitter.py`

긴 Document를 chunk로 나눈다.
우선 `langchain_text_splitters.RecursiveCharacterTextSplitter`를 사용하도록 작성했다.
현재 로컬 환경처럼 splitter 패키지가 없을 때도 개발 서버가 죽지 않도록 `LocalRecursiveCharacterTextSplitter` fallback을 제공한다.

fallback은 운영용 고급 splitter가 아니라 학습과 로컬 실행 안정성을 위한 안전장치다.
패키지가 설치되어 있으면 LangChain splitter가 우선 사용된다.

### `backend/app/ai/rag/embedding_client.py`

OpenAI embedding client를 감싼다.
`langchain_openai.OpenAIEmbeddings`를 lazy import하므로, 서버 시작 시점에는 OpenAI client 초기화가 일어나지 않는다.

실제 embedding은 인덱싱 요청이 들어왔을 때 생성된다.
`OPENAI_API_KEY`가 없거나 LangChain OpenAI import가 실패하면 `EmbeddingClientError`를 발생시켜 인덱싱 service가 명확한 API 오류로 바꾼다.

### `backend/app/ai/rag/vector_store.py`

Vector Store 교체 지점을 감싼다.
현재 구현은 `ContentChunk.embedding_vector` JSON 값을 사용하는 개발용 `DatabaseVectorStore`다.

이 구조를 둔 이유는 이후 pgvector 또는 Chroma로 바꿀 때 usecase 코드가 직접 DB 저장 방식을 알지 않아도 되게 하기 위해서다.
`VECTOR_STORE_PROVIDER=pgvector`도 현재는 이 DB 기반 provider를 사용한다.
실제 pgvector 컬럼 전환은 migration 단계에서 처리하는 것이 안전하다.

### `backend/app/ai/rag/indexing_service.py`

인덱싱 전체 흐름을 조율한다.

- `index_post`
- `index_comment`
- `delete_post_index`
- `delete_comment_index`
- `reindex_all_content`
- 자동 인덱싱 background task helper

중요한 점은 기존 chunk를 먼저 `STALE`로 만들지 않는다는 것이다.
새 chunk의 embedding 생성이 성공한 뒤에 기존 chunk를 `STALE` 처리하고 새 chunk를 `INDEXED`로 저장한다.
이렇게 하면 OpenAI API 호출 실패로 검색 인덱스가 비어 버리는 일을 줄일 수 있다.

### `backend/app/api/routes/internal.py`

내부 인덱싱 API를 추가했다.

```text
POST /api/v1/internal/indexing/posts/{post_id}
POST /api/v1/internal/indexing/comments/{comment_id}
POST /api/v1/internal/indexing/reindex
```

이 API는 관리자 권한만 호출할 수 있다.
일반 사용자가 직접 호출하는 기능이 아니기 때문이다.

### `backend/app/api/routes/posts.py`

게시글 작성, 수정, 삭제 후 자동 인덱싱 task를 예약할 수 있게 연결했다.
기본 설정에서는 동작하지 않고, `AUTO_INDEX_AFTER_WRITE=true`일 때만 background task로 실행된다.

### `backend/app/api/routes/comments.py`

댓글 작성, 수정, 삭제 후 자동 인덱싱 task를 예약할 수 있게 연결했다.
댓글 인덱싱은 질문 게시판 댓글만 실제 대상이 된다.

### `backend/app/repositories/post_repository.py`

인덱싱 대상 게시글 조회 함수를 추가했다.

- `get_post_for_indexing`
- `list_posts_for_indexing`

service가 직접 DB 조건을 만들지 않도록 repository에 조회 책임을 두었다.

### `backend/app/repositories/comment_repository.py`

인덱싱 대상 댓글 조회 함수를 추가했다.

- `get_comment_for_indexing`
- `list_comments_for_indexing`

질문 게시판의 공개 댓글만 조회한다.

### `backend/app/repositories/content_chunk_repository.py`

삭제된 게시글/댓글의 chunk를 `DELETED` 상태로 바꾸는 함수를 추가했다.

- `mark_post_chunks_deleted`
- `mark_comment_chunks_deleted`

수정은 `STALE`, 삭제는 `DELETED`로 구분해 나중에 검색 대상에서 제외할 수 있다.

### `scripts/reindex_content_chunks.py`

개발자가 기존 DB 내용을 전체 재인덱싱할 수 있는 스크립트다.

예시:

```powershell
cd C:\Users\yoonj\jungle\AI-board\yoonji
backend\.venv\Scripts\python.exe scripts\reindex_content_chunks.py
```

단일 게시글:

```powershell
backend\.venv\Scripts\python.exe scripts\reindex_content_chunks.py --post-id 10
```

단일 댓글:

```powershell
backend\.venv\Scripts\python.exe scripts\reindex_content_chunks.py --comment-id 5
```

### `scripts/create_pgvector_extension.sql`

운영 DB에서 pgvector 확장을 준비할 때 사용할 SQL이다.

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

현재 Phase 2 코드는 migration 없이 JSON embedding 저장을 사용한다.
pgvector 컬럼 전환은 별도 migration에서 다루는 것이 안전하다.

## 10. Phase 2 핵심 코드 설명

### 게시글을 Document로 변환

```python
def build_post_document(post: Post) -> Document | None:
    if not is_indexable_post(post):
        return None

    return Document(
        page_content=_build_post_text(post, figure_info=figure_info, tags=tags),
        metadata=metadata,
    )
```

RAG에서는 본문만 검색하면 부족하다.
후기 추천과 구매 고민 요약에는 피규어명, 제조사, 가격대, 만족도, 태그가 중요하기 때문이다.
그래서 Document의 `page_content`와 `metadata`에 검색에 필요한 문맥을 함께 넣는다.

### chunk 분리

```python
def split_document(document: Document, *, chunk_size: int | None = None, chunk_overlap: int | None = None) -> list[Document]:
    splitter = build_text_splitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    chunks = splitter.split_documents([document])
```

긴 글 전체를 하나의 embedding으로 만들면 필요한 문단을 세밀하게 찾기 어렵다.
chunk로 나누면 "도색", "관절", "가격", "배송"처럼 실제로 관련 있는 부분만 검색될 가능성이 높아진다.

### embedding 생성

```python
client = OpenAIEmbeddings(
    model=self.model_name,
    api_key=self.api_key,
)
```

텍스트를 vector로 바꾸는 단계다.
이 vector가 있어야 이후 유사도 검색에서 의미가 비슷한 게시글이나 댓글을 찾을 수 있다.

### 기존 chunk STALE 처리 후 새 chunk 저장

```python
stale_count = content_chunk_repository.mark_post_chunks_stale(db, post_id=post_id)
created_chunks = content_chunk_repository.create_content_chunks(db, chunk_values=chunk_values)
```

수정된 게시글의 예전 chunk를 계속 쓰면 검색 결과가 낡아진다.
그래서 새 chunk 생성이 준비된 뒤 기존 chunk를 `STALE`로 바꾸고 새 chunk를 `INDEXED`로 저장한다.

## 11. Phase 2 실행 방법

필요 환경변수:

```env
OPENAI_API_KEY=
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
VECTOR_STORE_PROVIDER=pgvector
RAG_CHUNK_SIZE=900
RAG_CHUNK_OVERLAP=120
AUTO_INDEX_AFTER_WRITE=false
```

서버 실행 후 내부 API 호출:

```text
POST /api/v1/internal/indexing/posts/{post_id}
POST /api/v1/internal/indexing/comments/{comment_id}
```

전체 재인덱싱:

```powershell
backend\.venv\Scripts\python.exe scripts\reindex_content_chunks.py
```

예상 응답:

```json
{
  "source_type": "POST",
  "post_id": 10,
  "comment_id": null,
  "status": "INDEXED",
  "chunk_count": 2,
  "stale_count": 1,
  "message": null
}
```

## 12. Phase 2 한계와 다음 개선 방향

현재 한계:

- 실제 pgvector 컬럼과 ANN index는 아직 만들지 않았다.
- Chroma provider는 추상화만 준비했고 패키지는 설치하지 않았다.
- 자동 인덱싱은 `AUTO_INDEX_AFTER_WRITE=true`일 때만 background task로 실행된다.
- background task 실패는 사용자 작성 API 응답을 실패시키지 않고 서버 로그에 남긴다.
- 현재 검색은 다음 Phase의 retriever 구현 전이므로 chunk 저장까지가 목표다.

다음 개선:

- Phase 3에서 `vector_store.similarity_search`를 사용해 유사 후기 추천을 만든다.
- Phase 4에서 질문 참고 답변 retriever와 prompt를 연결한다.
- Phase 5에서 구매 고민 요약 retriever와 LLM 생성을 연결한다.
- 운영 단계에서는 pgvector migration과 cosine/ivfflat/hnsw index를 검토한다.

---

## 13. Phase 3 구현 요약

AI Phase 3에서는 후기 게시글 상세에서 현재 후기와 비슷한 후기 게시글을 추천하는 기능을 구현했다.
이 기능은 RAG 흐름 중 Retrieval만 사용하는 기능이다.
LLM으로 문장을 생성하지 않고, 인덱싱된 REVIEW chunk를 vector similarity로 검색해 추천 목록을 만든다.

API는 다음과 같다.

```text
GET /api/v1/posts/{post_id}/similar-posts?limit=3
```

동작 흐름:

```text
현재 게시글 조회
-> REVIEW 게시글인지 확인
-> 현재 게시글을 Document 검색 문맥으로 변환
-> OpenAI embedding으로 query vector 생성
-> REVIEW + POST chunk만 vector search
-> 현재 게시글 제외
-> 같은 게시글의 여러 chunk는 최고 점수만 사용
-> 게시글 요약, score, 추천 이유 반환
```

추천 결과는 `AiOutput`에 저장하지 않는다.
새 후기가 추가되거나 재인덱싱이 일어나면 추천 결과가 달라질 수 있으므로 실시간 계산이 더 자연스럽기 때문이다.

## 14. Phase 3 수정 파일별 설명

### `backend/app/ai/rag/retriever.py`

`retrieve_similar_review_posts`를 구현했다.

이 함수는 현재 REVIEW 게시글을 검색 query로 만들고, `VectorStore.similarity_search`를 호출한다.
검색 조건은 다음과 같다.

- `board_code=REVIEW`
- `source_type=POST`
- 현재 `post_id` 제외

검색 결과는 chunk 단위로 나오지만, 화면에는 게시글 단위 추천이 필요하다.
그래서 같은 게시글에서 여러 chunk가 검색되면 가장 높은 score만 남긴다.

### `backend/app/ai/usecases/similar_posts.py`

유사 후기 추천 usecase를 구현했다.

역할:

- 대상 게시글 존재 여부 확인
- REVIEW 게시글인지 검증
- retriever 호출
- 추천 후보 게시글 조회
- `SimilarPostListResponse` 생성
- 같은 피규어명, 같은 제조사, 비슷한 가격대, 공유 태그를 바탕으로 간단한 reason 생성

이 파일이 필요한 이유는 retriever가 검색만 담당하고, API 응답으로 어떤 정보를 보여줄지는 usecase가 담당해야 계층이 섞이지 않기 때문이다.

### `backend/app/repositories/post_repository.py`

`get_public_posts_by_ids`를 추가했다.
retriever가 반환한 `post_id` 목록을 실제 게시글 응답 정보로 바꾸기 위해 필요하다.

### `backend/app/api/routes/posts.py`

아래 API를 추가했다.

```text
GET /posts/{post_id}/similar-posts
```

권한은 비회원도 접근 가능하다.
게시글 상세 조회처럼 공개 후기 기반 추천이기 때문이다.

### `frontend/src/api/postApi.js`

`getSimilarPosts(postId, limit)`를 추가했다.
프론트 상세 화면에서 백엔드 추천 API를 호출하기 위한 함수다.

### `frontend/src/components/post/SimilarPostList.jsx`

후기 상세 화면에 표시할 유사 후기 목록 컴포넌트를 추가했다.

상태:

- 로딩
- API 오류
- 추천 없음
- 추천 카드 목록

추천 카드에는 제목, thumbnail, match score, 추천 이유, 가격대, 만족도를 표시한다.

### `frontend/src/pages/PostDetailPage.jsx`

현재 게시글이 `REVIEW`일 때만 `SimilarPostList`를 렌더링하도록 연결했다.

### `frontend/src/routes/Router.jsx`

유사 후기 카드를 클릭했을 때 해당 게시글 상세로 이동할 수 있도록 `onOpenPost`를 전달했다.

### `frontend/src/App.css`

유사 후기 목록 카드 스타일과 모바일 1열 반응형 스타일을 추가했다.

## 15. Phase 3 핵심 코드 설명

### 현재 후기 게시글을 검색 query로 사용

```python
document = document_loader.build_post_document(post)
query_vector = _embed_query(document.page_content)
```

현재 후기의 제목, 본문, 피규어명, 제조사, 가격대, 태그가 모두 검색 문맥에 들어간다.
이렇게 해야 단순히 제목이 비슷한 글이 아니라 실제 후기 내용과 피규어 정보가 비슷한 글을 찾을 수 있다.

### REVIEW chunk만 검색

```python
search_results = get_vector_store().similarity_search(
    db,
    query_vector=query_vector,
    board_code=BoardCode.REVIEW,
    source_types=[ContentSourceType.POST],
    exclude_post_id=post.id,
)
```

유사 후기 추천은 후기 게시판 안에서만 동작한다.
질문 글이나 구매 고민 글이 섞이면 추천 품질이 떨어지고 사용자가 기대한 "비슷한 후기"가 아니게 된다.

### chunk 결과를 post 결과로 압축

```python
if current is None or score > current.score:
    candidates_by_post_id[chunk.post_id] = SimilarPostCandidate(...)
```

Vector search는 chunk 단위로 결과를 준다.
하지만 화면에서는 같은 게시글이 여러 번 나오면 안 된다.
그래서 게시글별 최고 점수 chunk만 추천 후보로 사용한다.

## 16. Phase 3 실행 방법

먼저 Phase 2 인덱싱으로 REVIEW 게시글 chunk가 만들어져 있어야 한다.

```powershell
backend\.venv\Scripts\python.exe scripts\reindex_content_chunks.py
```

그 다음 후기 게시글 상세 추천 API를 호출한다.

```text
GET /api/v1/posts/10/similar-posts?limit=3
```

예상 응답:

```json
{
  "items": [
    {
      "post": {
        "id": 11,
        "board_code": "REVIEW",
        "title": "슷한 피규어 후기",
        "thumbnail_url": "/uploads/posts/11/thumb.jpg",
        "satisfaction_score": 5,
        "price_range": "50000_100000"
      },
      "score": 0.9132,
      "reason": "same manufacturer, similar price range, shared tags"
    }
  ]
}
```

관련 chunk가 없으면 빈 목록을 반환한다.

```json
{
  "items": []
}
```

## 17. Phase 3 한계와 다음 개선 방향

현재 한계:

- 추천 이유는 rule 기반으로 간단히 만든다.
- 현재는 DB JSON vector 기반 cosine search를 사용한다.
- 아직 reranker나 hybrid search는 없다.
- 인덱싱되지 않은 후기가 많으면 추천 결과가 부족할 수 있다.

다음 개선:

- pgvector 전환 후 ANN index를 적용한다.
- figure metadata match와 vector score를 섞은 reranking을 추가한다.
- 사용자가 보고 있는 게시글의 이미지, 태그, 만족도까지 더 정교하게 반영한다.
- Phase 4에서 질문 참고 답변 생성으로 넘어간다.
