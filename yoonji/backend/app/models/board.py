from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import BoardCode, enum_column_type


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Board(Base):
    __tablename__ = "boards"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    code: Mapped[BoardCode] = mapped_column(
        enum_column_type(BoardCode, "board_code"),
        unique=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    posts: Mapped[list["Post"]] = relationship("Post", back_populates="board")
