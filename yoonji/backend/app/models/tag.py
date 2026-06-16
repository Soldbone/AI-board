from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import BigInteger, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import TagStatus, TagType, enum_column_type


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (
        UniqueConstraint("normalized_name", "tag_type", name="uq_tags_normalized_type"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), index=True)
    normalized_name: Mapped[str] = mapped_column(String(100), index=True)
    tag_type: Mapped[TagType] = mapped_column(
        enum_column_type(TagType, "tag_type"),
        default=TagType.CHARACTER,
    )
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[TagStatus] = mapped_column(
        enum_column_type(TagStatus, "tag_status"),
        default=TagStatus.ACTIVE,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    post_links: Mapped[list["PostTag"]] = relationship(
        "PostTag",
        back_populates="tag",
        cascade="all, delete-orphan",
    )
