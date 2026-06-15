# Phase 12. 관리자 기능 구현 하네스

> 기준 단계: `arena_implementation_plan.md`의 Phase 12  
> 선행 단계: Phase 11 댓글 스레드 요약 구현 완료  
> 목표: 관리자만 주의 필요 댓글을 조회/삭제하고, 실패한 AI 댓글 분석을 재시도할 수 있게 한다.

---

## 0. 현재 기준 상태

이 문서는 Phase 12 구현자가 `AGENTS.md`와 이 문서만 읽고 바로 작업을 시작할 수 있게 하기 위한 handoff 문서다.

현재 코드 기준:

- `UserRole.ADMIN`은 이미 있다.
- `@Roles()` decorator와 `RolesGuard`는 이미 있다.
- `CommonModule`은 `RolesGuard`를 export한다.
- `Comment.moderationStatus`에는 `NORMAL`, `NEEDS_REVIEW`, `DELETED_BY_USER`, `DELETED_BY_ADMIN`이 있다.
- 사용자 댓글 삭제는 soft delete이며 `posts.comment_count`를 transaction 안에서 감소시킨다.
- 삭제된 댓글은 댓글 목록에서 placeholder로 표시된다.
- `CommentAnalysisService.preparePendingAnalysis()`는 분석/RAG 상태 초기화와 기존 RAG evidence 삭제를 처리한다.
- `CommentAnalysisService.analyzeComment()`는 active 댓글을 분석하고 FACT_CLAIM이면 RAG를 enqueue한다.
- `AdminModule`과 `backend/src/admin/` 디렉터리는 아직 없다.

먼저 볼 코드:

```text
backend/src/app.module.ts
backend/src/common/decorators/roles.decorator.ts
backend/src/common/guards/roles.guard.ts
backend/src/common/guards/jwt-auth.guard.ts
backend/src/common/guards/csrf.guard.ts
backend/src/common/enums/user-role.enum.ts
backend/src/common/enums/comment-status.enum.ts
backend/src/common/enums/ai-status.enum.ts
backend/src/comments/comments.service.ts
backend/src/comments/entities/comment.entity.ts
backend/src/ai/comment-analysis/comment-analysis.service.ts
backend/src/ai/comment-analysis/entities/comment-analysis.entity.ts
backend/src/posts/entities/post.entity.ts
```

새로 만들 구조:

```text
backend/src/admin/
  admin.module.ts
  admin-comments.controller.ts
  admin-comments.service.ts
  admin-comments.service.spec.ts
  admin-comments.controller.spec.ts
```

DB migration은 필요하지 않다.

---

## 1. 구현할 API

### 주의 필요 댓글 목록

```http
GET /api/v1/admin/comments?moderationStatus=NEEDS_REVIEW
```

권한:

- `JwtAuthGuard + RolesGuard`
- `@Roles(UserRole.ADMIN)`
- CSRF는 적용하지 않는다. GET은 state-changing 요청이 아니다.

Query:

- `moderationStatus`는 MVP에서 선택값이다.
- 기본값은 `NEEDS_REVIEW`.
- 허용값은 우선 `NEEDS_REVIEW`만 둔다.
- 나중에 전체 관리자 댓글 목록이 필요하면 별도 Phase에서 확장한다.

응답:

```json
{
  "items": [
    {
      "id": "01J00000000000000000000000",
      "postId": "01J00000000000000000000001",
      "parentCommentId": null,
      "content": "댓글 내용",
      "moderationStatus": "NEEDS_REVIEW",
      "author": {
        "id": "01J00000000000000000000002",
        "nickname": "작성자"
      },
      "analysis": {
        "commentType": "TOXIC",
        "aiAnalysisStatus": "SUCCESS",
        "ragStatus": "NOT_REQUIRED",
        "evidenceCount": 0,
        "errorCode": null,
        "errorMessage": null,
        "analyzedAt": "2026-06-15T00:00:00.000Z"
      },
      "createdAt": "2026-06-15T00:00:00.000Z",
      "updatedAt": "2026-06-15T00:00:00.000Z"
    }
  ],
  "total": 1
}
```

정렬:

```text
created_at ASC, id ASC
```

MVP에서는 pagination을 필수로 넣지 않는다. 단, 구현이 간단하면 `limit`/`page`를 추가해도 된다. 추가한다면 기본 `limit=20`, 최대 `limit=50`으로 고정한다.

### 관리자 댓글 삭제

```http
DELETE /api/v1/admin/comments/:commentId
```

권한:

- `JwtAuthGuard + CsrfGuard + RolesGuard`
- `@Roles(UserRole.ADMIN)`

동작:

- 대상 댓글이 없으면 `404`.
- 대상 댓글의 게시글이 삭제되었으면 `404`.
- 대상 댓글이 이미 삭제되어 있으면 `204 No Content`로 no-op 처리한다.
- active 댓글이면 같은 transaction 안에서:
  - `comments.moderation_status = DELETED_BY_ADMIN`
  - comment soft delete
  - `posts.comment_count = GREATEST(comment_count - 1, 0)`
- author 여부는 확인하지 않는다. 관리자 권한이면 삭제 가능하다.

응답:

```http
204 No Content
```

주의:

- 실제 hard delete를 하지 않는다.
- 대댓글은 유지한다.
- 삭제된 댓글은 기존 댓글 목록 정책에 따라 `관리자에 의해 삭제된 댓글입니다`로 표시된다.
- RAG evidence, summary, analysis row를 물리 삭제하지 않는다. 삭제된 댓글/삭제된 게시글의 AI 결과는 조회 service에서 노출하지 않는 정책을 유지한다.

### AI 댓글 분석 재시도

```http
POST /api/v1/admin/comments/:commentId/analysis/retry
```

권한:

- `JwtAuthGuard + CsrfGuard + RolesGuard`
- `@Roles(UserRole.ADMIN)`

허용 조건:

- 대상 댓글이 존재하고 active여야 한다.
- 대상 댓글의 게시글이 active여야 한다.
- `CommentAnalysis` row가 존재해야 한다.
- `aiAnalysisStatus=FAILED`일 때만 허용한다.

실패 상태:

- 댓글 없음, 삭제된 댓글, 삭제된 게시글: `404 Not Found`
- analysis row 없음: `404 Not Found`
- `aiAnalysisStatus`가 `FAILED`가 아님: `409 Conflict`
- 일반 사용자 접근: `403 Forbidden`

동작:

```text
transaction:
  CommentAnalysisService.preparePendingAnalysis(commentId, manager)

after transaction:
  void CommentAnalysisService.analyzeComment(commentId)
```

응답:

```json
{
  "commentId": "01J00000000000000000000000",
  "accepted": true,
  "aiAnalysisStatus": "PENDING"
}
```

HTTP status:

```http
202 Accepted
```

주의:

- retry API가 provider 완료를 기다리면 안 된다.
- retry 전 기존 RAG evidence는 삭제되어야 한다. `preparePendingAnalysis()`가 이미 담당한다.
- provider raw error, stack trace, API key, token은 응답에 포함하지 않는다.

---

## 2. Service 설계

`AdminCommentsService` public method:

```ts
findReviewComments(query): Promise<AdminCommentListResponse>
deleteComment(commentId): Promise<void>
retryCommentAnalysis(commentId): Promise<AdminAnalysisRetryResponse>
```

권장 repository:

```text
Comment
Post
CommentAnalysis
```

`CommentsService` private method에 의존하지 않는다. Phase 12에서는 admin service가 repository/query builder로 직접 읽고, AI 분석 재시도만 `CommentAnalysisService` public method를 호출한다.

의존 방향:

```text
AdminModule -> CommonModule
AdminModule -> AiModule
AdminModule -> TypeOrmModule.forFeature([Comment, Post, CommentAnalysis])
```

금지:

```text
CommentsModule -> AdminModule
AiModule -> AdminModule
Admin service -> AgentService
Admin service -> McpServerService
```

---

## 3. Admin 계정 정책

Phase 12에서는 admin 생성 API를 만들지 않는다.

권장 기본값:

- 테스트에서는 `AuthenticatedUser.role = ADMIN` mock을 사용한다.
- 로컬/데모에서는 DB에서 특정 사용자 role을 수동으로 `ADMIN`으로 바꾼다.
- 별도 seed script가 필요하면 Phase 14 문서 정리 때 추가한다.

로컬 수동 예시:

```sql
UPDATE users
SET role = 'ADMIN'
WHERE email = 'admin@example.com'
  AND deleted_at IS NULL;
```

금지:

- 일반 signup request body로 role을 받지 않는다.
- public admin promotion API를 만들지 않는다.
- admin secret을 query string으로 받지 않는다.

---

## 4. 테스트 계획

Service tests:

- `NEEDS_REVIEW` active 댓글 목록을 조회한다.
- 삭제된 댓글과 삭제된 게시글의 댓글은 목록에서 제외한다.
- 탈퇴한 작성자는 `탈퇴한 회원`으로 표시한다.
- admin delete는 active 댓글을 `DELETED_BY_ADMIN`으로 soft delete하고 `commentCount`를 1 감소시킨다.
- 이미 삭제된 댓글에 대한 admin delete는 no-op이며 `commentCount`를 감소시키지 않는다.
- retry는 `FAILED` analysis에서만 `PENDING`으로 초기화하고 `analyzeComment()`를 enqueue한다.
- retry 대상이 `FAILED`가 아니면 `409 Conflict`.
- retry 대상 댓글/게시글이 삭제되었으면 `404`.

Controller tests:

- 일반 사용자는 admin API에서 `403`.
- 인증 없는 사용자는 `401`.
- `GET /admin/comments`는 CSRF 없이 ADMIN이면 접근 가능.
- `DELETE /admin/comments/:commentId`는 CSRF 필요.
- `POST /admin/comments/:commentId/analysis/retry`는 CSRF 필요.
- retry 성공은 `202 Accepted`.
- delete 성공은 `204 No Content`.

기존 검증:

```powershell
pnpm.cmd typecheck
pnpm.cmd --filter @arena/backend test --runInBand
pnpm.cmd lint
pnpm.cmd format:check
```

---

## 5. 수용 기준

Phase 12 완료 기준:

- `backend/src/admin/` 구조가 생긴다.
- `AdminModule`이 `AppModule`에 등록된다.
- 관리자 댓글 목록/삭제/분석 재시도 API가 구현된다.
- 모든 admin API는 role 기반으로 보호된다.
- 관리자 삭제와 사용자 삭제 placeholder가 구분된다.
- AI 분석 재시도는 `FAILED` 상태에서만 가능하다.
- retry는 댓글 작성 flow처럼 provider 완료를 기다리지 않는다.
- 자동 테스트가 실제 OpenAI API key나 네트워크를 사용하지 않는다.
- 최종 검증 명령 4개가 모두 통과한다.
