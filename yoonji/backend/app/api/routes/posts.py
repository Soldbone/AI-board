from typing import Annotated, Literal

from fastapi import APIRouter, Path, Query, status

from app.api.deps import CurrentUser, DbSession
from app.models.enums import BoardCode
from app.schemas.post_schema import (
    PostCreateRequest,
    PostCreateResponse,
    PostDetailResponse,
    PostListResponse,
    PostUpdateRequest,
)
from app.services import post_service


router = APIRouter(prefix="/posts", tags=["posts"])


@router.get("", response_model=PostListResponse)
def list_posts(
    db: DbSession,
    board_code: BoardCode | None = Query(default=None),
    sort: Literal["latest", "views"] = Query(default="latest"),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=50),
) -> PostListResponse:
    return post_service.list_posts(
        db,
        board_code=board_code,
        sort=sort,
        page=page,
        size=size,
    )


@router.post(
    "",
    response_model=PostCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_post(
    payload: PostCreateRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> PostCreateResponse:
    return post_service.create_post(
        db,
        payload=payload,
        current_user=current_user,
    )


@router.get("/{post_id}", response_model=PostDetailResponse)
def get_post(
    post_id: Annotated[int, Path(gt=0)],
    db: DbSession,
) -> PostDetailResponse:
    return post_service.get_post(db, post_id=post_id)


@router.patch("/{post_id}", response_model=PostDetailResponse)
def update_post(
    post_id: Annotated[int, Path(gt=0)],
    payload: PostUpdateRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> PostDetailResponse:
    return post_service.update_post(
        db,
        post_id=post_id,
        payload=payload,
        current_user=current_user,
    )


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(
    post_id: Annotated[int, Path(gt=0)],
    db: DbSession,
    current_user: CurrentUser,
) -> None:
    post_service.delete_post(
        db,
        post_id=post_id,
        current_user=current_user,
    )
