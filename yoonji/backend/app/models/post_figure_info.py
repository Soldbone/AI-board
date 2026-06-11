from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import (
    FigureTargetType,
    FigureType,
    PriceRange,
    enum_column_type,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PostFigureInfo(Base):
    __tablename__ = "post_figure_infos"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    post_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("posts.id"), index=True)
    figure_name_text: Mapped[str] = mapped_column(String(200), index=True)
    manufacturer_text: Mapped[str | None] = mapped_column(String(200), index=True)
    figure_type: Mapped[FigureType | None] = mapped_column(
        enum_column_type(FigureType, "figure_type")
    )
    price_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    price_range: Mapped[PriceRange] = mapped_column(
        enum_column_type(PriceRange, "price_range"),
        default=PriceRange.UNKNOWN,
    )
    purchase_date: Mapped[date | None] = mapped_column(Date)
    satisfaction_score: Mapped[int | None] = mapped_column(Integer)
    target_type: Mapped[FigureTargetType] = mapped_column(
        enum_column_type(FigureTargetType, "figure_target_type"),
        default=FigureTargetType.REVIEW_TARGET,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    post: Mapped["Post"] = relationship("Post", back_populates="figure_infos")
