from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.models.enums import UserStatus
from app.models.user import User
from app.repositories import comment_repository, post_repository
from app.repositories import user_repository
from app.schemas.search_schema import MyCommentListResponse, MyCommentResponse
from app.schemas.user_schema import UserResponse
from app.schemas.post_schema import PostListResponse
from app.services import post_service


def get_me(db: Session, *, user_id: int) -> UserResponse:
    user = user_repository.get_user_by_id(db, user_id)

    if user is None:
        raise AppException(
            "사용자를 찾을 수 없습니다.",
            code="USER_NOT_FOUND",
            status_code=404,
        )

    _ensure_active_user(user)
    return UserResponse.model_validate(user)


def list_my_posts(
    db: Session,
    *,
    current_user: User,
    page: int,
    size: int,
) -> PostListResponse:
    total = post_repository.count_public_posts_by_author(
        db,
        author_id=current_user.id,
    )
    posts = post_repository.list_public_posts_by_author(
        db,
        author_id=current_user.id,
        page=page,
        size=size,
    )
    return post_service.build_post_list_response(
        posts=posts,
        page=page,
        size=size,
        total=total,
    )


def list_my_comments(
    db: Session,
    *,
    current_user: User,
    page: int,
    size: int,
) -> MyCommentListResponse:
    total = comment_repository.count_my_comments(
        db,
        author_id=current_user.id,
    )
    comments = comment_repository.list_my_comments(
        db,
        author_id=current_user.id,
        page=page,
        size=size,
    )
    return MyCommentListResponse(
        items=[
            MyCommentResponse(
                id=comment.id,
                post_id=comment.post_id,
                post_title=comment.post.title,
                content=comment.content,
                status=comment.status,
                created_at=comment.created_at,
                updated_at=comment.updated_at,
            )
            for comment in comments
        ],
        page=page,
        size=size,
        total=total,
        has_next=page * size < total,
    )


def _ensure_active_user(user: User) -> None:
    if user.status != UserStatus.ACTIVE:
        raise AppException(
            "활성 상태가 아닌 계정입니다.",
            code="USER_NOT_ACTIVE",
            status_code=403,
        )
