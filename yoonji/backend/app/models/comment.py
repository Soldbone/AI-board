from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import BigInteger, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import CommentStatus, enum_column_type


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    post_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("posts.id"), index=True)
    author_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), index=True)
    content: Mapped[str] = mapped_column(Text)
    status: Mapped[CommentStatus] = mapped_column(
        enum_column_type(CommentStatus, "comment_status"),
        default=CommentStatus.PUBLISHED,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    post: Mapped["Post"] = relationship("Post", back_populates="comments")
    author: Mapped["User"] = relationship("User", back_populates="comments")
    content_chunks: Mapped[list["ContentChunk"]] = relationship(
        "ContentChunk",
        back_populates="comment",
        cascade="all, delete-orphan",
    )
