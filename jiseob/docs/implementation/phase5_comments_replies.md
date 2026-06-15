# Phase 5. Comment / Reply 구현 정리

> 브랜치: `feature/jiseob/phase5-comments`  
> 기준 단계: `arena_implementation_plan.md`의 Phase 5  
> 목표: 게시글에 댓글과 1단계 대댓글을 작성하고, 게시글의 `commentCount`를 댓글 원본 데이터와 연결한다.

---

## 1. 이번 단계에서 추가한 것

Phase 5에서는 게시글 토론의 기본 단위인 댓글과 대댓글을 추가했다.

추가한 핵심 도메인:

```text
Comment
```

댓글은 게시글에 직접 달리고, 대댓글은 댓글에 달린다. MVP에서는 최대 2단계까지만 허용한다.

```text
Post
└─ Comment
   └─ Reply
```

대댓글의 대댓글은 허용하지 않는다. 이 제한은 Entity만으로 표현하기 어렵기 때문에 `CommentsService`에서 부모 댓글의 `parentCommentId`를 확인해 차단한다.

---

## 2. 추가한 DB 테이블

새 migration:

```text
backend/src/database/migrations/2026061302000-CreateComments.ts
```

추가 테이블:

- `comments`

중요한 컬럼:

- `post_id`: 댓글이 달린 게시글
- `author_id`: 댓글 작성자
- `parent_comment_id`: 대댓글일 경우 부모 댓글
- `content`: 댓글 본문
- `moderation_status`: 일반/사용자 삭제/관리자 삭제 등 표시 상태
- `deleted_at`: soft delete 시각

중요한 제약:

- `comments.post_id`는 `posts.id`를 참조한다.
- `comments.author_id`는 `users.id`를 참조한다.
- `comments.parent_comment_id`는 `comments.id`를 참조한다.
- 자기 자신을 부모로 둘 수 없도록 check constraint를 둔다.

`TypeORM synchronize`는 계속 `false`이며, DB schema 변경은 migration으로만 관리한다.

---

## 3. 구현한 API

```http
GET    /api/v1/posts/:postId/comments
POST   /api/v1/posts/:postId/comments
POST   /api/v1/comments/:commentId/replies
PATCH  /api/v1/comments/:commentId
DELETE /api/v1/comments/:commentId
```

권한 정책:

- 댓글 목록 조회는 공개 API다.
- 댓글 작성, 대댓글 작성, 댓글 수정, 댓글 삭제는 로그인 사용자만 가능하고 CSRF 검증을 적용한다.
- 댓글 수정/삭제는 작성자만 가능하다.
- 존재하지 않거나 삭제된 게시글에 대한 댓글 API는 `404 Not Found`를 반환한다.

---

## 4. 댓글 / 대댓글 정책

댓글 작성:

- 로그인 사용자가 삭제되지 않은 게시글에만 작성할 수 있다.
- 댓글 본문은 앞뒤 공백을 제거해 저장한다.
- 공백만 있는 댓글은 `400 Bad Request`로 거부한다.
- 생성 직후 `moderationStatus=NORMAL`로 시작한다.

대댓글 작성:

- parent comment가 존재하고 삭제되지 않아야 한다.
- parent comment는 최상위 댓글이어야 한다.
- parent comment가 이미 대댓글이면 `400 Bad Request`를 반환한다.
- 대댓글의 `postId`는 요청 body가 아니라 parent comment의 `postId`를 사용한다.

댓글 수정:

- 작성자만 수정할 수 있다.
- 삭제된 댓글은 수정할 수 없다.
- 수정 시에도 공백만 있는 본문은 거부한다.

댓글 삭제:

- 실제 row 삭제가 아니라 soft delete로 처리한다.
- 사용자 삭제 시 `moderationStatus=DELETED_BY_USER`로 변경한다.
- 이미 삭제된 댓글을 같은 작성자가 다시 삭제하면 `204 No Content`로 처리하고 카운터는 다시 줄이지 않는다.
- 삭제된 댓글의 대댓글은 유지한다.

---

## 5. 삭제된 댓글 표시 정책

댓글 목록 조회는 soft-deleted 댓글도 thread 구조 유지를 위해 함께 조회한다.

삭제된 댓글은 원문을 노출하지 않고 placeholder 문구를 내려준다.

```text
사용자 삭제: 삭제된 댓글입니다
관리자 삭제: 관리자에 의해 삭제된 댓글입니다
```

관리자 삭제 API는 Phase 10 범위이지만, Phase 5에서 `DELETED_BY_ADMIN` 상태 표시 정책은 준비해 두었다.

회원 탈퇴 사용자의 댓글은 삭제하지 않는다. 작성자 정보는 `탈퇴한 회원`으로 표시한다.

---

## 6. commentCount 연결

Phase 4에서 `posts.comment_count` 컬럼을 먼저 추가했고, Phase 5에서 실제 댓글 원본 데이터와 연결했다.

정책:

- 최상위 댓글 생성 시 `commentCount += 1`
- 대댓글 생성 시 `commentCount += 1`
- 삭제되지 않은 댓글을 soft delete할 때 `commentCount -= 1`
- 이미 삭제된 댓글을 다시 삭제하면 `commentCount`를 변경하지 않는다.
- 감소 시 `GREATEST(comment_count - 1, 0)`로 음수 방어를 한다.

댓글 생성/삭제와 `posts.comment_count` 변경은 같은 transaction 안에서 처리한다.

---

## 7. AI 분석과의 관계

AGENTS 문서에는 댓글 작성 직후 AI 분석을 자동 시도하는 정책이 정의되어 있다.

다만 Phase 5에서는 AI 모듈을 직접 연결하지 않는다.

이유:

- Phase 5의 목표는 댓글/대댓글 CRUD와 카운터 정합성이다.
- `CommentsService`가 AI 세부 로직을 직접 알면 추후 순환 의존성이 커질 수 있다.
- `CommentAnalysis` row 생성과 분석 상태 처리는 Phase 7에서 `AiModule` 책임으로 구현한다.

현재 Phase 5는 댓글 작성 직후 AI 분석을 붙일 수 있도록 `moderationStatus` 기반만 준비한다.

---

## 8. 테스트 추가

추가 테스트:

- 대댓글의 대댓글 작성 차단
- 이미 삭제된 댓글 재삭제 시 `commentCount` 중복 감소 방지
- 삭제된 댓글 placeholder와 대댓글 유지 응답 확인

검증한 명령:

```bash
pnpm.cmd --filter @arena/backend typecheck
pnpm.cmd --filter @arena/backend test
```

---

## 9. API smoke test 결과

로컬 PostgreSQL 컨테이너와 빌드된 backend 서버를 사용해 실제 HTTP 요청 흐름을 검증했다.

실행 조건:

```text
API base: http://localhost:3000/api/v1
WEB_ORIGIN: http://localhost:5173
JWT_ACCESS_SECRET: smoke-jwt-access-secret
CSRF_SECRET: smoke-csrf-secret
```

검증한 흐름:

- `POST /auth/signup` → 사용자 생성
- `POST /auth/login` → Access Token과 CSRF cookie 확보
- `POST /posts` → 테스트 게시글 생성
- 인증 없이 `POST /posts/:postId/comments` → `401`
- CSRF 없이 `POST /posts/:postId/comments` → `403`
- 인증과 CSRF 포함 `POST /posts/:postId/comments` → `201`
- 댓글 본문 앞뒤 공백 trim 저장 확인
- 댓글 작성 후 `GET /posts/:postId`에서 `commentCount=1`
- `POST /comments/:commentId/replies` → `201`
- 대댓글 작성 후 `commentCount=2`
- 대댓글에 다시 `POST /comments/:replyId/replies` → `400`
- 다른 사용자로 `PATCH /comments/:commentId` → `403`
- 댓글 작성자로 `PATCH /comments/:commentId` → `200`
- 댓글 작성자로 `DELETE /comments/:commentId` → `204`
- 댓글 삭제 후 `GET /posts/:postId`에서 `commentCount=1`
- 댓글 삭제 후 `GET /posts/:postId/comments`에서 삭제된 댓글 placeholder와 대댓글 유지 확인
- 대댓글 삭제 후 `commentCount=0`
- 게시글 삭제 후 `GET /posts/:postId/comments` → `404`

실제 smoke test 결과:

```text
signup user1 -> 201
login user1 -> 200
signup user2 -> 201
login user2 -> 200
create post -> 201
comment without auth -> 401
comment without csrf -> 403
create comment -> 201
post after comment -> 200
create reply -> 201
post after reply -> 200
reply to reply rejected -> 400
other user patch rejected -> 403
author patch comment -> 200
delete root comment -> 204
post after root delete -> 200
list comments -> 200
delete reply -> 204
post after reply delete -> 200
delete post -> 204
comments on deleted post -> 404
```

Smoke test에서 추가 수정이 필요한 이슈는 발견되지 않았다.

---

## 10. 다음 단계

다음은 Phase 6 `영상 메타데이터 / 자막 / 임베딩 처리`다.

Phase 6에서 이어받을 핵심:

- 게시글 작성 시 이미 `Video` row와 상태값이 생성된다.
- `metadataStatus`, `transcriptStatus`, `embeddingStatus`가 모두 `PENDING`으로 시작한다.
- YouTube API 또는 내부 비동기 처리 실패는 게시글 기능 실패와 분리해야 한다.
- Redis/BullMQ는 MVP 범위가 아니며, 우선 DB 상태값 기반으로 처리한다.
