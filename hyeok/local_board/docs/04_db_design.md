# DB 설계서

## 1. 문서 목적

이 문서는 Local Board에서 사용하는 데이터베이스 테이블, 컬럼, 관계, 삭제 정책을 정리합니다.

## 2. DBMS

| 항목 | 내용 |
| --- | --- |
| DBMS | PostgreSQL |
| 실행 방식 | Docker Compose |
| ORM | SQLAlchemy |
| Schema 관리 | 현재는 SQLAlchemy `Base.metadata.create_all()` 중심 |

## 3. ERD 개요

```text
users 1 ── N posts
users 1 ── N comments
posts 1 ── N comments
posts N ── N tags
comments 1 ── N comments
```

## 4. users 테이블

사용자 계정 정보를 저장합니다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | Integer | PK | 사용자 id |
| email | String(255) | Unique, Not Null | 로그인 이메일 |
| nickname | String(50) | Unique, Not Null | 사용자 닉네임 |
| password_hash | String(255) | Not Null | 해싱된 비밀번호 |
| bio | String(255) | Nullable | 소개글 |
| created_at | DateTime | Not Null | 생성일 |
| updated_at | DateTime | Not Null | 수정일 |

## 5. posts 테이블

게시글 정보를 저장합니다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | Integer | PK | 게시글 id |
| author_id | Integer | FK users.id, Not Null | 작성자 |
| title | String(100) | Not Null | 제목 |
| content | Text | Not Null | 본문 |
| region | String(100) | Nullable | 지역 |
| store_name | String(100) | Nullable | 가게명 |
| category | String(50) | Nullable | 분류 |
| view_count | Integer | Not Null, default 0 | 조회수 |
| created_at | DateTime | Not Null | 생성일 |
| updated_at | DateTime | Not Null | 수정일 |
| deleted_at | DateTime | Nullable | 삭제 여부 표시 |

## 6. comments 테이블

댓글과 대댓글 정보를 저장합니다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | Integer | PK | 댓글 id |
| post_id | Integer | FK posts.id, Not Null | 게시글 id |
| author_id | Integer | FK users.id, Not Null | 작성자 id |
| parent_id | Integer | FK comments.id, Nullable | 부모 댓글 id |
| content | Text | Not Null | 댓글 내용 |
| is_anonymous | Boolean | Not Null, default false | 익명 여부 |
| created_at | DateTime | Not Null | 생성일 |
| updated_at | DateTime | Not Null | 수정일 |
| deleted_at | DateTime | Nullable | 삭제 여부 표시 |

## 7. tags 테이블

태그 정보를 저장합니다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | Integer | PK | 태그 id |
| name | String(50) | Unique, Not Null | 태그명 |
| created_at | DateTime | Not Null | 생성일 |

## 8. post_tags 테이블

게시글과 태그의 N:M 관계를 저장합니다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| post_id | Integer | PK, FK posts.id | 게시글 id |
| tag_id | Integer | PK, FK tags.id | 태그 id |

## 9. post_embeddings 테이블

현재 코드에서는 게시글 삭제 시 `post_embeddings` 테이블 존재 여부를 확인한 뒤 해당 게시글의 임베딩 데이터를 삭제합니다.

| 컬럼 | 설명 |
| --- | --- |
| post_id | 게시글 id |
| embedding | 게시글 임베딩 벡터 |

비고:

- 코드상 삭제 대응은 되어 있습니다.
- 실제 테이블 구조는 pgvector 고도화 상태에 따라 달라질 수 있습니다.

## 10. 삭제 정책

### 게시글 삭제

게시글 삭제 시 다음 순서로 관련 데이터를 정리합니다.

```text
1. post_embeddings 데이터 삭제
2. post_tags 연결 삭제
3. 댓글 삭제
4. 게시글 삭제
```

현재 게시글은 실제 DB row 삭제 방식입니다.

### 댓글 삭제

댓글은 대화 흐름 유지를 위해 물리 삭제가 아니라 삭제 표시 방식으로 처리합니다.

```text
삭제 전: 작성자 닉네임 + 댓글 내용 표시
삭제 후: 작성자 숨김 + "삭제된 댓글입니다" 표시
```

## 11. 인덱스 고려사항

현재 기본 인덱스:

- PK 인덱스
- users.email
- users.nickname
- posts.id
- comments.id
- tags.name

향후 추가 고려:

| 대상 | 이유 |
| --- | --- |
| posts.created_at | 최신순 정렬 최적화 |
| posts.view_count | 조회순 정렬 최적화 |
| comments.post_id | 댓글 목록 조회 최적화 |
| posts.store_name | RAG 가게명 필터 최적화 |
| post_tags.post_id, post_tags.tag_id | 태그 검색 최적화 |

## 12. 테스트 데이터 정책

현재 실제 테스트 데이터는 네이버 지역검색 API를 통해 생성합니다.

| 지역 | 게시글 수 |
| --- | ---: |
| 용인 처인구 | 50 |
| 창원 성산구 | 100 |
| 사당역 | 100 |

생성 스크립트:

```text
backend/scripts/seed_real_place_test_data.py
```

주의:

- 실제 가게명과 분류는 네이버 지역검색 API 기반입니다.
- 댓글은 발표용 샘플 데이터입니다.
- 네이버 방문자 리뷰 본문은 수집하지 않습니다.
