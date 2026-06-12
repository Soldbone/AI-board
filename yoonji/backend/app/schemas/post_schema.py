from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel

from app.models.enums import (
    FigureTargetType,
    FigureType,
    PostSourceType,
    PostStatus,
    PriceRange,
    TagType,
)
from app.schemas.board_schema import BoardSummary
from app.schemas.user_schema import UserSummary


class TagSummary(BaseModel):
    id: int
    name: str
    tag_type: TagType


class PostFigureInfoSummary(BaseModel):
    figure_name: str
    manufacturer: str | None = None
    price_range: PriceRange | None = None
    satisfaction_score: int | None = None


class PostFigureInfoResponse(PostFigureInfoSummary):
    id: int
    figure_type: FigureType | None = None
    price_amount: Decimal | None = None
    purchase_date: date | None = None
    target_type: FigureTargetType


class PostImageResponse(BaseModel):
    id: int
    file_url: str
    thumbnail_url: str | None = None
    width: int | None = None
    height: int | None = None
    sort_order: int


class PostListItemResponse(BaseModel):
    id: int
    board: BoardSummary
    author: UserSummary
    title: str
    summary: str
    thumbnail_url: str | None = None
    tags: list[TagSummary]
    figure_info: PostFigureInfoSummary | None = None
    view_count: int
    comment_count: int
    published_at: datetime | None = None


class PostListResponse(BaseModel):
    items: list[PostListItemResponse]
    page: int
    size: int
    total: int
    has_next: bool


class PostDetailResponse(BaseModel):
    id: int
    board: BoardSummary
    author: UserSummary
    title: str
    content: str
    source_type: PostSourceType
    status: PostStatus
    view_count: int
    comment_count: int
    figure_info: PostFigureInfoResponse | None = None
    tags: list[TagSummary]
    images: list[PostImageResponse]
    published_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
