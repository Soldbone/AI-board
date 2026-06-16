# likedByMe API Note

> 기준: Product polish phase
> 목적: 게시글 좋아요 토글 UI가 사용자별 상태를 안정적으로 표시하는 방식을 정리한다.

## Backend Contract

게시글 목록과 상세 응답은 전체 좋아요 수와 현재 로그인 사용자의 좋아요 여부를 함께 제공한다.

```json
{
  "id": "01J00000000000000000000010",
  "likeCount": 3,
  "likedByMe": true
}
```

정책:

- 비회원 요청에서는 `likedByMe: null`을 반환한다.
- 로그인 요청에서는 `likedByMe: boolean`을 반환한다.
- `likeCount`는 전체 카운터로 유지한다.
- `likedByMe`의 원본은 `post_likes(post_id, user_id)` 존재 여부다.

## Frontend Behavior

- 상세 화면의 좋아요 버튼은 `likedByMe`를 초기 상태로 사용한다.
- `POST /posts/:postId/like` 성공 후에는 `likedByMe=true`와 응답의 `likeCount`를 반영한다.
- `DELETE /posts/:postId/like` 성공 후에는 `likedByMe=false`로 바꾸고 게시글 상세를 재조회한다.
- 새로고침 후에는 refresh session 복구가 끝난 뒤 게시글을 다시 조회해 사용자별 상태를 맞춘다.
