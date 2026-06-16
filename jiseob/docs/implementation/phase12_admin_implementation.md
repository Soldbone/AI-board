# Phase 12. 관리자 기능 구현 결과

> 구현 기준: `phase12_admin_harness.md`  
> 구현 범위: 백엔드 관리자 API, role guard 적용, unit/controller tests  
> 제외 범위: Admin UI, admin 생성 API, DB migration

---

## 1. 구현 요약

Phase 12에서는 관리자 전용 댓글 관리 API를 `AdminModule`로 추가했다.

핵심 구현 파일:

```text
backend/src/admin/
  admin.module.ts
  admin-comments.controller.ts
  admin-comments.service.ts
  dto/find-admin-comments-query.dto.ts
  admin-comments.service.spec.ts
  admin-comments.controller.spec.ts
```

`AdminModule`은 `CommonModule`, `AiModule`, `TypeOrmModule.forFeature([Comment, Post, CommentAnalysis])`에 의존한다. `AdminCommentsService`는 삭제와 분석 재시도 transaction을 위해 `DataSource`를 명시적으로 주입받는다.

---

## 2. API

### 주의 필요 댓글 목록

```http
GET /api/v1/admin/comments?moderationStatus=NEEDS_REVIEW&page=1&limit=20
```

- `JwtAuthGuard + RolesGuard`를 요구한다.
- `@Roles(UserRole.ADMIN)`만 접근할 수 있다.
- GET이므로 CSRF guard는 적용하지 않는다.
- `moderationStatus`는 Phase 12 MVP에서 `NEEDS_REVIEW`만 허용한다.
- 목록은 active 게시글의 active 댓글만 반환한다.
- 정렬은 `createdAt ASC, id ASC`이다.
- pagination은 기존 posts 목록 패턴에 맞춰 도입했다.

응답 shape는 하네스 예시의 `{ items, total }` 대신 pagination 도입에 따라 `{ items, meta }`로 확정했다.

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
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

작성자 relation이 없거나 soft-deleted user이면 `comment.authorId`를 유지하고 nickname은 `탈퇴한 회원`으로 반환한다.

### 관리자 댓글 삭제

```http
DELETE /api/v1/admin/comments/:commentId
```

- `JwtAuthGuard + CsrfGuard + RolesGuard`를 요구한다.
- 관리자 권한이면 author 여부와 관계없이 삭제할 수 있다.
- 댓글이 없거나 연결 게시글이 삭제되었으면 `404 Not Found`를 반환한다.
- 이미 삭제된 댓글이면 no-op으로 `204 No Content`를 반환한다.
- active 댓글이면 같은 transaction 안에서 `moderationStatus=DELETED_BY_ADMIN`, comment soft delete, `posts.comment_count = GREATEST(comment_count - 1, 0)`를 수행한다.
- 대댓글, RAG evidence, analysis row, summary row는 물리 삭제하지 않는다.

### AI 댓글 분석 재시도

```http
POST /api/v1/admin/comments/:commentId/analysis/retry
```

- `JwtAuthGuard + CsrfGuard + RolesGuard`를 요구한다.
- active 댓글, active 게시글, existing `CommentAnalysis`, `aiAnalysisStatus=FAILED` 조건에서만 허용한다.
- 댓글/게시글/analysis row가 없으면 `404 Not Found`를 반환한다.
- analysis 상태가 `FAILED`가 아니면 `409 Conflict`를 반환한다.
- transaction 안에서 `CommentAnalysisService.preparePendingAnalysis(commentId, manager)`로 상태를 초기화하고 기존 RAG evidence를 삭제한다.
- transaction 이후 `CommentAnalysisService.analyzeComment(commentId)`를 비동기로 enqueue한다.
- provider 완료를 기다리지 않고 `202 Accepted`를 반환한다.

응답:

```json
{
  "commentId": "01J00000000000000000000000",
  "accepted": true,
  "aiAnalysisStatus": "PENDING"
}
```

---

## 3. Admin 계정 정책

Phase 12에서는 admin 생성 API를 만들지 않는다. 로컬/데모 환경에서는 DB에서 특정 사용자의 role을 수동으로 변경한다.

```sql
UPDATE users
SET role = 'ADMIN'
WHERE email = 'admin@example.com'
  AND deleted_at IS NULL;
```

일반 signup request body로 role을 받지 않고, public admin promotion API나 query string secret도 만들지 않는다.

---

## 4. 테스트와 검증

추가 테스트:

```text
backend/src/admin/admin-comments.service.spec.ts
backend/src/admin/admin-comments.controller.spec.ts
```

검증한 주요 정책:

- `NEEDS_REVIEW` active 댓글 목록 조회
- 삭제 댓글과 삭제 게시글 댓글 제외
- author relation이 없어도 `comment.authorId`와 `탈퇴한 회원` 반환
- 관리자 삭제의 `DELETED_BY_ADMIN` soft delete와 comment count 감소
- 이미 삭제된 댓글 삭제 no-op
- `FAILED` analysis만 retry 허용
- retry 시 pending 초기화와 비동기 분석 enqueue
- 비인증 `401`, 일반 사용자 `403`
- GET 목록은 CSRF 없이 접근 가능
- DELETE/retry POST는 CSRF 요구

최종 검증 명령:

```powershell
pnpm.cmd typecheck
pnpm.cmd --filter @arena/backend test --runInBand
pnpm.cmd lint
pnpm.cmd format:check
```

모두 통과했다.
