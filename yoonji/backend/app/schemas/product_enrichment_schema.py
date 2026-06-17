from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import ProductEnrichmentStatus, ProductMatchStatus


class ProductEnrichmentCreate(BaseModel):
    post_id: int = Field(gt=0)
    query_text: str = Field(min_length=1)
    status: ProductEnrichmentStatus = ProductEnrichmentStatus.REQUESTED
    match_status: ProductMatchStatus = ProductMatchStatus.NO_MATCH
    confidence_score: float | None = Field(default=None, ge=0, le=1)
    matched_product_json: dict[str, Any] | None = None
    candidates_json: list[dict[str, Any]] = Field(default_factory=list)
    match_reasons_json: list[dict[str, Any]] = Field(default_factory=list)
    source_url: str | None = Field(default=None, max_length=1000)
    error_message: str | None = None
    fetched_at: datetime | None = None

    @field_validator("query_text", "source_url", "error_message")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None

        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")

        return stripped


class ProductEnrichmentUpdate(BaseModel):
    status: ProductEnrichmentStatus | None = None
    match_status: ProductMatchStatus | None = None
    confidence_score: float | None = Field(default=None, ge=0, le=1)
    matched_product_json: dict[str, Any] | None = None
    candidates_json: list[dict[str, Any]] | None = None
    match_reasons_json: list[dict[str, Any]] | None = None
    source_url: str | None = Field(default=None, max_length=1000)
    error_message: str | None = None
    fetched_at: datetime | None = None

    @field_validator("source_url", "error_message")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None

        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")

        return stripped


class ProductEnrichmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    post_id: int
    status: ProductEnrichmentStatus
    match_status: ProductMatchStatus
    query_text: str
    confidence_score: float | None = None
    matched_product_json: dict[str, Any] | None = None
    candidates_json: list[dict[str, Any]] | None = None
    match_reasons_json: list[dict[str, Any]] | None = None
    source_url: str | None = None
    error_message: str | None = None
    fetched_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
