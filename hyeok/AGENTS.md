# AGENTS.md - 동네 가게 Q&A 게시판 프로젝트 작업 지침서

## 0. 목적

이 파일은 `hyeok` 폴더의 게시판 프로젝트를 구현할 때 따라야 할 작업 지침서입니다.

구현은 AI coding agent에게 맡길 수 있지만, 코드는 재혁님이 읽고 이해할 수 있어야 합니다. 복잡한 추상화보다 명확한 구조, 작은 단계, 알아보기 쉬운 이름을 우선합니다.

구현을 시작하기 전에 이 파일을 먼저 읽고, 여기 적힌 기술스택과 기능 범위를 기준으로 작업합니다.

---

## 1. 프로젝트 요약

이 프로젝트는 동네 주민들이 맛집, 카페, 미용실, 옷가게 같은 지역 가게에 대해 질문하고 답변하는 로컬 Q&A 게시판입니다.

이 서비스는 네이버지도를 대체하려는 서비스가 아닙니다. 핵심 가치는 지도 리뷰만으로 알기 어려운 구체적인 질문을 실제 이용자에게 물어보고 답변을 모으는 것입니다.

예시 질문:

- 이 미용실 남자 커트 괜찮나요?
- 이 카페 노트북 펴고 오래 있어도 괜찮나요?
- 이 식당에서 실제로 맛있는 메뉴는 뭔가요?
- 이 가게 혼밥하기 편한가요?
- 이 옷가게 가격 대비 품질 괜찮나요?

현재 MVP는 일반 게시판 기능을 먼저 완성합니다. RAG, MCP, AI Agent 같은 AI 기능은 나중에 추가합니다.

---

## 2. 고정 기술스택

반드시 아래 기술스택을 사용합니다.

- Frontend: React
- Styling: Tailwind CSS
- Backend: FastAPI
- Database: PostgreSQL

사용자가 명시적으로 요청하지 않는 한 아래 기술로 바꾸지 않습니다.

- Next.js
- NestJS
- Spring Boot
- MySQL
- MariaDB

---

## 3. 현재 구현 범위

기능명세에 있는 기본 게시판 기능을 구현합니다.

필수 MVP 기능:

- 회원가입
- 로그인
- 마이페이지 정보 수정
- 게시글 CRUD
- 댓글
- 익명 댓글
- 대댓글
- 댓글에서 사용자 멘션
- 태그
- 검색
- 페이징

현재는 AI 기능을 구현하지 않습니다.

사용자가 명시적으로 요청하기 전까지 아래 기능은 구현하지 않습니다.

- RAG
- MCP
- AI Agent

---

## 4. 서비스 규칙

프로덕트 방향은 아래 규칙을 따릅니다.

- 이 서비스는 동네 가게에 대한 Q&A 게시판입니다.
- 사용자는 식당, 카페, 미용실, 옷가게 등 동네 가게에 대한 글을 작성합니다.
- 사용자는 실제 이용 경험을 댓글로 남길 수 있습니다.
- 익명 댓글은 화면에서는 닉네임을 숨기지만, DB에는 `author_id`를 남겨 관리 가능하게 합니다.
- GPS 기반 기능은 구현하지 않습니다.
- 네이버지도 리뷰를 크롤링하지 않습니다.
- 외부 지도/검색 연동이 필요해지면 크롤링보다 링크 생성 또는 공식 API를 우선 고려합니다.

---

## 5. 구현 순서

백엔드부터 구현합니다.

권장 순서:

1. 프로젝트 구조 정리
2. PostgreSQL Docker 설정
3. FastAPI 가상환경 설정
4. DB 연결 설정
5. SQLAlchemy 모델 작성
6. Pydantic 스키마 작성
7. 인증 API 구현
8. 사용자 API 구현
9. 게시글 API 구현
10. 댓글/대댓글 API 구현
11. 태그 API 구현
12. 검색과 페이징 구현
13. FastAPI `/docs` 또는 직접 API 호출로 백엔드 검증
14. React 프로젝트 설정
15. Tailwind CSS 설정
16. 프론트엔드 API client 작성
17. 페이지와 컴포넌트 구현
18. 프론트엔드와 백엔드 연결
19. 브라우저에서 수동 QA
20. README 업데이트

화려한 프론트엔드부터 만들지 않습니다. 먼저 백엔드 API와 DB 저장/조회 흐름이 작동하는지 확인합니다.

---

## 6. 권장 폴더 구조

가능하면 아래 구조에 가깝게 만듭니다.

```text
project-root/
  backend/
    app/
      main.py
      core/
        config.py
        security.py
      database/
        connection.py
      models/
        user.py
        post.py
        comment.py
        tag.py
      schemas/
        auth.py
        user.py
        post.py
        comment.py
        tag.py
      routers/
        auth.py
        users.py
        posts.py
        comments.py
        tags.py
      services/
        auth_service.py
        user_service.py
        post_service.py
        comment_service.py
        tag_service.py
      repositories/
        user_repository.py
        post_repository.py
        comment_repository.py
        tag_repository.py
    requirements.txt
    .env.example

  frontend/
    src/
      api/
      components/
      pages/
      types/
      hooks/
      styles/
    package.json

  docker-compose.yml
  README.md
```

프로젝트가 아직 작다면 더 단순하게 시작해도 됩니다. 다만 역할 분리는 유지합니다.

---

## 7. 백엔드 규칙

### 7.1 FastAPI 라우터

기능별로 라우터를 나눕니다.

권장 라우터:

- `auth.py`
- `users.py`
- `posts.py`
- `comments.py`
- `tags.py`

REST 스타일 API를 사용합니다.

예시:

```text
POST   /auth/signup
POST   /auth/login
GET    /auth/me
GET    /users/me
PATCH  /users/me
GET    /posts
GET    /posts/{post_id}
POST   /posts
PATCH  /posts/{post_id}
DELETE /posts/{post_id}
GET    /posts/{post_id}/comments
POST   /posts/{post_id}/comments
PATCH  /comments/{comment_id}
DELETE /comments/{comment_id}
GET    /tags
```

### 7.2 SQLAlchemy 모델

SQLAlchemy 모델은 실제 DB 테이블 구조를 정의합니다.

권장 테이블:

```text
users
posts
comments
tags
post_tags
comment_mentions
```

권장 컬럼:

```text
users
- id
- email
- nickname
- password_hash
- bio
- profile_image_url
- created_at
- updated_at

posts
- id
- author_id
- title
- content
- region
- store_name
- category
- created_at
- updated_at
- deleted_at

comments
- id
- post_id
- author_id
- parent_id
- content
- is_anonymous
- created_at
- updated_at
- deleted_at

tags
- id
- name

post_tags
- post_id
- tag_id

comment_mentions
- id
- comment_id
- mentioned_user_id
```

대댓글은 우선 `comments.parent_id`로 구현합니다.

처음에는 1단계 대댓글만 지원해도 충분합니다. 깊은 중첩 댓글은 사용자가 요청하기 전까지 구현하지 않습니다.

### 7.3 Pydantic 스키마

요청용 스키마와 응답용 스키마를 나눕니다.

예시:

```text
PostCreate
PostUpdate
PostRead
PostListItem
CommentCreate
CommentRead
UserRead
UserUpdate
```

민감한 정보는 응답에 포함하지 않습니다.

절대 응답하면 안 되는 값:

- `password_hash`
- JWT secret
- 내부 보안 필드

### 7.4 인증

JWT 기반 인증을 사용합니다.

규칙:

- 비밀번호는 해시로만 저장합니다.
- 비밀번호 원문은 저장하지 않습니다.
- 보호된 API에는 `Authorization: Bearer <token>`을 사용합니다.
- 생성/수정/삭제 API는 로그인이 필요합니다.

로그인이 필요한 기능:

- 게시글 작성
- 게시글 수정
- 게시글 삭제
- 댓글 작성
- 댓글 수정
- 댓글 삭제
- 마이페이지 정보 수정

### 7.5 권한

소유자 검사를 반드시 적용합니다.

규칙:

- 사용자는 자신이 쓴 게시글만 수정/삭제할 수 있습니다.
- 사용자는 자신이 쓴 댓글만 수정/삭제할 수 있습니다.
- 익명 댓글은 화면에서만 익명입니다. 백엔드는 실제 작성자를 알고 있어야 합니다.

### 7.6 에러 처리

HTTP 상태코드를 적절히 사용합니다.

권장 상태코드:

```text
400 Bad Request: 잘못된 요청
401 Unauthorized: 로그인 필요 또는 잘못된 토큰
403 Forbidden: 권한 없음
404 Not Found: 리소스 없음
409 Conflict: 이메일/닉네임/태그 중복
422 Unprocessable Entity: 유효성 검사 실패
500 Internal Server Error: 예상하지 못한 서버 오류
```

에러 메시지는 사용자가 이해할 수 있게 작성합니다.

### 7.7 검색과 페이징

게시글 검색은 `GET /posts`에서 query parameter로 처리합니다.

예시:

```text
GET /posts?keyword=카페&tag=혼밥&page=1&size=10
```

검색 대상:

- title
- content
- store_name
- region
- category
- tag name

페이징 응답에는 아래 값을 포함합니다.

```text
items
total_count
page
size
total_pages
```

---

## 8. 프론트엔드 규칙

### 8.1 React

React와 TypeScript를 사용합니다.

컴포넌트 파일은 `.tsx` 확장자를 사용합니다.

권장 페이지:

```text
SignupPage
LoginPage
MyPage
PostListPage
PostDetailPage
PostWritePage
PostEditPage
```

권장 컴포넌트:

```text
PostCard
PostForm
CommentList
CommentItem
CommentForm
TagBadge
Pagination
SearchBar
```

### 8.2 Tailwind CSS

스타일링은 Tailwind CSS를 사용합니다.

UI는 단순하고 읽기 쉽게 만듭니다.

핵심 기능이 작동하기 전에는 장식적인 디자인에 많은 시간을 쓰지 않습니다.

우선순위:

1. 명확한 레이아웃
2. 읽기 쉬운 입력 폼
3. 이해하기 쉬운 버튼
4. 에러/로딩 상태
5. 모바일에서도 깨지지 않는 간격

### 8.3 API 호출

API 호출 함수는 별도 폴더에 둡니다.

예시:

```text
src/api/authApi.ts
src/api/postApi.ts
src/api/commentApi.ts
src/api/tagApi.ts
```

프로젝트가 커지면 `fetch` 호출을 컴포넌트 여기저기에 흩뿌리지 않습니다.

### 8.4 로그인 상태

로그인 상태는 신중하게 관리합니다.

MVP 기준:

- access token을 메모리 또는 localStorage에 저장합니다.
- 보호된 API 요청에 token을 붙입니다.
- token이 없거나 만료된 상태를 처리합니다.

나중에 개선할 수 있는 부분:

- refresh token
- httpOnly cookie
- 보안 강화

---

## 9. 기능명세 요약

기능명세 파일이 있으면 구현 전에 먼저 확인합니다.

예상 기능 그룹:

```text
인증
- 회원가입
- 로그인
- 현재 사용자 조회

사용자
- 마이페이지 조회
- 마이페이지 정보 수정

게시글
- 게시글 작성
- 게시글 목록 조회
- 게시글 상세 조회
- 게시글 수정
- 게시글 삭제

댓글
- 댓글 작성
- 댓글 수정
- 댓글 삭제
- 익명 댓글
- 대댓글
- 사용자 멘션

태그
- 태그 조회
- 게시글과 태그 연결
- 태그별 게시글 조회

검색/페이징
- 키워드 검색
- 태그 필터
- 페이지 단위 조회
```

기능명세와 이 문서가 충돌하면 사용자에게 확인합니다.

---

## 10. Agent가 해야 할 일

Agent는 아래를 지킵니다.

- 기능명세를 따른다.
- 백엔드부터 구현한다.
- 초보자가 읽을 수 있는 코드를 작성한다.
- 중요한 구현 선택은 짧게 설명한다.
- 작은 단위로 구현하고 검증한다.
- 과한 추상화보다 단순하게 작동하는 코드를 우선한다.
- 프론트엔드와 백엔드 역할을 명확히 분리한다.
- 실행 방법이 바뀌면 README를 업데이트한다.
- FastAPI `/docs` 또는 직접 API 호출로 백엔드 API를 검증한다.
- 사용자가 만든 변경사항을 임의로 되돌리지 않는다.

---

## 11. Agent가 하지 말아야 할 일

Agent는 아래를 하지 않습니다.

- 허락 없이 기술스택을 바꾸지 않는다.
- 요청 전에는 AI 기능을 추가하지 않는다.
- GPS 기반 기능을 추가하지 않는다.
- 네이버지도를 크롤링하지 않는다.
- 비밀번호 원문을 저장하지 않는다.
- API 응답에 `password_hash`를 포함하지 않는다.
- 프로젝트가 커진 뒤에도 모든 백엔드 로직을 `main.py`에 몰아넣지 않는다.
- 백엔드가 작동하기 전에 프론트엔드 디자인만 과하게 만들지 않는다.
- MVP에 필요 없는 복잡한 구조를 먼저 추가하지 않는다.
- 사용자가 만든 파일을 허락 없이 삭제하거나 덮어쓰지 않는다.

---

## 12. 완료 기준

기능 하나가 완료되려면 아래 조건을 만족해야 합니다.

- API가 존재하고 정상 동작한다.
- 필요한 경우 DB 저장/조회가 정상 동작한다.
- 요청/응답 스키마가 명확하다.
- 에러 상황을 처리한다.
- 사용자 화면이 필요한 기능이면 프론트엔드에서 사용할 수 있다.
- 수동 테스트가 가능하다.
- 기능명세와 일치한다.

백엔드 전용 단계는 FastAPI `/docs` 검증으로 충분합니다.

프론트엔드와 연결된 기능은 브라우저에서도 확인합니다.

---

## 13. MVP 우선순위

아래 순서로 구현합니다.

```text
1. 회원가입
2. 로그인
3. 현재 사용자 조회
4. 게시글 작성/조회
5. 게시글 수정/삭제
6. 댓글 작성/조회
7. 댓글 수정/삭제
8. 익명 댓글
9. 대댓글
10. 태그
11. 검색
12. 페이징
13. 마이페이지 정보 수정
14. 사용자 멘션
```

시간이 부족하면 사용자 멘션은 우선 댓글 내용에 `@nickname` 텍스트로 저장하는 방식으로 단순화합니다.

---

## 14. 초보자 친화 구현 원칙

두 가지 구현 방식이 있다면, 실제 버그나 보안 문제가 생기지 않는 한 초보자가 이해하기 쉬운 방식을 선택합니다.

우선할 것:

- 명확한 이름
- 작은 파일
- 명시적인 함수
- 직접적인 데이터 흐름
- 단순한 SQLAlchemy 관계
- 읽기 쉬운 Pydantic 스키마

피할 것:

- 숨겨진 마법 같은 코드
- 너무 이른 추상화
- 깊게 중첩된 generic 코드
- 기본 기능이 작동하기 전의 과한 라이브러리 추가

---

## 15. 구현 전 최종 체크 항목

구현을 시작하기 전에 아래 항목을 위에서부터 순서대로 확인합니다.

### 15.1 화면 흐름 확정

먼저 사용자가 어떤 순서로 서비스를 이용하는지 정합니다.

기본 화면 흐름:

```text
회원가입 -> 로그인 -> 게시글 목록 -> 게시글 상세 -> 댓글 작성
로그인 -> 게시글 작성 -> 게시글 목록/상세에서 확인
로그인 -> 마이페이지 -> 내 정보 수정
```

필수 페이지:

- `SignupPage`
- `LoginPage`
- `PostListPage`
- `PostDetailPage`
- `PostWritePage`
- `PostEditPage`
- `MyPage`

처음 구현할 때는 화면을 예쁘게 만드는 것보다, 버튼을 눌렀을 때 올바른 페이지로 이동하고 API가 호출되는지 확인하는 것을 우선합니다.

### 15.2 DB 구조 확정

백엔드 구현 전에 어떤 데이터가 어떤 테이블에 저장되는지 먼저 정합니다.

핵심 관계:

```text
users 1:N posts
users 1:N comments
posts 1:N comments
posts N:M tags
comments 1:N comments
comments N:M users(comment_mentions)
```

삭제 정책:

- 게시글은 `deleted_at`을 사용하는 소프트 삭제를 우선 고려합니다.
- 댓글도 `deleted_at`을 사용하는 소프트 삭제를 우선 고려합니다.
- 삭제된 게시글과 댓글은 일반 목록에서는 보이지 않게 처리합니다.
- 익명 댓글도 DB에는 `author_id`를 남깁니다.

대댓글 정책:

- 처음에는 1단계 대댓글만 구현합니다.
- `comments.parent_id`가 있으면 대댓글로 판단합니다.
- 깊은 중첩 댓글은 MVP 이후로 미룹니다.

### 15.3 API 응답 규칙 확정

프론트엔드가 예측 가능하게 사용할 수 있도록 응답 형식을 일정하게 유지합니다.

단일 데이터 응답 예시:

```json
{
  "id": 1,
  "title": "이 카페 노트북하기 괜찮나요?",
  "content": "콘센트와 좌석이 궁금합니다."
}
```

목록 응답 예시:

```json
{
  "items": [],
  "total_count": 0,
  "page": 1,
  "size": 10,
  "total_pages": 0
}
```

에러 응답 예시:

```json
{
  "detail": "로그인이 필요합니다."
}
```

응답 규칙:

- 목록 API는 가능하면 `items`, `total_count`, `page`, `size`, `total_pages`를 포함합니다.
- 비밀번호, `password_hash`, JWT secret은 절대 응답하지 않습니다.
- 프론트엔드에서 그대로 보여줄 수 있도록 에러 메시지는 짧고 명확하게 작성합니다.

### 15.4 인증과 권한 규칙 확정

로그인이 필요한 기능과 소유자 검사가 필요한 기능을 구분합니다.

로그인이 필요한 기능:

- 게시글 작성
- 게시글 수정
- 게시글 삭제
- 댓글 작성
- 댓글 수정
- 댓글 삭제
- 마이페이지 정보 수정

소유자 검사가 필요한 기능:

- 게시글 수정
- 게시글 삭제
- 댓글 수정
- 댓글 삭제

인증 규칙:

- 로그인 성공 시 access token을 발급합니다.
- 보호된 API는 `Authorization: Bearer <token>` 헤더를 사용합니다.
- 토큰이 없거나 잘못되면 `401 Unauthorized`를 반환합니다.
- 작성자가 아니면 `403 Forbidden`을 반환합니다.

### 15.5 입력 검증 규칙 확정

사용자가 잘못된 값을 넣었을 때 DB까지 들어가기 전에 막습니다.

권장 검증 기준:

```text
email: 이메일 형식, 중복 불가
password: 최소 8자 이상
nickname: 2자 이상 20자 이하, 중복 불가
post.title: 1자 이상 100자 이하
post.content: 1자 이상 5000자 이하
comment.content: 1자 이상 1000자 이하
tag.name: 1자 이상 20자 이하
page: 1 이상
size: 1 이상 50 이하
```

검증 실패는 FastAPI와 Pydantic의 기본 `422 Unprocessable Entity`를 우선 사용합니다.

### 15.6 에러 처리 규칙 확정

기능별로 실패 상황을 미리 생각하고 처리합니다.

자주 발생하는 실패 상황:

- 중복 이메일로 회원가입
- 틀린 비밀번호로 로그인
- 없는 게시글 조회
- 삭제된 게시글 조회
- 남의 게시글 수정/삭제
- 남의 댓글 수정/삭제
- 빈 제목 또는 빈 댓글 등록

상태코드 기준:

```text
400 Bad Request: 요청 값이 이상함
401 Unauthorized: 로그인이 필요함
403 Forbidden: 권한이 없음
404 Not Found: 대상 데이터가 없음
409 Conflict: 중복 데이터
422 Unprocessable Entity: 입력 검증 실패
```

### 15.7 환경변수와 실행 방법 확정

프로젝트를 새로 받은 사람이 실행할 수 있도록 필요한 설정을 문서화합니다.

필수 파일:

- `docker-compose.yml`
- `backend/.env.example`
- `backend/requirements.txt`
- `frontend/package.json`
- `README.md`

필수 환경변수 예시:

```text
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/prac
SECRET_KEY=change-me
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

실행 명령어가 바뀌면 반드시 README도 함께 수정합니다.

### 15.8 Git 작업 규칙 확정

작업 단위가 너무 커지지 않도록 기능 단위로 커밋합니다.

브랜치 예시:

```text
feature/hyeok-auth
feature/hyeok-posts
feature/hyeok-comments
feature/hyeok-frontend
```

커밋 메시지 예시:

```text
feat: add signup api
feat: add login api
feat: add post crud api
fix: handle unauthorized post update
docs: update run instructions
```

한 커밋에는 가능하면 하나의 의도만 담습니다.

### 15.9 테스트 체크리스트 확정

기능을 만들 때마다 아래 순서로 확인합니다.

백엔드 테스트:

```text
1. FastAPI 서버 실행
2. /docs 접속
3. 요청 예시 입력
4. 응답 상태코드 확인
5. DB에 데이터 저장 여부 확인
6. 실패 케이스 확인
```

프론트엔드 테스트:

```text
1. React 서버 실행
2. 브라우저에서 화면 접속
3. 실제 입력 폼으로 기능 실행
4. 성공/실패 메시지 확인
5. 새로고침 후에도 필요한 데이터가 유지되는지 확인
```

테스트가 어려운 기능은 최소한 `/docs`에서 수동 검증할 수 있어야 합니다.

### 15.10 MVP 컷라인 확정

5주 프로젝트에서는 모든 기능을 완벽하게 만들기보다, 발표 가능한 핵심 흐름을 먼저 완성합니다.

무조건 완성할 기능:

- 회원가입
- 로그인
- 현재 사용자 조회
- 게시글 작성
- 게시글 목록 조회
- 게시글 상세 조회
- 댓글 작성
- 댓글 조회

가능하면 완성할 기능:

- 게시글 수정/삭제
- 댓글 수정/삭제
- 익명 댓글
- 대댓글
- 태그
- 검색
- 페이징
- 마이페이지 정보 수정

시간이 부족하면 미룰 기능:

- 사용자 멘션
- 프로필 이미지 업로드
- 깊은 중첩 대댓글
- AI 기능
- 외부 지도/검색 API 연동

---

## 16. 아주 작은 구현 단위 작업 순서

이 프로젝트는 바이브코딩을 활용하되, 재혁님이 구현 흐름을 따라갈 수 있도록 아주 작은 단위로 나누어 진행합니다.

각 작업 단위마다 아래 순서를 반복합니다.

```text
1. 이번에 만들 기능을 한 문장으로 정한다.
2. 수정할 파일 목록을 먼저 확인한다.
3. 백엔드라면 /docs 또는 직접 API 호출로 확인한다.
4. 프론트엔드라면 브라우저에서 실제 클릭과 입력으로 확인한다.
5. 동작 결과를 짧게 정리한다.
6. 문제가 없으면 다음 작은 단위로 넘어간다.
```

### 16.1 백엔드 기반 작업

```text
B01. backend 폴더 구조 만들기
B02. FastAPI 실행 확인
B03. PostgreSQL Docker 실행 확인
B04. DATABASE_URL 환경변수 설정
B05. SQLAlchemy DB 연결 확인
B06. 공통 Base 모델과 DB session 의존성 만들기
B07. health check API 만들기
```

완료 기준:

- FastAPI 서버가 실행됩니다.
- PostgreSQL이 실행됩니다.
- `/docs`에 접속할 수 있습니다.
- DB 연결이 실패하지 않습니다.

### 16.2 회원과 인증 작업

```text
A01. User SQLAlchemy 모델 만들기
A02. User Pydantic 스키마 만들기
A03. 비밀번호 해싱 함수 만들기
A04. 회원가입 API 만들기
A05. 중복 이메일/닉네임 검사 추가
A06. 로그인 API 만들기
A07. JWT 발급 함수 만들기
A08. 현재 사용자 조회 API 만들기
A09. 로그인 필요한 API에서 사용할 get_current_user 만들기
```

완료 기준:

- 회원가입 시 DB에 사용자가 저장됩니다.
- 비밀번호는 해시로 저장됩니다.
- 로그인 시 access token이 발급됩니다.
- token으로 내 정보를 조회할 수 있습니다.

### 16.3 게시글 작업

```text
P01. Post SQLAlchemy 모델 만들기
P02. Post Pydantic 스키마 만들기
P03. 게시글 작성 API 만들기
P04. 게시글 목록 조회 API 만들기
P05. 게시글 상세 조회 API 만들기
P06. 게시글 수정 API 만들기
P07. 게시글 삭제 API 만들기
P08. 작성자 권한 검사 추가
P09. 삭제된 게시글 숨김 처리 추가
```

완료 기준:

- 로그인한 사용자가 게시글을 작성할 수 있습니다.
- 게시글 목록과 상세를 조회할 수 있습니다.
- 작성자만 수정/삭제할 수 있습니다.

### 16.4 댓글 작업

```text
C01. Comment SQLAlchemy 모델 만들기
C02. Comment Pydantic 스키마 만들기
C03. 댓글 작성 API 만들기
C04. 댓글 목록 조회 API 만들기
C05. 댓글 수정 API 만들기
C06. 댓글 삭제 API 만들기
C07. 익명 댓글 표시 규칙 추가
C08. parent_id 기반 대댓글 작성 추가
C09. 대댓글 목록 표시용 응답 구조 정리
```

완료 기준:

- 게시글 상세에서 댓글을 조회할 수 있습니다.
- 로그인한 사용자가 댓글을 작성할 수 있습니다.
- 익명 댓글은 화면용 응답에서 작성자 닉네임이 숨겨집니다.
- 대댓글은 특정 댓글 아래에 연결됩니다.

### 16.5 태그, 검색, 페이징 작업

```text
T01. Tag SQLAlchemy 모델 만들기
T02. post_tags 연결 테이블 만들기
T03. 게시글 작성 시 태그 연결하기
T04. 태그 목록 조회 API 만들기
S01. keyword 검색 추가
S02. tag 검색 추가
S03. page, size 페이징 추가
S04. total_count, total_pages 응답 추가
```

완료 기준:

- 게시글에 태그를 연결할 수 있습니다.
- 키워드로 게시글을 검색할 수 있습니다.
- 게시글 목록이 페이지 단위로 조회됩니다.

### 16.6 프론트엔드 기반 작업

```text
F01. React 프로젝트 실행 확인
F02. Tailwind CSS 적용 확인
F03. 공통 API client 만들기
F04. 회원가입 페이지 만들기
F05. 로그인 페이지 만들기
F06. 로그인 token 저장 처리하기
F07. 게시글 목록 페이지 만들기
F08. 게시글 상세 페이지 만들기
F09. 게시글 작성 페이지 만들기
F10. 게시글 수정 페이지 만들기
F11. 댓글 작성/목록 컴포넌트 만들기
F12. 익명 댓글 체크박스 만들기
F13. 대댓글 입력 UI 만들기
F14. 태그 입력/표시 UI 만들기
F15. 검색창과 페이징 UI 만들기
F16. 마이페이지 정보 수정 화면 만들기
```

완료 기준:

- 사용자가 브라우저에서 회원가입과 로그인을 할 수 있습니다.
- 게시글 작성, 조회, 댓글 작성 흐름을 실제로 사용할 수 있습니다.
- 에러와 로딩 상태가 최소한으로 표시됩니다.

### 16.7 통합 검증 작업

```text
Q01. 회원가입부터 로그인까지 직접 테스트
Q02. 로그인 후 게시글 작성 테스트
Q03. 게시글 목록/상세 조회 테스트
Q04. 댓글/익명 댓글/대댓글 테스트
Q05. 태그/검색/페이징 테스트
Q06. 작성자가 아닌 사용자의 수정/삭제 실패 테스트
Q07. README 실행 방법 확인
Q08. 발표용 데모 흐름 정리
```

완료 기준:

- 처음 실행하는 사람도 README를 보고 프로젝트를 실행할 수 있습니다.
- 발표에서 보여줄 핵심 흐름이 끊기지 않습니다.
- 주요 실패 상황도 최소 한 번씩 확인되어 있습니다.
