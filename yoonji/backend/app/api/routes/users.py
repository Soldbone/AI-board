from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.schemas.post_schema import PostListResponse
from app.schemas.search_schema import MyCommentListResponse
from app.schemas.user_schema import UserResponse
from app.services import user_service


router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
def get_me(current_user: CurrentUser, db: DbSession) -> UserResponse:
    return user_service.get_me(db, user_id=current_user.id)


@router.get("/me/posts", response_model=PostListResponse)
def list_my_posts(
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=50),
) -> PostListResponse:
    return user_service.list_my_posts(
        db,
        current_user=current_user,
        page=page,
        size=size,
    )


@router.get("/me/comments", response_model=MyCommentListResponse)
def list_my_comments(
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=50),
) -> MyCommentListResponse:
    return user_service.list_my_comments(
        db,
        current_user=current_user,
        page=page,
        size=size,
    )
