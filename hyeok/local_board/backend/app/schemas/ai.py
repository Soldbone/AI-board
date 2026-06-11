from datetime import datetime

from pydantic import BaseModel


class SimilarPostRequest(BaseModel):
    title: str = ""
    content: str = ""
    tag_names: list[str] = []


class SimilarPostItem(BaseModel):
    id: int
    title: str
    content_preview: str
    region: str | None
    store_name: str | None
    category: str | None
    score: int
    matched_keywords: list[str]
    created_at: datetime


class SimilarPostResponse(BaseModel):
    items: list[SimilarPostItem]