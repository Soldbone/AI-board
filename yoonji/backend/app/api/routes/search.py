from fastapi import APIRouter, Query

from app.api.deps import DbSession
from app.models.enums import BoardCode, PriceRange
from app.schemas.post_schema import PostListResponse
from app.schemas.search_schema import PostSearchSort
from app.services import search_service


router = APIRouter(prefix="/search", tags=["search"])


@router.get("/posts", response_model=PostListResponse)
def search_posts(
    db: DbSession,
    q: str | None = Query(default=None, max_length=100),
    board_code: BoardCode | None = Query(default=None),
    tag: str | None = Query(default=None, max_length=100),
    figure_name: str | None = Query(default=None, max_length=200),
    manufacturer: str | None = Query(default=None, max_length=200),
    price_range: PriceRange | None = Query(default=None),
    sort: PostSearchSort = Query(default="latest"),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=50),
) -> PostListResponse:
    return search_service.search_posts(
        db,
        q=q,
        board_code=board_code,
        tag=tag,
        figure_name=figure_name,
        manufacturer=manufacturer,
        price_range=price_range,
        sort=sort,
        page=page,
        size=size,
    )
