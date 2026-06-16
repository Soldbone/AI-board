# Phase 4. Post / Tag / Video 구현 정리

> 브랜치: `feature/jiseob/phase4-post-tag-video`  
> 기준 단계: `arena_implementation_plan.md`의 Phase 4  
> 목표: 유튜브 URL 기반 게시글 CRUD, 태그, 영상 row 생성/재사용, 게시글 파생 카운터 기반을 구현한다.

---

## 1. 이번 단계에서 추가한 것

Phase 4에서는 Arena가 실제 게시판처럼 동작하기 위한 기본 도메인을 추가했다.

추가한 핵심 도메인:

```text
Post
Video
Tag
PostTag
PostLike
```

이번 단계에서는 YouTube API를 호출하지 않는다. 게시글 작성 요청이 오면 YouTube URL에서 `youtubeVideoId`만 추출하고, 해당 ID의 `Video` row를 생성하거나 재사용한다.

새 영상의 처리 상태는 모두 다음 값으로 시작한다.

```text
metadataStatus=PENDING
transcriptStatus=PENDING
embeddingStatus=PENDING
```

이 구조 덕분에 외부 API나 AI 처리가 아직 없어도 게시글 작성과 조회 흐름을 먼저 안정화할 수 있다.

---

## 2. 추가한 DB 테이블

새 migration:

```text
backend/src/database/migrations/2026061301000-CreatePostsVideosTags.ts
```

추가 테이블:

- `videos`
- `posts`
- `tags`
- `post_tags`
- `post_likes`

중요한 제약:

- `videos.youtube_video_id`는 unique다.
- `tags.name`은 unique다.
- `post_tags`는 `post_id + tag_id` composite primary key를 사용한다.
- `post_likes`는 `post_id + user_id` composite primary key를 사용한다.
- `posts.comment_count`, `posts.view_count`, `posts.like_count`는 0 이상이어야 한다.

`TypeORM synchronize`는 계속 `false`이며, DB schema 변경은 migration으로만 관리한다.

---

## 3. 구현한 API

```http
GET    /api/v1/posts
POST   /api/v1/posts
GET    /api/v1/posts/:postId
PATCH  /api/v1/posts/:postId
DELETE /api/v1/posts/:postId
POST   /api/v1/posts/:postId/views
POST   /api/v1/posts/:postId/like
DELETE /api/v1/posts/:postId/like
GET    /api/v1/tags
GET    /api/v1/videos/:videoId
```

권한 정책:

- 게시글 목록/상세, 태그 목록, 영상 조회, 조회수 증가는 공개 API다.
- 게시글 작성/수정/삭제는 로그인 사용자만 가능하고 CSRF 검증을 적용한다.
- 게시글 수정/삭제는 작성자만 가능하다.
- 좋아요/좋아요 취소는 로그인 사용자만 가능하고 CSRF 검증을 적용한다.

---

## 4. 파생 카운터 설계

게시글 목록과 상세 화면에서 자주 필요한 값을 `posts` 테이블에 저장한다.

```text
posts.comment_count
posts.view_count
posts.like_count
```

의미:

- `commentCount`: 삭제되지 않은 댓글과 대댓글 수
- `viewCount`: Arena 내부 게시글 조회 수
- `likeCount`: Arena 내부 게시글 좋아요 수

원본 데이터:

- 댓글 수의 원본은 Phase 5에서 추가될 `comments` 테이블이다.
- 좋아요 수의 원본은 Phase 4에서 추가한 `post_likes` 테이블이다.
- 조회수는 MVP에서는 별도 이벤트 테이블 없이 `posts.view_count`를 직접 증가시킨다.

구현한 정책:

- 좋아요 생성과 `likeCount` 증가는 같은 transaction 안에서 처리한다.
- 좋아요 취소와 `likeCount` 감소도 같은 transaction 안에서 처리한다.
- 같은 사용자가 같은 게시글을 중복 좋아요하면 `409 Conflict`를 반환한다.
- 좋아요하지 않은 게시글 좋아요 취소는 `204 No Content`로 처리하고 카운터는 변경하지 않는다.
- 카운터 감소 시 `GREATEST(count - 1, 0)`로 음수 방어를 한다.
- 댓글 작성/삭제에 따른 `commentCount` 증감은 CommentsModule이 구현되는 Phase 5에서 연결한다.

---

## 5. Video 통계와 이름 분리

`Video`의 조회수/좋아요/댓글 수는 YouTube 외부 통계이고, `Post`의 조회수/좋아요/댓글 수는 Arena 내부 통계다.

따라서 이름을 섞지 않는다.

```text
posts.view_count                 Arena 게시글 조회 수
posts.like_count                 Arena 게시글 좋아요 수
posts.comment_count              Arena 게시글 댓글 수

videos.youtube_view_count        YouTube 영상 조회 수
videos.youtube_like_count        YouTube 영상 좋아요 수
videos.youtube_comment_count     YouTube 영상 댓글 수
```

Phase 4에서는 YouTube API를 호출하지 않으므로 `videos.youtube_*_count` 값은 `null`로 둘 수 있다.

---

## 6. 구현 파일

주요 추가 파일:

- `backend/src/database/migrations/2026061301000-CreatePostsVideosTags.ts`
- `backend/src/posts/*`
- `backend/src/videos/*`
- `backend/src/tags/*`
- `backend/src/common/utils/youtube-url.util.ts`

연결 변경:

- `backend/src/app.module.ts`에 `VideosModule`, `TagsModule`, `PostsModule`을 연결했다.

테스트 추가:

- YouTube URL parser 단위 테스트
- 태그 정규화 단위 테스트
- 게시글 수정 시 `youtubeUrl` 변경 차단 테스트

---

## 7. 고려해야 할 부분

### 조회수

GET 상세 조회에서 바로 `viewCount`를 증가시키면 REST 관점에서 GET이 쓰기 효과를 갖는다. 그래서 Phase 4에서는 별도 API인 `POST /api/v1/posts/:postId/views`를 두었다.

MVP에서는 같은 사용자의 반복 조회, 새로고침, 봇 요청을 막지 않는다. 운영 고도화 단계에서 IP/User-Agent hash, 사용자 ID, 시간 창 기반 중복 방지 또는 `post_view_events` 테이블을 고려한다.

추후 확장 가능한 중복 조회수 정책:

- 로그인 사용자는 `userId + postId + 시간 창` 기준으로 중복 조회를 제한한다.
- 비로그인 사용자는 `ipHash + userAgentHash + postId + 시간 창` 기준으로 중복 조회를 제한한다.
- 조회 이벤트 원본이 필요해지면 `post_view_events` 테이블을 추가하고, `posts.view_count`는 이벤트 집계 결과를 반영하는 파생 값으로 유지한다.
- 봇이나 crawler 트래픽을 제외해야 하면 User-Agent denylist, rate limit, 비정상 요청 패턴 필터링을 별도 정책으로 둔다.
- 정책이 확정되기 전까지는 현재처럼 단순 증가 방식으로 유지하고, 실제 서비스 사용량과 abuse 가능성을 보고 고도화한다.

### 좋아요

좋아요는 카운터 컬럼만 있으면 중복 좋아요를 막을 수 없다. 그래서 `post_likes` 원본 테이블을 두었다.

정책:

- 좋아요 성공: `post_likes` insert + `posts.like_count += 1`
- 이미 좋아요한 게시글에 다시 좋아요: `409 Conflict`
- 좋아요 취소 성공: `post_likes` delete + `posts.like_count -= 1`
- 좋아요하지 않은 게시글 좋아요 취소: `204 No Content`

### 댓글 수

Phase 4에는 댓글 테이블이 없으므로 `commentCount`는 기본값 0으로 시작한다.

Phase 5에서 댓글과 대댓글이 생성될 때 증가하고, 댓글이 soft delete될 때 감소한다. 회원 탈퇴는 댓글을 삭제하지 않으므로 댓글 수를 바꾸지 않는다.

### 정합성

카운터는 denormalized 값이라 버그나 장애로 원본과 어긋날 수 있다. MVP에서는 transaction으로 최대한 막고, 추후 관리자용 재계산 작업을 둘 수 있다.

---

## 8. 검증 결과

아래 명령이 통과했다.

```bash
pnpm.cmd format:check
pnpm.cmd lint
pnpm.cmd --filter @arena/backend typecheck
pnpm.cmd --filter @arena/backend build
pnpm.cmd --filter @arena/backend test
pnpm.cmd --filter @arena/backend migration:run
```

`migration:run`으로 `videos`, `posts`, `tags`, `post_tags`, `post_likes` 테이블이 실제 DB에 생성되는 것을 확인했다.

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

- `GET /health` → `200`
- `GET /health/db` → `200`
- `POST /auth/signup` → `201`
- `POST /auth/login` → `200`, Access Token 반환 및 CSRF cookie 발급 확인
- 인증 없이 `POST /posts` → `401`
- Access Token은 있지만 CSRF header 없이 `POST /posts` → `403`
- Access Token과 CSRF header 포함 `POST /posts` → `201`
- 게시글 생성 응답에서 `commentCount=0`, `viewCount=0`, `likeCount=0` 확인
- 게시글 생성 응답에서 영상 상태값 `metadataStatus=PENDING`, `transcriptStatus=PENDING`, `embeddingStatus=PENDING` 확인
- `GET /posts?q=Smoke&tag=arena` → `200`
- `GET /posts/:postId` → `200`
- `GET /tags` → `200`
- `GET /videos/:videoId` → `200`
- `POST /posts/:postId/views` 2회 호출 → `viewCount`가 1, 2로 증가
- `POST /posts/:postId/like` → `200`, `likeCount=1`
- 같은 사용자로 중복 `POST /posts/:postId/like` → `409`
- `DELETE /posts/:postId/like` → `204`
- 좋아요하지 않은 상태에서 다시 `DELETE /posts/:postId/like` → `204`
- `PATCH /posts/:postId`에서 `youtubeUrl` 변경 시도 → `400`
- `PATCH /posts/:postId`에서 `title/content/tags` 수정 → `200`
- `DELETE /posts/:postId` → `204`
- 삭제 후 `GET /posts/:postId` → `404`
- 삭제 후 `POST /posts/:postId/views` → `404`
- 삭제 후 `POST /posts/:postId/like` → `404`

Smoke test 중 발견한 이슈:

- `GET /posts?q=Smoke&tag=arena` 호출 시 TypeORM query builder에서 `500 Internal Server Error`가 발생했다.
- 원인은 join, pagination, order by를 함께 쓰는 목록 쿼리에서 `orderBy('post.created_at')`처럼 DB 컬럼명을 직접 사용한 것이다.
- TypeORM entity property 경로인 `orderBy('post.createdAt')`로 수정해 목록 검색/태그 필터 API가 `200`으로 동작하는 것을 재확인했다.

---

## 10. 다음 단계

다음은 Phase 5 `Comment / Reply 구현`이다.

Phase 5에서 이어받을 핵심:

- 댓글과 대댓글 작성 시 `posts.comment_count`를 증가시킨다.
- 댓글 soft delete 시 `posts.comment_count`를 감소시킨다.
- 삭제된 댓글의 대댓글 유지 정책을 구현한다.
- 댓글 작성 직후 AI 분석 상태 기반을 준비한다.
