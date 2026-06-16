from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.models.enums import CommentStatus


PostSearchSort = Literal[
    "latest",
    "relevance",
    "views",
    "satisfaction",
    "comments",
]


class MyCommentResponse(BaseModel):
    id: int
    post_id: int
    post_title: str
    content: str
    status: CommentStatus
    created_at: datetime
    updated_at: datetime


class MyCommentListResponse(BaseModel):
    items: list[MyCommentResponse]
    page: int
    size: int
    total: int
    has_next: bool
