from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import PostSourceType, PostStatus, enum_column_type


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    board_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("boards.id"), index=True)
    author_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200), index=True)
    content: Mapped[str] = mapped_column(Text)
    source_type: Mapped[PostSourceType] = mapped_column(
        enum_column_type(PostSourceType, "post_source_type"),
        default=PostSourceType.USER,
    )
    status: Mapped[PostStatus] = mapped_column(
        enum_column_type(PostStatus, "post_status"),
        default=PostStatus.PUBLISHED,
        index=True,
    )
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    comment_count: Mapped[int] = mapped_column(Integer, default=0)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
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

    board: Mapped["Board"] = relationship("Board", back_populates="posts")
    author: Mapped["User"] = relationship("User", back_populates="posts")
    figure_infos: Mapped[list["PostFigureInfo"]] = relationship(
        "PostFigureInfo",
        back_populates="post",
        cascade="all, delete-orphan",
    )
    comments: Mapped[list["Comment"]] = relationship("Comment", back_populates="post")
    tag_links: Mapped[list["PostTag"]] = relationship(
        "PostTag",
        back_populates="post",
        cascade="all, delete-orphan",
    )
    images: Mapped[list["PostImage"]] = relationship("PostImage", back_populates="post")
    content_chunks: Mapped[list["ContentChunk"]] = relationship(
        "ContentChunk",
        back_populates="post",
        cascade="all, delete-orphan",
    )
    ai_outputs: Mapped[list["AiOutput"]] = relationship(
        "AiOutput",
        back_populates="target_post",
    )
