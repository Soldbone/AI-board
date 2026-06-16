from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import (
    BoardCode,
    ContentChunkStatus,
    ContentSourceType,
    enum_column_type,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ContentChunk(Base):
    __tablename__ = "content_chunks"
    __table_args__ = (
        Index("ix_content_chunks_source_lookup", "source_type", "post_id", "comment_id"),
        Index("ix_content_chunks_board_status", "board_code", "index_status"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    source_type: Mapped[ContentSourceType] = mapped_column(
        enum_column_type(ContentSourceType, "content_source_type"),
        index=True,
    )
    post_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("posts.id"),
        index=True,
    )
    comment_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("comments.id"),
        index=True,
    )
    board_code: Mapped[BoardCode | None] = mapped_column(
        enum_column_type(BoardCode, "content_chunk_board_code"),
        index=True,
    )
    chunk_index: Mapped[int] = mapped_column(Integer, default=0)
    chunk_text: Mapped[str] = mapped_column(Text)
    embedding_model: Mapped[str | None] = mapped_column(String(100))
    embedding_vector: Mapped[list[float] | None] = mapped_column(JSON)
    token_count: Mapped[int | None] = mapped_column(Integer)
    index_status: Mapped[ContentChunkStatus] = mapped_column(
        enum_column_type(ContentChunkStatus, "content_chunk_status"),
        default=ContentChunkStatus.PENDING,
        index=True,
    )
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )

    post: Mapped["Post | None"] = relationship("Post", back_populates="content_chunks")
    comment: Mapped["Comment | None"] = relationship(
        "Comment",
        back_populates="content_chunks",
    )
    ai_output_sources: Mapped[list["AiOutputSource"]] = relationship(
        "AiOutputSource",
        back_populates="content_chunk",
    )
