from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AiOutputSource(Base):
    __tablename__ = "ai_output_sources"
    __table_args__ = (
        Index("ix_ai_output_sources_output_rank", "ai_output_id", "rank_order"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    ai_output_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("ai_outputs.id"),
        index=True,
    )
    content_chunk_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("content_chunks.id"),
        index=True,
    )
    source_post_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("posts.id"),
        index=True,
    )
    source_comment_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("comments.id"),
        index=True,
    )
    relevance_score: Mapped[float | None] = mapped_column(Float)
    rank_order: Mapped[int] = mapped_column(Integer, default=0)
    excerpt: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    ai_output: Mapped["AiOutput"] = relationship("AiOutput", back_populates="sources")
    content_chunk: Mapped["ContentChunk | None"] = relationship(
        "ContentChunk",
        back_populates="ai_output_sources",
    )
    source_post: Mapped["Post | None"] = relationship("Post")
    source_comment: Mapped["Comment | None"] = relationship("Comment")
