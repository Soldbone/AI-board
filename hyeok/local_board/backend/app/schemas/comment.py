from datetime import datetime

from pydantic import BaseModel


class CommentCreate(BaseModel):
    content: str
    is_anonymous: bool = False
    parent_id: int | None = None


class CommentUpdate(BaseModel):
    content: str


class CommentRead(BaseModel):
    id: int
    post_id: int
    author_id: int | None
    author_nickname: str
    parent_id: int | None
    content: str
    is_anonymous: bool
    created_at: datetime
    updated_at: datetime