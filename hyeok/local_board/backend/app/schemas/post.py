from datetime import datetime

from pydantic import BaseModel, field_validator

class PostCreate(BaseModel):
    title: str
    content: str
    region: str
    store_name: str | None = None
    category: str | None = None
    tag_names: list[str] = []

    @field_validator("region")
    @classmethod
    def validate_region(cls, value: str) -> str:
        cleaned_region = value.strip()

        if not cleaned_region:
            raise ValueError("지역은 필수입니다.")

        return cleaned_region

class PostUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    region: str | None = None
    store_name: str | None = None
    category: str | None = None
    tag_names: list[str] | None = None

    @field_validator("region")
    @classmethod
    def validate_region(cls, value: str | None) -> str | None:
        if value is None:
            return value

        cleaned_region = value.strip()

        if not cleaned_region:
            raise ValueError("지역은 비워둘 수 없습니다.")

        return cleaned_region


class PostRead(BaseModel):
    id: int
    author_id: int
    title: str
    content: str
    region: str | None
    store_name: str | None
    category: str | None
    view_count: int
    comment_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True
    }


class PostListItem(BaseModel):
    id: int
    author_id: int
    title: str
    region: str | None
    store_name: str | None
    category: str | None
    view_count: int
    comment_count: int = 0
    created_at: datetime

    model_config = {
        "from_attributes": True
    }


class PostListResponse(BaseModel):
    items: list[PostListItem]
    total_count: int
    page: int
    size: int
    total_pages: int
