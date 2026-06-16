from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.enums import CommentStatus
from app.schemas.user_schema import UserSummary


class CommentCreateRequest(BaseModel):
    content: str = Field(min_length=1)

    @field_validator("content")
    @classmethod
    def strip_required_content(cls, value: str) -> str:
        stripped = value.strip()

        if not stripped:
            raise ValueError("must not be blank")

        return stripped


class CommentUpdateRequest(BaseModel):
    content: str = Field(min_length=1)

    @field_validator("content")
    @classmethod
    def strip_required_content(cls, value: str) -> str:
        stripped = value.strip()

        if not stripped:
            raise ValueError("must not be blank")

        return stripped


class CommentResponse(BaseModel):
    id: int
    post_id: int
    author: UserSummary
    content: str
    status: CommentStatus
    created_at: datetime
    updated_at: datetime


class CommentListResponse(BaseModel):
    items: list[CommentResponse]
    page: int
    size: int
    total: int
    has_next: bool
