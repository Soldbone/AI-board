from datetime import datetime
from typing import Any
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import (
    AiOutputStatus,
    AiOutputType,
    BoardCode,
    ContentChunkStatus,
    ContentSourceType,
    GroundingStatus,
    PriceRange,
)


class ReferenceAnswerRequest(BaseModel):
    top_k: int = Field(default=5, ge=1, le=20)


class PurchaseSummaryRequest(BaseModel):
    top_k: int = Field(default=5, ge=1, le=20)
    include_similar_price_range: bool = True


class AgentAnswerRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    top_k: int = Field(default=5, ge=1, le=20)
    include_mcp: bool = True

    @field_validator("message")
    @classmethod
    def strip_message(cls, value: str) -> str:
        stripped = value.strip()

        if not stripped:
            raise ValueError("must not be blank")

        return stripped


class ContentChunkCreate(BaseModel):
    source_type: ContentSourceType
    chunk_text: str = Field(min_length=1)
    post_id: int | None = Field(default=None, gt=0)
    comment_id: int | None = Field(default=None, gt=0)
    board_code: BoardCode | None = None
    chunk_index: int = Field(default=0, ge=0)
    embedding_model: str | None = Field(default=None, max_length=100)
    embedding_vector: list[float] | None = None
    token_count: int | None = Field(default=None, ge=0)
    index_status: ContentChunkStatus = ContentChunkStatus.PENDING
    metadata_json: dict[str, Any] | None = None

    @field_validator("chunk_text")
    @classmethod
    def strip_chunk_text(cls, value: str) -> str:
        stripped = value.strip()

        if not stripped:
            raise ValueError("must not be blank")

        return stripped


class ContentChunkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_type: ContentSourceType
    post_id: int | None = None
    comment_id: int | None = None
    board_code: BoardCode | None = None
    chunk_index: int
    chunk_text: str
    embedding_model: str | None = None
    token_count: int | None = None
    index_status: ContentChunkStatus
    metadata_json: dict[str, Any] | None = None
    indexed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class AiOutputSourceCreate(BaseModel):
    content_chunk_id: int | None = Field(default=None, gt=0)
    source_post_id: int | None = Field(default=None, gt=0)
    source_comment_id: int | None = Field(default=None, gt=0)
    relevance_score: float | None = Field(default=None, ge=0)
    rank_order: int = Field(ge=1)
    excerpt: str = Field(min_length=1)

    @field_validator("excerpt")
    @classmethod
    def strip_excerpt(cls, value: str) -> str:
        stripped = value.strip()

        if not stripped:
            raise ValueError("must not be blank")

        return stripped


class AiOutputSourceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    content_chunk_id: int | None = None
    source_post_id: int | None = None
    source_comment_id: int | None = None
    relevance_score: float | None = None
    rank_order: int
    excerpt: str
    created_at: datetime


class AiOutputCreate(BaseModel):
    output_type: AiOutputType
    requester_id: int = Field(gt=0)
    target_post_id: int = Field(gt=0)
    query_text: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=200)
    content: str | None = None
    status: AiOutputStatus = AiOutputStatus.REQUESTED
    grounding_status: GroundingStatus = GroundingStatus.NO_EVIDENCE
    confidence_score: float | None = Field(default=None, ge=0, le=1)
    model_name: str | None = Field(default=None, max_length=100)
    metadata_json: dict[str, Any] | None = None

    @field_validator("query_text", "title", "content")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None

        stripped = value.strip()

        if not stripped:
            raise ValueError("must not be blank")

        return stripped


class AiOutputResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    output_type: AiOutputType
    target_post_id: int
    query_text: str
    title: str
    content: str | None = None
    status: AiOutputStatus
    grounding_status: GroundingStatus
    confidence_score: float | None = None
    model_name: str | None = None
    metadata_json: dict[str, Any] | None = None
    error_message: str | None = None
    sources: list[AiOutputSourceResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None


class SimilarPostSummary(BaseModel):
    id: int
    board_code: BoardCode
    title: str
    thumbnail_url: str | None = None
    satisfaction_score: int | None = None
    price_range: PriceRange | None = None


class SimilarPostItemResponse(BaseModel):
    post: SimilarPostSummary
    score: float = Field(ge=0)
    reason: str | None = None


class SimilarPostListResponse(BaseModel):
    items: list[SimilarPostItemResponse]


IndexingRequestStatus = Literal["REQUESTED", "INDEXED", "SKIPPED", "FAILED", "DELETED"]


class ContentIndexingResponse(BaseModel):
    source_type: ContentSourceType
    post_id: int | None = None
    comment_id: int | None = None
    status: IndexingRequestStatus
    chunk_count: int = 0
    stale_count: int = 0
    message: str | None = None


class ReindexContentResponse(BaseModel):
    post_count: int = 0
    comment_count: int = 0
    chunk_count: int = 0
    failed_items: list[str] = Field(default_factory=list)
