from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, Index, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import (
    AiOutputStatus,
    AiOutputType,
    GroundingStatus,
    enum_column_type,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AiOutput(Base):
    __tablename__ = "ai_outputs"
    __table_args__ = (
        Index("ix_ai_outputs_target_status", "target_post_id", "status"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    output_type: Mapped[AiOutputType] = mapped_column(
        enum_column_type(AiOutputType, "ai_output_type"),
        index=True,
    )
    requester_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id"),
        index=True,
    )
    target_post_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("posts.id"),
        index=True,
    )
    query_text: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str | None] = mapped_column(Text)
    status: Mapped[AiOutputStatus] = mapped_column(
        enum_column_type(AiOutputStatus, "ai_output_status"),
        default=AiOutputStatus.REQUESTED,
        index=True,
    )
    grounding_status: Mapped[GroundingStatus] = mapped_column(
        enum_column_type(GroundingStatus, "grounding_status"),
        default=GroundingStatus.NO_EVIDENCE,
        index=True,
    )
    confidence_score: Mapped[float | None] = mapped_column(Float)
    model_name: Mapped[str | None] = mapped_column(String(100))
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    requester: Mapped["User"] = relationship("User", back_populates="ai_outputs")
    target_post: Mapped["Post"] = relationship("Post", back_populates="ai_outputs")
    sources: Mapped[list["AiOutputSource"]] = relationship(
        "AiOutputSource",
        back_populates="ai_output",
        cascade="all, delete-orphan",
        order_by="AiOutputSource.rank_order",
    )
