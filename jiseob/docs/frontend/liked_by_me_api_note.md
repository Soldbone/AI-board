# likedByMe API Note

> 기준: Frontend Harness 6 write flow 구현
> 목적: 게시글 좋아요 토글 UI가 안정적으로 동작하려면 backend가 제공해야 하는 사용자별 상태를 정리한다.

## 현재 응답 한계

현재 게시글 목록과 상세 응답은 `likeCount`만 제공한다.

```json
{
  "id": "01J00000000000000000000010",
  "likeCount": 3
}
```

이 값은 전체 좋아요 수이며, 현재 로그인 사용자가 해당 게시글을 이미 좋아요했는지는 알려주지 않는다. 따라서 frontend는 초기 렌더링 시 좋아요 버튼을 `좋아요`로 보여야 하는지 `좋아요 취소`로 보여야 하는지 확정할 수 없다.

## 권장 backend 확장

인증된 요청의 게시글 목록/상세 응답에 사용자별 좋아요 상태를 추가한다.

```json
{
  "id": "01J00000000000000000000010",
  "likeCount": 3,
  "likedByMe": true
}
```

권장 정책:

- 비회원 요청에서는 `likedByMe: null` 또는 필드 생략 중 하나로 통일한다.
- 로그인 요청에서는 `likedByMe: boolean`을 반환한다.
- `likeCount`는 기존처럼 전체 카운터로 유지한다.
- `likedByMe`의 원본은 `post_likes(post_id, user_id)` 존재 여부다.

## Harness 6 frontend fallback

Harness 6에서는 backend 응답 shape를 바꾸지 않는다.

- 처음 상세 화면을 열 때는 현재 사용자의 좋아요 여부를 모른다.
- `POST /posts/:postId/like` 성공 후에는 현재 세션에서만 `좋아요 취소` action을 보여준다.
- 중복 좋아요 `409 Conflict`를 받으면 이미 좋아요한 상태로 보고 현재 세션에서 `좋아요 취소` action을 보여준다.
- 새로고침하거나 다른 탭에서 열면 초기 상태는 다시 알 수 없다.

이 fallback은 write API 연결을 검증하기 위한 MVP UI이며, 완전한 토글 UX는 backend의 `likedByMe` 지원 이후 구현한다.
