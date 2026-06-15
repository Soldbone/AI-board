# 피규어 커뮤니티 사용자 시나리오 기반 테스트 설계

## 1. 테스트 설계 기준

본 문서는 `API_DESIGN.md`, 서비스 기획안, 프로젝트 구조 설계안을 기준으로 사용자 시나리오 기반 테스트를 정리한다.

- 테스트 관점: 사용자가 실제 화면에서 수행하는 흐름 중심
- 테스트 범위:
  - 핵심 기능: 회원, 게시판, 게시글, 이미지, 댓글, 태그, 검색, 권한
  - AI 기능: 후기 유사 피규어 추천, 질문 참고 답변, 구매 고민 요약/추천
- API prefix: `/api/v1`
- 인증: 회원 기능은 JWT access token이 필요하다.
- 외부 링크 정책: 사용자는 게시글 작성 시 URL을 별도 입력하지 않는다.

## 2. 공통 테스트 데이터

| 구분 | 값 |
| --- | --- |
| 일반 회원 A | `figurefan` / `user-a@example.com` |
| 일반 회원 B | `collector` / `user-b@example.com` |
| 운영자 | `admin` / `admin@example.com` |
| 후기 게시판 | `REVIEW` |
| 정보 게시판 | `INFO` |
| 질문 게시판 | `QUESTION` |
| 구매 고민 게시판 | `PURCHASE_HELP` |
| 테스트 피규어명 | `하츠네 미쿠 NT 스타일` |
| 테스트 제조사 | `Good Smile Company` |
| 테스트 태그 | `하츠네 미쿠`, `넨도로이드`, `먼지 관리` |

## 3. 핵심 기능(게시판) 테스트 시나리오

### BOARD-01. 비회원이 게시글 목록과 상세를 조회한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 비회원도 게시글을 탐색할 수 있는지 확인 |
| 사전 조건 | 공개 상태의 게시글이 1개 이상 존재 |
| 주요 API | `GET /boards`, `GET /posts`, `GET /posts/{post_id}` |

절차:

1. 비로그인 상태로 게시판 목록을 조회한다.
2. `REVIEW` 게시판의 게시글 목록을 조회한다.
3. 목록에서 게시글 하나를 선택해 상세를 조회한다.

기대 결과:

- 게시판 목록이 정상 반환된다.
- 게시글 목록에 제목, 작성자, 썸네일, 태그, 조회수, 댓글 수가 표시된다.
- 후기 게시글 상세에 본문, 피규어 정보, 이미지, 태그가 표시된다.
- 비회원에게 수정, 삭제, 댓글 작성 버튼은 노출되지 않거나 사용이 제한된다.

### BOARD-02. 사용자가 회원가입 후 로그인한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 회원가입, 로그인, 토큰 발급 흐름 확인 |
| 사전 조건 | 동일한 `login_id`가 존재하지 않음 |
| 주요 API | `POST /auth/signup`, `POST /auth/login`, `GET /users/me` |

절차:

1. 회원가입 정보를 입력한다.
2. 가입한 계정으로 로그인한다.
3. 발급받은 access token으로 내 정보를 조회한다.

기대 결과:

- 회원가입 시 `201 Created`가 반환된다.
- 로그인 시 access token, refresh token, 사용자 요약 정보가 반환된다.
- 내 정보 조회 시 가입한 사용자의 로그인 ID, 닉네임이 반환된다.

### BOARD-03. 중복 계정으로 회원가입을 시도한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 중복 로그인 ID 검증 확인 |
| 사전 조건 | 이미 가입된 회원이 존재 |
| 주요 API | `POST /auth/signup` |

절차:

1. 기존 회원과 같은 로그인 ID로 회원가입을 요청한다.

기대 결과:

- `409 Conflict`가 반환된다.
- 에러 응답은 공통 에러 구조를 따른다.

### BOARD-04. 회원이 후기 게시글을 이미지, 피규어 정보, 태그와 함께 작성한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 후기 게시판 작성 플로우 검증 |
| 사전 조건 | 회원 A가 로그인되어 있음 |
| 주요 API | `POST /images`, `POST /posts`, `GET /posts/{post_id}` |

절차:

1. 이미지 파일을 업로드한다.
2. `REVIEW` 게시판 글쓰기 화면에서 피규어명, 제조사, 종류, 가격대, 구매일, 만족도, 태그, 본문을 입력한다.
3. 업로드된 `image_ids`를 포함해 게시글을 등록한다.
4. 생성된 게시글 상세를 조회한다.

기대 결과:

- 이미지 업로드 응답에 `TEMP` 상태와 썸네일 URL이 포함된다.
- 게시글 생성 시 `201 Created`가 반환된다.
- 응답의 `queued_jobs`에 `INDEX_POST`가 포함된다.
- 상세 조회에서 `figure_info.figure_name`, `manufacturer`, `satisfaction_score`, 이미지, 태그가 표시된다.
- 요청 바디에는 `external_urls`, `link_preview_ids`가 없어야 한다.

### BOARD-05. 후기 게시글 필수값 누락 시 등록이 실패한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 게시판별 필수 입력 검증 확인 |
| 사전 조건 | 회원 A가 로그인되어 있음 |
| 주요 API | `POST /posts` |

절차:

1. `REVIEW` 게시글 작성 시 `figure_info.figure_name`을 비워 요청한다.
2. `REVIEW` 게시글 작성 시 `satisfaction_score`를 비워 요청한다.

기대 결과:

- `422 Unprocessable Entity`가 반환된다.
- 어떤 필드가 누락되었는지 검증 메시지가 포함된다.

### BOARD-06. 사용자가 정보 게시글을 작성한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 일반 정보글 작성 흐름 확인 |
| 사전 조건 | 회원 A가 로그인되어 있음 |
| 주요 API | `POST /posts`, `GET /posts/{post_id}` |

절차:

1. `INFO` 게시판에 제목과 본문을 입력한다.
2. 태그를 입력해 게시글을 등록한다.
3. 상세 화면에서 게시글을 확인한다.

기대 결과:

- `figure_info` 없이도 게시글이 생성된다.
- 상세 화면에서 정보글 본문과 태그가 표시된다.

### BOARD-07. 사용자가 질문 게시글을 작성한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 질문 게시판 작성 흐름 확인 |
| 사전 조건 | 회원 A가 로그인되어 있음 |
| 주요 API | `POST /posts`, `GET /posts/{post_id}` |

절차:

1. `QUESTION` 게시판에 질문 제목과 내용을 입력한다.
2. 관련 태그와 선택 이미지가 있으면 함께 등록한다.
3. 게시글 상세를 조회한다.

기대 결과:

- 질문 게시글이 `PUBLISHED` 상태로 생성된다.
- 상세 화면에서 질문 본문, 태그, 댓글 영역, AI 참고 답변 영역이 구분되어 표시된다.

### BOARD-08. 사용자가 구매 고민 게시글을 작성한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 구매 고민 게시판 작성 흐름 확인 |
| 사전 조건 | 회원 A가 로그인되어 있음 |
| 주요 API | `POST /posts`, `GET /posts/{post_id}` |

절차:

1. `PURCHASE_HELP` 게시판에 구매 고민 제목과 본문을 입력한다.
2. 게시글을 등록한다.
3. 게시글 상세를 조회한다.

기대 결과:

- `figure_info` 없이 게시글이 생성된다.
- 사용자가 URL을 따로 입력하지 않아도 등록할 수 있다.
- 상세 화면에서 구매 고민 제목과 본문이 표시된다.

### BOARD-09. 작성자가 게시글을 수정한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 게시글 수정 권한과 재인덱싱 큐 등록 확인 |
| 사전 조건 | 회원 A가 작성한 게시글이 존재 |
| 주요 API | `PATCH /posts/{post_id}`, `GET /posts/{post_id}` |

절차:

1. 작성자가 제목, 본문, 만족도, 태그, 이미지 목록을 수정한다.
2. 게시글 상세를 다시 조회한다.

기대 결과:

- `200 OK`와 수정된 게시글 상세가 반환된다.
- 수정된 내용이 상세 화면에 반영된다.
- 기존 RAG 청크는 `STALE` 처리되고 재인덱싱 작업이 요청된다.

### BOARD-10. 작성자가 아닌 사용자가 게시글 수정을 시도한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 게시글 수정 권한 검증 |
| 사전 조건 | 회원 A가 작성한 게시글, 회원 B 로그인 |
| 주요 API | `PATCH /posts/{post_id}` |

절차:

1. 회원 B가 회원 A의 게시글 수정을 요청한다.

기대 결과:

- `403 Forbidden`이 반환된다.
- 게시글 내용은 변경되지 않는다.

### BOARD-11. 작성자가 게시글을 삭제한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 게시글 소프트 삭제 확인 |
| 사전 조건 | 회원 A가 작성한 게시글이 존재 |
| 주요 API | `DELETE /posts/{post_id}`, `GET /posts/{post_id}` |

절차:

1. 작성자가 게시글 삭제를 요청한다.
2. 삭제된 게시글 상세를 조회한다.
3. 게시글 목록을 조회한다.

기대 결과:

- 삭제 요청은 `204 No Content`를 반환한다.
- 게시글은 `DELETED` 또는 조회 불가 상태가 된다.
- 일반 목록에는 삭제된 게시글이 노출되지 않는다.

### BOARD-12. 회원이 댓글을 작성, 수정, 삭제한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 댓글 CRUD와 댓글 수 갱신 확인 |
| 사전 조건 | 공개 게시글이 존재하고 회원 A가 로그인되어 있음 |
| 주요 API | `POST /posts/{post_id}/comments`, `PATCH /comments/{comment_id}`, `DELETE /comments/{comment_id}` |

절차:

1. 게시글 상세에서 댓글을 작성한다.
2. 댓글 목록을 조회한다.
3. 작성한 댓글 내용을 수정한다.
4. 댓글을 삭제한다.

기대 결과:

- 댓글 작성 시 `201 Created`가 반환된다.
- 게시글 `comment_count`가 증가한다.
- 댓글 수정 후 목록에 수정된 내용이 표시된다.
- 댓글 삭제 후 일반 목록에서 보이지 않거나 `DELETED` 상태로 처리된다.
- 댓글 작성/수정 후 RAG 인덱싱 작업이 요청된다.

### BOARD-13. 작성자가 아닌 사용자가 댓글 수정/삭제를 시도한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 댓글 권한 검증 |
| 사전 조건 | 회원 A가 작성한 댓글, 회원 B 로그인 |
| 주요 API | `PATCH /comments/{comment_id}`, `DELETE /comments/{comment_id}` |

절차:

1. 회원 B가 회원 A의 댓글 수정을 요청한다.
2. 회원 B가 회원 A의 댓글 삭제를 요청한다.

기대 결과:

- 두 요청 모두 `403 Forbidden`이 반환된다.
- 댓글 내용과 상태는 변경되지 않는다.

### BOARD-14. 사용자가 태그 자동완성과 태그 기반 탐색을 사용한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 태그 검색과 태그 필터링 확인 |
| 사전 조건 | `하츠네 미쿠` 태그가 연결된 게시글 존재 |
| 주요 API | `GET /tags`, `GET /posts?tag=하츠네 미쿠` |

절차:

1. 글쓰기 화면에서 `미쿠`로 태그를 검색한다.
2. 태그를 선택해 게시글 목록을 필터링한다.

기대 결과:

- 태그 검색 결과에 `하츠네 미쿠`가 반환된다.
- 태그 필터 목록에는 해당 태그가 연결된 게시글만 표시된다.
- 태그 `usage_count`가 게시글 연결에 맞게 증가한다.

### BOARD-15. 사용자가 키워드와 조건으로 게시글을 검색한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 통합 검색과 필터 조건 확인 |
| 사전 조건 | 여러 게시판에 테스트 게시글 존재 |
| 주요 API | `GET /search/posts` |

절차:

1. `q=먼지 관리`로 통합 검색한다.
2. `board_code=INFO`를 추가해 정보 게시판만 검색한다.
3. `figure_name`, `manufacturer`, `price_range` 조건을 조합해 검색한다.

기대 결과:

- 제목, 본문, 피규어명, 제조사, 태그에 매칭되는 게시글이 반환된다.
- 게시판 필터 적용 시 해당 게시판 글만 반환된다.
- 가격대 필터 적용 시 해당 가격대 글만 반환된다.

### BOARD-16. 게시글 목록 페이징과 정렬을 검증한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 목록 탐색성 확인 |
| 사전 조건 | 게시글이 50개 이상 존재 |
| 주요 API | `GET /posts?page=1&size=20`, `GET /posts?sort=views` |

절차:

1. `page=1`, `size=20`으로 목록을 조회한다.
2. `page=2`, `size=20`으로 다음 페이지를 조회한다.
3. `sort=latest`, `views`, `satisfaction`, `comments`를 각각 적용한다.

기대 결과:

- 각 응답에 `items`, `page`, `size`, `total`, `has_next`가 포함된다.
- 페이지별 게시글이 중복되지 않는다.
- 정렬 기준에 맞게 목록 순서가 바뀐다.

### BOARD-17. 사용자가 마이페이지에서 내 활동을 조회한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 내 게시글, 내 댓글 조회 확인 |
| 사전 조건 | 회원 A가 작성한 게시글과 댓글이 존재 |
| 주요 API | `GET /users/me/posts`, `GET /users/me/comments` |

절차:

1. 로그인 상태로 내 게시글 목록을 조회한다.
2. 내 댓글 목록을 조회한다.

기대 결과:

- 본인이 작성한 게시글만 반환된다.
- 본인이 작성한 댓글과 연결 게시글 제목이 반환된다.

### BOARD-18. 비회원이 보호된 기능을 시도한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 인증 필요 기능 보호 확인 |
| 사전 조건 | 비로그인 상태 |
| 주요 API | `POST /posts`, `POST /posts/{post_id}/comments`, `POST /images` |

절차:

1. 비로그인 상태로 게시글 작성을 요청한다.
2. 비로그인 상태로 댓글 작성을 요청한다.
3. 비로그인 상태로 이미지 업로드를 요청한다.

기대 결과:

- 모든 요청에 `401 Unauthorized`가 반환된다.

## 4. AI 기능 테스트 시나리오

### AI-01. 후기 게시글 상세에서 유사 후기 3개를 추천한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 후기 게시판 유사 피규어 추천 확인 |
| 사전 조건 | 같은 캐릭터, 제조사, 가격대, 태그가 겹치는 후기 게시글들이 인덱싱되어 있음 |
| 주요 API | `GET /posts/{post_id}/similar-posts?limit=3` |

절차:

1. 후기 게시글 상세에 진입한다.
2. 유사 게시글 추천 API를 호출한다.

기대 결과:

- 최대 3개의 추천 글이 반환된다.
- 현재 조회 중인 게시글은 추천 결과에서 제외된다.
- 각 결과에는 `score`와 추천 이유가 포함된다.
- 같은 태그, 같은 캐릭터, 유사 가격대 글이 우선 노출된다.

### AI-02. 유사 게시글 후보가 부족하면 빈 목록 또는 부족한 개수만 반환한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 초기 데이터 부족 상황 처리 확인 |
| 사전 조건 | 유사 게시글 후보가 없음 |
| 주요 API | `GET /posts/{post_id}/similar-posts?limit=3` |

절차:

1. 유사 후보가 없는 후기 게시글에서 추천 API를 호출한다.

기대 결과:

- 오류가 아니라 `items=[]` 또는 실제 후보 개수만 반환된다.
- 화면은 추천 영역을 숨기거나 “추천할 게시글이 아직 없습니다” 상태를 표시한다.

### AI-03. 질문 게시글 작성 후 AI 참고 답변을 생성한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 질문 게시판 AI 참고 답변 흐름 확인 |
| 사전 조건 | 질문과 관련된 정보글/댓글이 인덱싱되어 있음 |
| 주요 API | `POST /posts`, `POST /posts/{post_id}/ai/reference-answer`, `GET /ai/outputs/{ai_output_id}` |

절차:

1. `QUESTION` 게시판에 `피규어 먼지 관리는 어떻게 하나요?` 질문을 작성한다.
2. 해당 게시글에 AI 참고 답변 생성을 요청한다.
3. AI 결과를 폴링한다.
4. 게시글 상세와 AI 결과 조회 응답을 화면의 서로 다른 영역에 표시한다.

기대 결과:

- AI 결과의 `output_type`은 `QUESTION_REFERENCE_ANSWER`다.
- 결과의 `target_post_id`는 질문 게시글 ID다.
- AI 답변은 일반 댓글이 아니라 AI 참고 답변 영역에 표시된다.
- 근거 게시글 또는 댓글 링크가 함께 제공된다.

### AI-04. 질문 게시글이 아닌 글에 참고 답변 생성을 요청하면 실패한다

| 항목 | 내용 |
| --- | --- |
| 목적 | AI 기능 대상 게시판 검증 |
| 사전 조건 | `REVIEW` 게시글 존재 |
| 주요 API | `POST /posts/{post_id}/ai/reference-answer` |

절차:

1. `REVIEW` 게시글 ID로 참고 답변 생성을 요청한다.

기대 결과:

- `400 Bad Request` 또는 `422 Unprocessable Entity`가 반환된다.
- 에러 메시지는 `QUESTION` 게시판 대상 기능임을 알려준다.

### AI-05. 질문 참고 답변 근거가 부족하면 제한된 답변을 반환한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 질문 참고 답변 환각 방지 정책 확인 |
| 사전 조건 | 질문과 관련된 과거 질문/댓글 근거가 없음 |
| 주요 API | `POST /posts/{post_id}/ai/reference-answer`, `GET /ai/outputs/{ai_output_id}` |

절차:

1. 근거가 부족한 `QUESTION` 게시글에 AI 참고 답변 생성을 요청한다.
2. AI 결과를 조회한다.

기대 결과:

- 답변은 “충분한 근거를 찾지 못했다”는 취지로 제한된다.
- `grounding_status=NO_EVIDENCE` 또는 `PARTIALLY_GROUNDED`가 반환된다.
- 근거가 없는데 단정적인 구매처, 가격, 사실 정보를 만들지 않는다.

### AI-06. 구매 고민 게시글에 구매 요약과 추천을 생성한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 구매 고민 보조 기능 검증 |
| 사전 조건 | 동일 피규어 또는 유사 태그 후기 게시글이 여러 개 인덱싱되어 있음 |
| 주요 API | `POST /posts`, `POST /posts/{post_id}/ai/purchase-summary`, `GET /ai/outputs/{ai_output_id}` |

절차:

1. `PURCHASE_HELP` 게시판에 구매 고민 글을 작성한다.
2. 구매 고민 요약 생성을 요청한다.
3. AI 결과를 조회한다.

기대 결과:

- AI 결과의 `output_type`은 `PURCHASE_SUMMARY`다.
- 동일 피규어 후기 요약, 유사 가격대 추천, 장점, 단점이 포함된다.
- `sources`에 참고한 후기 게시글이 포함된다.
- 근거 부족 시 제한된 요약을 제공한다.

### AI-07. 동일 피규어 후기가 부족하면 유사 가격대 고만족 후기를 추천한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 동일 피규어 근거 부족 시 구매 고민 fallback 확인 |
| 사전 조건 | 동일 피규어 후기는 없고 유사 가격대의 만족도 높은 후기 글이 있음 |
| 주요 API | `POST /posts/{post_id}/ai/purchase-summary`, `GET /ai/outputs/{ai_output_id}` |

절차:

1. `PURCHASE_HELP` 게시글에 구매 고민 요약 생성을 요청한다.
2. AI 결과를 조회한다.

기대 결과:

- 동일 피규어 근거 부족 여부가 표시된다.
- 유사 가격대의 만족도 높은 후기 글이 추천된다.
- 추천 근거가 `sources`에 포함된다.

### AI-08. 구매 고민 게시판이 아닌 글에 구매 요약을 요청하면 실패한다

| 항목 | 내용 |
| --- | --- |
| 목적 | 구매 요약 대상 게시판 검증 |
| 사전 조건 | `INFO` 또는 `REVIEW` 게시글 존재 |
| 주요 API | `POST /posts/{post_id}/ai/purchase-summary` |

절차:

1. 구매 고민 게시판이 아닌 게시글에 구매 요약 생성을 요청한다.

기대 결과:

- `400 Bad Request` 또는 `422 Unprocessable Entity`가 반환된다.
- 에러 메시지는 `PURCHASE_HELP` 게시판 대상 기능임을 알려준다.

### AI-09. AI 답변은 사용자 댓글과 구분되어 표시된다

| 항목 | 내용 |
| --- | --- |
| 목적 | AI 생성 콘텐츠와 사용자 콘텐츠 구분 확인 |
| 사전 조건 | 질문 게시글에 사용자 댓글과 AI 참고 답변이 모두 존재 |
| 주요 API | `GET /posts/{post_id}`, `GET /posts/{post_id}/comments`, `GET /ai/outputs/{ai_output_id}` |

절차:

1. 질문 게시글 상세를 조회한다.
2. 댓글 목록 API를 조회한다.
3. AI output 조회 API를 조회한다.
4. 댓글 영역과 AI 참고 답변 영역을 확인한다.

기대 결과:

- 사용자 댓글은 댓글 목록에 표시된다.
- AI 참고 답변은 별도 AI 영역에 표시된다.
- AI 답변에는 근거 출처와 참고용 안내가 표시된다.
- 게시글의 `comment_count`는 사용자 댓글만 반영하고 AI output 수를 더하지 않는다.

### AI-10. 게시글 수정 후 RAG 검색 결과가 최신 내용으로 반영된다

| 항목 | 내용 |
| --- | --- |
| 목적 | 재인덱싱 후 AI 답변 최신성 확인 |
| 사전 조건 | 기존 게시글이 인덱싱되어 있고 회원 A 로그인 |
| 주요 API | `PATCH /posts/{post_id}`, `POST /internal/indexing/posts/{post_id}`, `POST /posts/{post_id}/ai/reference-answer` |

절차:

1. 기존 정보 게시글의 본문을 수정한다.
2. 재인덱싱 작업을 실행한다.
3. 수정된 내용과 관련된 질문 참고 답변 생성을 요청한다.

기대 결과:

- AI 답변은 수정 전 내용이 아니라 수정 후 내용을 근거로 한다.
- `sources.excerpt`도 최신 본문에서 가져온다.

### AI-11. 개발용 seed 기반 RAG 통합 smoke check를 실행한다

| 항목 | 내용 |
| --- | --- |
| 목적 | Phase 1~5에서 만든 RAG 저장/조회 흐름을 한 번에 확인 |
| 사전 조건 | 백엔드 서버 실행, 개발 DB 연결 가능 |
| 주요 파일 | `scripts/seed_dev_data.py`, `scripts/ai_phase6_check.py` |

절차:

1. 개발용 seed 데이터를 초기화해서 넣는다.
2. Phase 6 smoke check 스크립트를 실행한다.

```powershell
backend\.venv\Scripts\python.exe scripts\seed_dev_data.py --reset
backend\.venv\Scripts\python.exe scripts\ai_phase6_check.py
```

백엔드 서버 없이 DB 상태만 확인할 때:

```powershell
$env:AI_PHASE6_SKIP_API="1"
backend\.venv\Scripts\python.exe scripts\ai_phase6_check.py
```

기대 결과:

- `REVIEW`, `QUESTION`, `PURCHASE_HELP` seed 게시글이 확인된다.
- `ContentChunk`에 게시글/댓글 청크와 deterministic mock vector가 들어 있다.
- 질문 참고 답변과 구매 고민 요약 `AiOutput`이 사용자 댓글과 분리되어 있다.
- `AiOutputSource`가 게시글/댓글/chunk 근거를 가리킨다.
- `GET /ai/outputs/{ai_output_id}` 응답에 `sources`가 포함된다.
- 스크립트는 실제 OpenAI API를 호출하지 않는다.

## 5. MCP 공식 상품 정보 보강 테스트 시나리오

### MCP-01. 정확한 공식 상품명은 VERIFIED가 된다

| 항목 | 내용 |
| --- | --- |
| 목적 | 공식 스마트스토어 상품 자동 확정 검증 |
| 사전 조건 | `REVIEW` 게시글에 정확한 피규어명, 제조사, 피규어 타입, 작품 태그가 입력되어 있음 |
| 주요 API | `POST /posts/{post_id}/product-enrichment`, `GET /posts/{post_id}/product-enrichment` |

절차:

1. 정확한 상품명을 가진 후기 게시글을 준비한다.
2. 로그인 사용자로 공식 상품 정보 조회를 요청한다.
3. background task 완료 후 enrichment를 조회한다.

기대 결과:

- `status=COMPLETED`가 저장된다.
- `match_status=VERIFIED`가 저장된다.
- `confidence_score`가 `0.82` 이상이다.
- `matched_product_json.link` 또는 `source_url`이 `https://smartstore.naver.com/gsc_korea_dt_bh/...` 형태다.
- `match_reasons_json`에 피규어명, 상품 라인, 공식 URL 근거가 포함된다.

### MCP-02. 공식 스토어가 아닌 상품은 제외된다

| 항목 | 내용 |
| --- | --- |
| 목적 | whitelist 필터링 검증 |
| 사전 조건 | 네이버 검색 결과에 비공식 몰 후보와 공식 몰 후보가 섞여 있음 |
| 주요 API | `POST /posts/{post_id}/product-enrichment`, `GET /posts/{post_id}/product-enrichment` |

절차:

1. 네이버 검색 결과에 비공식 몰 상품이 포함되는 검색어로 후기 게시글을 준비한다.
2. 공식 상품 정보 조회를 요청한다.
3. 저장된 후보 목록을 확인한다.

기대 결과:

- `candidates_json`에는 공식 스마트스토어 URL 후보만 남는다.
- 비공식 쇼핑몰 URL은 `candidates_json`에 저장되지 않는다.
- 공식 후보가 없으면 `status=COMPLETED`, `match_status=NO_MATCH`가 저장된다.

### MCP-03. 캐릭터명만 같은 다른 피규어는 자동 확정되지 않는다

| 항목 | 내용 |
| --- | --- |
| 목적 | 캐릭터명 단독 일치 오탐 방지 |
| 사전 조건 | 같은 캐릭터지만 다른 라인/상품 후보가 검색됨 |
| 주요 API | `POST /posts/{post_id}/product-enrichment`, `GET /posts/{post_id}/product-enrichment` |

절차:

1. 캐릭터명은 같지만 정확한 상품 라인이나 작품 태그 근거가 부족한 후기 게시글을 준비한다.
2. 공식 상품 정보 조회를 요청한다.
3. enrichment 결과를 조회한다.

기대 결과:

- `match_status`는 `VERIFIED`가 아니다.
- 공식 후보가 있으면 `CANDIDATES_ONLY`가 저장된다.
- `matched_product_json`은 `null`이다.
- 화면에는 “정확한 공식 상품을 확정할 수 없음”과 후보가 표시된다.

### MCP-04. NENDOROID 후기에서 scale/figma 후보는 감점 또는 제외된다

| 항목 | 내용 |
| --- | --- |
| 목적 | 상품 라인 불일치 검증 |
| 사전 조건 | 후기의 `figure_type=NENDOROID`, 검색 후보에 scale 또는 figma 상품이 포함됨 |
| 주요 API | `POST /posts/{post_id}/product-enrichment`, `GET /posts/{post_id}/product-enrichment` |

절차:

1. 넨도로이드 후기 게시글을 준비한다.
2. 공식 상품 정보 조회를 요청한다.
3. 후보별 `match_reasons`를 확인한다.

기대 결과:

- scale/figma 후보에는 `PRODUCT_LINE_MISMATCH` 근거가 포함된다.
- 해당 후보는 감점된다.
- 라인 불일치 후보가 자동으로 `VERIFIED` 되지 않는다.

### MCP-05. 네이버 API key 누락 시 FAILED가 저장된다

| 항목 | 내용 |
| --- | --- |
| 목적 | credential 누락 fallback 검증 |
| 사전 조건 | MCP 서버 실행, `NAVER_CLIENT_ID` 또는 `NAVER_CLIENT_SECRET`이 비어 있음 |
| 주요 API | `POST /posts/{post_id}/product-enrichment`, `GET /posts/{post_id}/product-enrichment` |

절차:

1. 네이버 API credential을 비운 상태로 MCP 서버를 실행한다.
2. 공식 상품 정보 조회를 요청한다.
3. background task 완료 후 enrichment를 조회한다.

기대 결과:

- `status=FAILED`가 저장된다.
- `error_message` 또는 `match_reasons_json`에 credential 누락 사유가 포함된다.
- 후기 상세 화면에는 실패 안내가 표시된다.
- 게시글 상세 페이지 전체는 깨지지 않는다.

### MCP-06. MCP 서버 장애 시 후기 상세 페이지는 깨지지 않는다

| 항목 | 내용 |
| --- | --- |
| 목적 | MCP 서버 장애 fallback 검증 |
| 사전 조건 | 백엔드 서버 실행, MCP 서버 미실행 또는 잘못된 `MCP_SERVER_URL` |
| 주요 API | `POST /posts/{post_id}/product-enrichment`, `GET /posts/{post_id}/product-enrichment`, `GET /posts/{post_id}` |

절차:

1. MCP 서버를 끄거나 `MCP_SERVER_URL`을 잘못 설정한다.
2. 공식 상품 정보 조회를 요청한다.
3. 후기 상세 API와 enrichment API를 각각 조회한다.
4. 프론트 후기 상세 페이지를 확인한다.

기대 결과:

- enrichment는 `FAILED`로 저장된다.
- `GET /posts/{post_id}`는 정상 응답한다.
- 프론트는 상품 정보 영역에만 실패 안내를 보여준다.
- 댓글, 이미지, 본문, 유사 후기 영역은 정상적으로 표시된다.

### MCP-07. 캐시 TTL 안에서는 외부 MCP를 다시 호출하지 않는다

| 항목 | 내용 |
| --- | --- |
| 목적 | 반복 조회 시 외부 API 재호출 방지 |
| 사전 조건 | 같은 REVIEW 게시글에 `COMPLETED` enrichment가 있고 `fetched_at`이 TTL 안에 있음 |
| 주요 API | `POST /posts/{post_id}/product-enrichment`, `GET /posts/{post_id}/product-enrichment` |

절차:

1. 공식 상품 정보 조회를 한 번 완료한다.
2. `PRODUCT_ENRICHMENT_CACHE_TTL_HOURS` 안에서 같은 게시글에 다시 POST 요청한다.
3. 반환된 enrichment ID와 `fetched_at`을 확인한다.

기대 결과:

- 새 외부 MCP 호출이 발생하지 않는다.
- 기존 `COMPLETED` enrichment가 반환된다.
- `fetched_at`이 유지된다.
- 화면은 기존 결과를 재사용한다.

### MCP-08. 비후기 게시판에는 공식 상품 정보 카드가 표시되지 않는다

| 항목 | 내용 |
| --- | --- |
| 목적 | REVIEW 전용 화면 정책 검증 |
| 사전 조건 | `INFO`, `QUESTION`, `PURCHASE_HELP` 게시글 존재 |
| 주요 화면 | 게시글 상세 화면 |

절차:

1. 후기 게시판이 아닌 게시글 상세 화면을 연다.
2. 공식 상품 정보 영역이 있는지 확인한다.

기대 결과:

- 공식 상품 정보 카드가 렌더링되지 않는다.
- 사용자는 비후기 게시글에서 상품 정보 조회 버튼을 볼 수 없다.

## 6. 우선순위별 실행 묶음

### 6.1 1차 MVP 필수 회귀 테스트

- BOARD-01 비회원 탐색
- BOARD-02 회원가입/로그인
- BOARD-04 후기 게시글 작성
- BOARD-09 게시글 수정
- BOARD-11 게시글 삭제
- BOARD-12 댓글 CRUD
- BOARD-14 태그 탐색
- BOARD-15 검색
- BOARD-16 페이징/정렬
- BOARD-18 인증 보호

### 6.2 AI MVP 필수 회귀 테스트

- AI-01 후기 유사 게시글 추천
- AI-02 유사 후보 부족 처리
- AI-03 질문 참고 답변
- AI-05 질문 근거 부족 답변 제한
- AI-06 구매 고민 요약
- AI-07 유사 가격대 구매 추천
- AI-09 AI/사용자 콘텐츠 구분
- AI-10 재인덱싱 최신성
- AI-11 개발용 RAG seed 통합 smoke check

### 6.3 MCP 필수 회귀 테스트

- MCP-01 정확한 공식 상품명 VERIFIED
- MCP-02 공식 스토어 외 후보 제외
- MCP-03 캐릭터명 단독 일치 자동 확정 방지
- MCP-04 상품 라인 불일치 감점
- MCP-05 네이버 API key 누락 실패 저장
- MCP-06 MCP 서버 장애 시 상세 페이지 보호
- MCP-07 캐시 TTL 재호출 방지
- MCP-08 비후기 게시판 미표시

### 6.4 운영자/확장 기능 테스트

- 신고 및 운영자 관리 기능은 별도 확장 phase에서 검증한다.

## 7. 테스트 완료 기준

- 1차 MVP 필수 회귀 테스트가 모두 통과한다.
- 게시글, 댓글, 이미지, 태그, 검색, 페이징의 주요 사용자 흐름에 치명 오류가 없다.
- AI 답변은 근거 출처를 제공하거나 근거 부족을 명확히 안내한다.
- AI 생성 콘텐츠는 사용자 작성 콘텐츠와 화면 및 데이터에서 구분된다.
- MCP 공식 상품 정보는 공식 스마트스토어 whitelist와 매칭 점수 조건을 통과한 경우에만 `VERIFIED`로 표시된다.
- MCP 실패는 공식 상품 정보 영역에만 표시되고 게시글 상세 페이지 전체를 깨뜨리지 않는다.
- 사용자가 URL을 별도 입력하지 않아도 게시글 작성이 가능하다.
