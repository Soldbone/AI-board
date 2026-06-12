from typing import Annotated

from fastapi import APIRouter, Path, Query, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.comment_schema import (
    CommentCreateRequest,
    CommentListResponse,
    CommentResponse,
    CommentUpdateRequest,
)
from app.services import comment_service


router = APIRouter(tags=["comments"])


@router.get("/posts/{post_id}/comments", response_model=CommentListResponse)
def list_comments(
    post_id: Annotated[int, Path(gt=0)],
    db: DbSession,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=50, ge=1, le=100),
) -> CommentListResponse:
    return comment_service.list_comments(
        db,
        post_id=post_id,
        page=page,
        size=size,
    )


@router.post(
    "/posts/{post_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_comment(
    post_id: Annotated[int, Path(gt=0)],
    payload: CommentCreateRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> CommentResponse:
    return comment_service.create_comment(
        db,
        post_id=post_id,
        payload=payload,
        current_user=current_user,
    )


@router.patch("/comments/{comment_id}", response_model=CommentResponse)
def update_comment(
    comment_id: Annotated[int, Path(gt=0)],
    payload: CommentUpdateRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> CommentResponse:
    return comment_service.update_comment(
        db,
        comment_id=comment_id,
        payload=payload,
        current_user=current_user,
    )


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: Annotated[int, Path(gt=0)],
    db: DbSession,
    current_user: CurrentUser,
) -> None:
    comment_service.delete_comment(
        db,
        comment_id=comment_id,
        current_user=current_user,
    )
