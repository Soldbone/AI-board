from sqlalchemy.orm import Session

from app.models.enums import BoardCode, PriceRange
from app.repositories import post_repository
from app.repositories.post_repository import PostSort
from app.schemas.post_schema import PostListResponse
from app.services import post_service
from app.utils.normalizer import normalize_tag_name


def search_posts(
    db: Session,
    *,
    q: str | None,
    board_code: BoardCode | None,
    tag: str | None,
    figure_name: str | None,
    manufacturer: str | None,
    price_range: PriceRange | None,
    sort: PostSort,
    page: int,
    size: int,
) -> PostListResponse:
    cleaned_q = _clean_optional_text(q)
    cleaned_figure_name = _clean_optional_text(figure_name)
    cleaned_manufacturer = _clean_optional_text(manufacturer)
    normalized_q = normalize_tag_name(cleaned_q) if cleaned_q else None
    normalized_tag = _normalize_optional_tag(tag)

    total = post_repository.count_search_posts(
        db,
        q=cleaned_q,
        normalized_q=normalized_q,
        board_code=board_code,
        normalized_tag=normalized_tag,
        figure_name=cleaned_figure_name,
        manufacturer=cleaned_manufacturer,
        price_range=price_range,
    )
    posts = post_repository.list_search_posts(
        db,
        q=cleaned_q,
        normalized_q=normalized_q,
        board_code=board_code,
        normalized_tag=normalized_tag,
        figure_name=cleaned_figure_name,
        manufacturer=cleaned_manufacturer,
        price_range=price_range,
        sort=sort,
        page=page,
        size=size,
    )

    return post_service.build_post_list_response(
        posts=posts,
        page=page,
        size=size,
        total=total,
    )


def _clean_optional_text(value: str | None) -> str | None:
    if value is None:
        return None

    stripped = value.strip()
    return stripped or None


def _normalize_optional_tag(value: str | None) -> str | None:
    cleaned = _clean_optional_text(value)

    if cleaned is None:
        return None

    normalized = normalize_tag_name(cleaned)
    return normalized or None
