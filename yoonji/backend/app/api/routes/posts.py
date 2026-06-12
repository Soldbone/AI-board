from typing import Annotated, Literal

from fastapi import APIRouter, Path, Query

from app.api.deps import DbSession
from app.models.enums import BoardCode
from app.schemas.post_schema import PostDetailResponse, PostListResponse
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


@router.get("/{post_id}", response_model=PostDetailResponse)
def get_post(
    post_id: Annotated[int, Path(gt=0)],
    db: DbSession,
) -> PostDetailResponse:
    return post_service.get_post(db, post_id=post_id)
