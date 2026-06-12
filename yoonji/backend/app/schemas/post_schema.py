from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.models.enums import (
    BoardCode,
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


class PostFigureInfoRequest(BaseModel):
    figure_name: str | None = Field(default=None, max_length=200)
    manufacturer: str | None = Field(default=None, max_length=200)
    figure_type: FigureType | None = None
    price_amount: Decimal | None = Field(default=None, ge=0)
    price_range: PriceRange | None = None
    purchase_date: date | None = None
    satisfaction_score: int | None = Field(default=None, ge=1, le=5)
    target_type: FigureTargetType = FigureTargetType.REVIEW_TARGET

    @field_validator("figure_name", "manufacturer")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None

        stripped = value.strip()
        return stripped or None


class PostCreateRequest(BaseModel):
    board_code: BoardCode
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1)
    status: PostStatus = PostStatus.PUBLISHED
    figure_info: PostFigureInfoRequest | None = None
    image_ids: list[int] = Field(default_factory=list, max_length=10)

    @field_validator("title", "content")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        stripped = value.strip()

        if not stripped:
            raise ValueError("must not be blank")

        return stripped

    @field_validator("image_ids")
    @classmethod
    def validate_image_ids(cls, value: list[int]) -> list[int]:
        return _validate_image_id_list(value)


class PostUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = Field(default=None, min_length=1)
    figure_info: PostFigureInfoRequest | None = None
    image_ids: list[int] | None = Field(default=None, max_length=10)

    @field_validator("title", "content")
    @classmethod
    def strip_optional_required_text(cls, value: str | None) -> str | None:
        if value is None:
            return None

        stripped = value.strip()

        if not stripped:
            raise ValueError("must not be blank")

        return stripped

    @field_validator("image_ids")
    @classmethod
    def validate_optional_image_ids(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return None

        return _validate_image_id_list(value)


class PostCreateResponse(BaseModel):
    id: int
    board_code: BoardCode
    title: str
    status: PostStatus
    created_at: datetime


def _validate_image_id_list(value: list[int]) -> list[int]:
    if any(image_id <= 0 for image_id in value):
        raise ValueError("image_ids must contain positive integers")

    if len(value) != len(set(value)):
        raise ValueError("image_ids must not contain duplicates")

    return value


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
