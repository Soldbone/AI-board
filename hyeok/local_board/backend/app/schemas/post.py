from datetime import datetime

from pydantic import BaseModel

class PostCreate(BaseModel):
    title: str
    content: str
    region: str | None = None
    store_name: str | None = None
    category: str | None = None


class PostUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    region: str | None = None
    store_name: str | None = None
    category: str | None = None


class PostRead(BaseModel):
    id: int
    author_id: int
    title: str
    content: str
    region: str | None
    store_name: str | None
    category: str | None
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
    created_at: datetime

    model_config = {
        "from_attributes": True
    }


