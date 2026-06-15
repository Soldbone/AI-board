# 피규어 커뮤니티 DB 모델 설계안

## 1. 엔티티 목록

## 1.1 User

회원 정보를 관리하는 엔티티.

주요 역할:

- 회원가입 / 로그인
- 게시글 작성자
- 댓글 작성자
- 신고자
- AI 요청자
- 운영자 권한 구분

핵심 필드 후보:

| 필드 | 설명 |
| --- | --- |
| `id` | 사용자 ID |
| `email` | 이메일, 선택값 |
| `login_id` | 로그인 ID |
| `password_hash` | 암호화된 비밀번호 |
| `nickname` | 닉네임 |
| `profile_image_url` | 프로필 이미지 |
| `role` | 권한 |
| `status` | 계정 상태 |
| `last_login_at` | 마지막 로그인 시각 |
| `created_at` | 생성 시각 |
| `updated_at` | 수정 시각 |

상태값 후보:

`role`

- `USER`
- `ADMIN`

`status`

- `ACTIVE`
- `INACTIVE`
- `SUSPENDED`
- `DELETED`

---

## 1.2 AuthSession

로그인 세션 또는 리프레시 토큰을 관리하는 엔티티.

핵심 필드 후보:

| 필드 | 설명 |
| --- | --- |
| `id` | 세션 ID |
| `user_id` | 사용자 ID |
| `refresh_token_hash` | 리프레시 토큰 해시 |
| `expires_at` | 만료 시각 |
| `revoked_at` | 폐기 시각 |
| `created_at` | 생성 시각 |

---

## 1.3 Board

게시판 유형을 관리하는 엔티티.

핵심 필드 후보:

| 필드 | 설명 |
| --- | --- |
| `id` | 게시판 ID |
| `code` | 게시판 코드 |
| `name` | 게시판 이름 |
| `description` | 설명 |
| `sort_order` | 노출 순서 |
| `is_active` | 사용 여부 |
| `created_at` | 생성 시각 |

게시판 코드 후보:

- `REVIEW`: 피규어 후기 게시판
- `INFO`: 정보 게시판
- `QUESTION`: 질문 게시판
- `PURCHASE_HELP`: 구매 고민 게시판
- `NOTICE`: 공지사항
- `FAQ`: FAQ

---

## 1.4 Post

모든 게시글의 공통 정보를 관리하는 중심 엔티티.

후기, 정보글, 질문글, 구매 고민 글은 모두 `Post`로 저장하고, 게시판 유형은 `Board`로 구분한다.

핵심 필드 후보:

| 필드 | 설명 |
| --- | --- |
| `id` | 게시글 ID |
| `board_id` | 게시판 ID |
| `author_id` | 작성자 ID |
| `title` | 제목 |
| `content` | 본문 |
| `source_type` | 작성 주체 |
| `status` | 게시글 상태 |
| `view_count` | 조회수 |
| `comment_count` | 댓글 수 |
| `published_at` | 게시 시각 |
| `created_at` | 생성 시각 |
| `updated_at` | 수정 시각 |
| `deleted_at` | 삭제 시각 |

상태값 후보:

`source_type`

- `USER`

`status`

- `DRAFT`
- `PUBLISHED`
- `PENDING_REVIEW`
- `HIDDEN`
- `DELETED`

---

## 1.5 PostFigureInfo

게시글에 포함된 피규어 정보를 저장하는 엔티티.

MVP에서는 별도의 `Figure` 마스터 테이블을 두지 않고, 사용자가 입력한 피규어명과 제조사명을 텍스트로 저장한다.

적용 대상:

- 후기 게시판

구매 고민 게시판은 `PostFigureInfo`를 사용하지 않고, 고민 중인 대상과 가격 정보는 제목과 본문에 작성한다.

핵심 필드 후보:

| 필드 | 설명 |
| --- | --- |
| `id` | 피규어 정보 ID |
| `post_id` | 게시글 ID |
| `figure_name` | 피규어 이름 |
| `manufacturer` | 제조사 |
| `figure_type` | 피규어 종류 |
| `price_amount` | 가격 |
| `price_range` | 가격대 |
| `purchase_date` | 구매일 |
| `satisfaction_score` | 만족도 |
| `target_type` | 피규어 정보의 용도 |
| `created_at` | 생성 시각 |

상태값 후보:

`figure_type`

- `SCALE`
- `NENDOROID`
- `FIGMA`
- `ACTION_FIGURE`
- `PRIZE`
- `GARAGE_KIT`
- `OTHER`

`price_range`

- `UNDER_30000`
- `30000_50000`
- `50000_100000`
- `100000_200000`
- `OVER_200000`
- `UNKNOWN`

`target_type`

- `REVIEW_TARGET`
- `RELATED_FIGURE`

---

## 1.6 Comment

댓글을 관리하는 엔티티.

MVP에서는 대댓글은 제외하고, 게시글에 직접 달리는 댓글만 관리한다.

핵심 필드 후보:

| 필드 | 설명 |
| --- | --- |
| `id` | 댓글 ID |
| `post_id` | 게시글 ID |
| `author_id` | 작성자 ID |
| `content` | 댓글 내용 |
| `status` | 댓글 상태 |
| `created_at` | 생성 시각 |
| `updated_at` | 수정 시각 |
| `deleted_at` | 삭제 시각 |

상태값 후보:

`status`

- `PUBLISHED`
- `HIDDEN`
- `DELETED`

---

## 1.7 Tag

태그 정보를 관리하는 엔티티.

태그는 검색, 필터링, 유사 게시글 추천의 보조 정보로 사용한다.

핵심 필드 후보:

| 필드 | 설명 |
| --- | --- |
| `id` | 태그 ID |
| `name` | 태그명 |
| `normalized_name` | 정규화된 태그명 |
| `tag_type` | 태그 유형 |
| `usage_count` | 사용 횟수 |
| `status` | 태그 상태 |
| `created_at` | 생성 시각 |

상태값 후보:

`tag_type`

- `CHARACTER`
- `WORK`
- `MANUFACTURER`
- `TOPIC`
- `PRICE`
- `GENERAL`

`status`

- `ACTIVE`
- `MERGED`
- `BLOCKED`
- `DELETED`

---

## 1.8 PostTag

게시글과 태그의 다대다 관계를 관리하는 연결 엔티티.

핵심 필드 후보:

| 필드 | 설명 |
| --- | --- |
| `post_id` | 게시글 ID |
| `tag_id` | 태그 ID |
| `created_at` | 연결 시각 |

관계:

- 하나의 게시글은 여러 태그를 가질 수 있다.
- 하나의 태그는 여러 게시글에 사용될 수 있다.

---

## 1.9 PostImage

게시글 첨부 이미지를 관리하는 엔티티.

핵심 필드 후보:

| 필드 | 설명 |
| --- | --- |
| `id` | 이미지 ID |
| `post_id` | 게시글 ID |
| `uploader_id` | 업로더 ID |
| `file_url` | 원본 이미지 URL |
| `thumbnail_url` | 썸네일 URL |
| `original_name` | 원본 파일명 |
| `mime_type` | 파일 MIME 타입 |
| `size_bytes` | 파일 크기 |
| `width` | 이미지 너비 |
| `height` | 이미지 높이 |
| `sort_order` | 이미지 노출 순서 |
| `status` | 이미지 상태 |
| `created_at` | 생성 시각 |

상태값 후보:

`status`

- `TEMP`
- `ATTACHED`
- `DELETED`
- `FAILED`

---

## 1.10 ContentChunk

RAG 검색을 위해 게시글과 댓글을 잘게 나눈 문서 조각 엔티티.

AI Q&A, 게시글 맥락 Agent 답변, 구매 고민 요약, 유사 게시글 검색의 기반 데이터가 된다.

핵심 필드 후보:

| 필드 | 설명 |
| --- | --- |
| `id` | 청크 ID |
| `source_type` | 원본 유형 |
| `post_id` | 게시글 ID |
| `comment_id` | 댓글 ID |
| `board_code` | 원본 게시글의 게시판 코드 |
| `chunk_index` | 같은 원본 안에서의 청크 순서 |
| `chunk_text` | 청크 텍스트 |
| `embedding_model` | 임베딩 모델명 |
| `embedding_vector` | 임베딩 벡터 |
| `token_count` | 토큰 수 |
| `index_status` | 인덱싱 상태 |
| `metadata_json` | 피규어명, 제조사, 가격대, 태그, seed 정보 등 검색 보조 메타데이터 |
| `indexed_at` | 인덱싱 시각 |
| `created_at` | 생성 시각 |
| `updated_at` | 수정 시각 |

상태값 후보:

`source_type`

- `POST`
- `COMMENT`
- `NOTICE`
- `FAQ`

`index_status`

- `PENDING`
- `INDEXED`
- `FAILED`
- `STALE`
- `DELETED`

---

## 1.11 AiOutput

AI가 생성한 답변, 요약, 정보글 초안 등을 저장하는 엔티티.

AI 기능 디버깅을 위해 사용자가 실제로 입력한 질문 또는 작업 요청 원문인 `query_text`를 반드시 저장한다.

핵심 필드 후보:

| 필드 | 설명 |
| --- | --- |
| `id` | AI 결과 ID |
| `output_type` | AI 결과 유형 |
| `requester_id` | 요청자 ID |
| `target_post_id` | 대상 게시글 ID |
| `query_text` | 사용자 질문 또는 AI 작업 요청 원문 |
| `title` | AI 결과 제목 |
| `content` | AI 생성 내용 |
| `status` | AI 결과 상태 |
| `grounding_status` | 근거 기반 여부 |
| `confidence_score` | 신뢰도 점수 |
| `model_name` | 사용 모델명 |
| `metadata_json` | 요청 옵션, 프롬프트 버전, 토큰 사용량 등 |
| `created_at` | 생성 시각 |

상태값 후보:

`output_type`

- `PURCHASE_SUMMARY`
- `AGENT_ANSWER`

`status`

- `REQUESTED`
- `PROCESSING`
- `GENERATED`
- `FAILED`

`grounding_status`

- `GROUNDED`
- `PARTIALLY_GROUNDED`
- `NO_EVIDENCE`

---

## 1.12 AiOutputSource

AI 답변이 어떤 게시글 또는 댓글을 근거로 생성되었는지 저장하는 엔티티.

RAG 답변에서 근거 링크를 제공하기 위해 반드시 필요하다.

핵심 필드 후보:

| 필드 | 설명 |
| --- | --- |
| `id` | AI 근거 ID |
| `ai_output_id` | AI 결과 ID |
| `content_chunk_id` | 참조한 청크 ID |
| `source_post_id` | 근거 게시글 ID |
| `source_comment_id` | 근거 댓글 ID |
| `relevance_score` | 관련도 점수 |
| `rank_order` | 근거 노출 순서 |
| `excerpt` | 근거 발췌문 |
| `created_at` | 생성 시각 |

비고:

- `source_post_id`는 `content_chunk_id`를 통해 유추할 수 있지만, 조회 성능과 화면 표시 편의를 위해 중복 저장해도 좋다.
- `rank_order`는 RAG 근거의 우선순위를 표현하기 위해 필요하다.
- 개발용 seed 데이터는 `ContentChunk.metadata_json.seed="dev"`와 `embedding_model="dev-deterministic-embedding-v1"`로 구분한다.
- Phase 6 smoke check는 이 값을 이용해 실제 OpenAI API 호출 없이도 RAG chunk, AI 결과, AI 근거가 연결되어 있는지 확인한다.
- 저장된 AI 결과 예시는 `AiOutput`에 있고, 화면은 `AiOutputSource`를 통해 참고한 게시글/댓글/chunk 근거를 보여준다.

---

## 1.13 Report

신고 및 운영자 관리를 위한 엔티티.

MVP 필수는 아니지만, 운영자 기능에 “부적절한 게시글 관리”가 포함되어 있으므로 확장 엔티티로 설계에 포함한다.

핵심 필드 후보:

| 필드 | 설명 |
| --- | --- |
| `id` | 신고 ID |
| `reporter_id` | 신고자 ID |
| `target_type` | 신고 대상 유형 |
| `target_post_id` | 신고 대상 게시글 ID |
| `target_comment_id` | 신고 대상 댓글 ID |
| `reason` | 신고 사유 |
| `status` | 신고 처리 상태 |
| `handled_by` | 처리한 운영자 ID |
| `handled_at` | 처리 시각 |
| `created_at` | 신고 시각 |

상태값 후보:

`target_type`

- `POST`
- `COMMENT`

`reason`

- `SPAM`
- `ABUSE`
- `HATE`
- `AD`
- `INAPPROPRIATE`
- `MISINFORMATION`
- `COPYRIGHT`
- `OTHER`

`status`

- `PENDING`
- `REVIEWING`
- `RESOLVED`
- `REJECTED`
- `CANCELED`

---

# 2. 엔티티 간 관계

| 관계 | 설명 |
| --- | --- |
| `User` 1 : N `Post` | 한 사용자는 여러 게시글을 작성할 수 있다. |
| `User` 1 : N `Comment` | 한 사용자는 여러 댓글을 작성할 수 있다. |
| `User` 1 : N `Report` | 한 사용자는 여러 신고를 할 수 있다. |
| `User` 1 : N `AiOutput` | 한 사용자는 여러 AI 요청을 할 수 있다. |
| `User` 1 : N `AuthSession` | 한 사용자는 여러 로그인 세션을 가질 수 있다. |
| `Board` 1 : N `Post` | 하나의 게시판에는 여러 게시글이 속한다. |
| `Post` 1 : N `Comment` | 하나의 게시글에는 여러 댓글이 달릴 수 있다. |
| `Post` 1 : N `PostImage` | 하나의 게시글은 여러 이미지를 가질 수 있다. |
| `Post` 1 : N `PostFigureInfo` | 후기 게시글은 피규어 정보를 가질 수 있다. |
| `Post` N : M `Tag` | 게시글과 태그는 다대다 관계다. |
| `Post` 1 : N `ContentChunk` | 하나의 게시글은 여러 RAG 청크로 나뉠 수 있다. |
| `Comment` 1 : N `ContentChunk` | 하나의 댓글도 RAG 청크로 인덱싱될 수 있다. |
| `Post` 1 : N `AiOutput` | 특정 게시글을 대상으로 여러 AI 결과가 생성될 수 있다. |
| `AiOutput` 1 : N `AiOutputSource` | 하나의 AI 결과는 여러 근거를 가질 수 있다. |
| `ContentChunk` 1 : N `AiOutputSource` | 하나의 청크는 여러 AI 답변의 근거로 사용될 수 있다. |
| `Post` 1 : N `Report` | 게시글은 여러 번 신고될 수 있다. |
| `Comment` 1 : N `Report` | 댓글은 여러 번 신고될 수 있다. |

---

# 3. MVP 기준 포함 여부

| 엔티티 | MVP 포함 여부 | 비고 |
| --- | --- | --- |
| `User` | 포함 | 회원가입/로그인 |
| `AuthSession` | 포함 | 인증 구현 방식에 따라 조정 가능 |
| `Board` | 포함 | 게시판 카테고리 구분 |
| `Post` | 포함 | 게시글 CRUD 핵심 |
| `PostFigureInfo` | 포함 | 후기 입력 항목 |
| `Comment` | 포함 | 댓글 CRUD |
| `Tag` | 포함 | 태그 등록/검색 |
| `PostTag` | 포함 | 게시글-태그 연결 |
| `PostImage` | 포함 | 사진 업로드 |
| `ContentChunk` | 포함 | RAG, 유사도 검색 기반 |
| `AiOutput` | 포함 | AI 답변/요약/초안 저장 |
| `AiOutputSource` | 포함 | RAG 근거 링크 제공 |
| `Report` | 선택 | 신고/운영자 관리 구현 시 |

MVP에서 제외하는 엔티티:

| 엔티티 | 제외 이유 |
| --- | --- |
| `Figure` | 피규어명 정규화와 중복 병합 비용이 큼 |
| `PostRecommendation` | 유사 게시글 추천은 실시간 벡터 검색으로 처리 가능 |

---

# 4. 유사 게시글 추천 처리 방식

`PostRecommendation` 테이블은 만들지 않는다.

MVP에서는 아래 방식으로 처리한다.

```
게시글 상세 조회
→ 대상 게시글의 본문/태그와 후기 글의 피규어 정보 기반 검색 문맥 생성
→ ContentChunk 또는 게시글 임베딩 기준 vector search
→ 유사 게시글 3개 조회
→ 현재 게시글 제외
→ 화면에 즉시 반환
```

저장하지 않는 이유:

- MVP에서는 추천 이력 분석이 필수 아님
- 추천 품질이 바뀔 수 있으므로 실시간 계산이 유리함
- 테이블을 두면 만료, 재계산, 중복 추천 관리가 추가됨

향후 추가 가능 시점:

- 추천 클릭률 분석이 필요할 때
- 추천 결과 캐싱이 필요할 때
- 개인화 추천을 도입할 때

---

# 5. ERD 시각화

```mermaid
erDiagram
    USER ||--o{ AUTH_SESSION : owns
    USER ||--o{ POST : writes
    USER ||--o{ COMMENT : writes
    USER ||--o{ REPORT : creates
    USER ||--o{ AI_OUTPUT : requests

    BOARD ||--o{ POST : contains

    POST ||--o{ POST_FIGURE_INFO : has
    POST ||--o{ POST_IMAGE : has
    POST ||--o{ COMMENT : has
    POST ||--o{ CONTENT_CHUNK : indexed_as
    POST ||--o{ AI_OUTPUT : target_of
    POST ||--o{ REPORT : reported_as_post

    COMMENT ||--o{ CONTENT_CHUNK : indexed_as
    COMMENT ||--o{ REPORT : reported_as_comment

    POST ||--o{ POST_TAG : has
    TAG ||--o{ POST_TAG : used_by

    AI_OUTPUT ||--o{ AI_OUTPUT_SOURCE : cites
    CONTENT_CHUNK ||--o{ AI_OUTPUT_SOURCE : used_as_evidence

    USER {
      bigint id
      string email nullable
      string login_id
      string nickname
      string role
      string status
      datetime created_at
    }

    AUTH_SESSION {
      bigint id
      bigint user_id
      string refresh_token_hash
      datetime expires_at
      datetime revoked_at
    }

    BOARD {
      bigint id
      string code
      string name
      int sort_order
      boolean is_active
    }

    POST {
      bigint id
      bigint board_id
      bigint author_id
      string title
      text content
      string source_type
      string status
      int view_count
      int comment_count
      datetime created_at
    }

    POST_FIGURE_INFO {
      bigint id
      bigint post_id
      string figure_name
      string manufacturer
      string figure_type
      decimal price_amount
      string price_range
      date purchase_date
      int satisfaction_score
      string target_type
    }

    COMMENT {
      bigint id
      bigint post_id
      bigint author_id
      text content
      string status
      datetime created_at
    }

    TAG {
      bigint id
      string name
      string normalized_name
      string tag_type
      int usage_count
      string status
    }

    POST_TAG {
      bigint post_id
      bigint tag_id
      datetime created_at
    }

    POST_IMAGE {
      bigint id
      bigint post_id
      bigint uploader_id
      string file_url
      string thumbnail_url
      int sort_order
      string status
    }

    CONTENT_CHUNK {
      bigint id
      string source_type
      bigint post_id
      bigint comment_id
      string board_code
      int chunk_index
      text chunk_text
      string embedding_model
      vector embedding_vector
      int token_count
      string index_status
      json metadata_json
      datetime indexed_at
      datetime created_at
      datetime updated_at
    }

    AI_OUTPUT {
      bigint id
      string output_type
      bigint requester_id
      bigint target_post_id
      text query_text
      string title
      text content
      string status
      string grounding_status
      float confidence_score
      string model_name
      json metadata_json
    }

    AI_OUTPUT_SOURCE {
      bigint id
      bigint ai_output_id
      bigint content_chunk_id
      bigint source_post_id
      bigint source_comment_id
      float relevance_score
      int rank_order
      text excerpt
    }

    REPORT {
      bigint id
      bigint reporter_id
      string target_type
      bigint target_post_id
      bigint target_comment_id
      string reason
      string status
      bigint handled_by
      datetime handled_at
      datetime created_at
    }
```

최종적으로 이 설계는 **게시판 MVP를 빠르게 만들 수 있으면서도, RAG 근거 추적과 운영자 기능 확장까지 열어둔 구조**야. 특히 `Figure`, `PostRecommendation`을 MVP에서 제외한 덕분에 초기 구현 부담이 꽤 줄어들어.
