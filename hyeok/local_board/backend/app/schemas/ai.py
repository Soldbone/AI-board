from datetime import datetime

from pydantic import BaseModel, Field


class SimilarPostRequest(BaseModel):
    title: str = ""
    content: str = ""
    tag_names: list[str] = Field(default_factory=list)
    limit: int = Field(default=5, ge=1, le=5)


class SimilarPostItem(BaseModel):
    id: int
    title: str
    content_preview: str
    region: str | None
    store_name: str | None
    category: str | None
    score: int
    matched_keywords: list[str]
    matched_fields: list[str]
    created_at: datetime


class SimilarPostResponse(BaseModel):
    items: list[SimilarPostItem]


class TagSuggestionRequest(BaseModel):
    title: str = ""
    content: str = ""
    limit: int = Field(default=5, ge=1, le=10)


class TagSuggestionItem(BaseModel):
    name: str
    score: int


class TagSuggestionResponse(BaseModel):
    items: list[TagSuggestionItem]


class PlaceSearchRequest(BaseModel):
    region: str
    keyword: str
    display: int = Field(default=5, ge=1, le=5)


class PlaceSearchItem(BaseModel):
    title: str = ""
    category: str = ""
    road_address: str = ""
    address: str = ""
    link: str = ""
    naver_map_url: str = ""


class PlaceSearchResponse(BaseModel):
    status: str
    query: str = ""
    display: int | None = None
    total: int | None = None
    places: list[PlaceSearchItem] = Field(default_factory=list)
    fallback_map_url: str = ""
    code: str | None = None
    message: str | None = None
