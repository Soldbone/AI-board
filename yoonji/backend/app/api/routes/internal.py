from typing import Annotated

from fastapi import APIRouter, Path, Query, status

from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import AppException
from app.models.enums import UserRole
from app.schemas.ai_schema import ContentIndexingResponse, ReindexContentResponse
from app.ai.rag import indexing_service


router = APIRouter(prefix="/internal", tags=["internal"])


@router.post(
    "/indexing/posts/{post_id}",
    response_model=ContentIndexingResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def index_post(
    post_id: Annotated[int, Path(gt=0)],
    db: DbSession,
    current_user: CurrentUser,
) -> ContentIndexingResponse:
    _ensure_admin(current_user)
    return indexing_service.index_post(db, post_id=post_id)


@router.post(
    "/indexing/comments/{comment_id}",
    response_model=ContentIndexingResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def index_comment(
    comment_id: Annotated[int, Path(gt=0)],
    db: DbSession,
    current_user: CurrentUser,
) -> ContentIndexingResponse:
    _ensure_admin(current_user)
    return indexing_service.index_comment(db, comment_id=comment_id)


@router.post(
    "/indexing/reindex",
    response_model=ReindexContentResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def reindex_content(
    db: DbSession,
    current_user: CurrentUser,
    include_posts: bool = Query(default=True),
    include_comments: bool = Query(default=True),
    limit: int | None = Query(default=None, ge=1, le=1000),
) -> ReindexContentResponse:
    _ensure_admin(current_user)
    return indexing_service.reindex_all_content(
        db,
        include_posts=include_posts,
        include_comments=include_comments,
        limit=limit,
    )


def _ensure_admin(current_user) -> None:
    if current_user.role == UserRole.ADMIN:
        return

    raise AppException(
        "Admin permission is required for internal indexing APIs.",
        code="ADMIN_PERMISSION_REQUIRED",
        status_code=403,
    )
