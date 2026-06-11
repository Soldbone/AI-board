from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import ImageStatus, enum_column_type


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PostImage(Base):
    __tablename__ = "post_images"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    post_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("posts.id"),
        index=True,
    )
    uploader_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id"),
        index=True,
    )
    file_url: Mapped[str] = mapped_column(String(500))
    thumbnail_url: Mapped[str | None] = mapped_column(String(500))
    original_name: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[ImageStatus] = mapped_column(
        enum_column_type(ImageStatus, "image_status"),
        default=ImageStatus.TEMP,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    post: Mapped["Post | None"] = relationship("Post", back_populates="images")
    uploader: Mapped["User"] = relationship("User", back_populates="images")
