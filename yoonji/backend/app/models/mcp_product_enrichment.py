from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, Index, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import (
    ProductEnrichmentStatus,
    ProductMatchStatus,
    enum_column_type,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class McpProductEnrichment(Base):
    __tablename__ = "mcp_product_enrichments"
    __table_args__ = (
        Index("ix_mcp_product_enrichments_post_status", "post_id", "status"),
        Index("ix_mcp_product_enrichments_post_fetched", "post_id", "fetched_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    post_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("posts.id"),
        index=True,
    )
    status: Mapped[ProductEnrichmentStatus] = mapped_column(
        enum_column_type(ProductEnrichmentStatus, "product_enrichment_status"),
        default=ProductEnrichmentStatus.REQUESTED,
        index=True,
    )
    match_status: Mapped[ProductMatchStatus] = mapped_column(
        enum_column_type(ProductMatchStatus, "product_match_status"),
        default=ProductMatchStatus.NO_MATCH,
        index=True,
    )
    query_text: Mapped[str] = mapped_column(Text)
    confidence_score: Mapped[float | None] = mapped_column(Float)
    matched_product_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    candidates_json: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON)
    match_reasons_json: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON)
    source_url: Mapped[str | None] = mapped_column(String(1000))
    error_message: Mapped[str | None] = mapped_column(Text)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )

    post: Mapped["Post"] = relationship(
        "Post",
        back_populates="product_enrichments",
    )
