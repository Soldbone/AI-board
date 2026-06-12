from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.session import Base
from backend.app.db.types import Vector


class PostEmbedding(Base):
    """RAG 검색을 위해 게시글별 embedding 벡터와 사용 모델명을 저장한다."""

    __tablename__ = "post_embeddings"
    __table_args__ = (UniqueConstraint("post_id", name="uq_post_embeddings_post_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(1536), nullable=False)
    embedding_model: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    post = relationship("Post", back_populates="embeddings")


class AiAnalysisResult(Base):
    """MCP와 Agent 실행 결과를 JSON으로 저장해 상세 화면에서 재사용한다."""

    __tablename__ = "ai_analysis_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    analysis_type: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    model_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    result_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    post = relationship("Post", back_populates="ai_analysis_results")
    user = relationship("User", back_populates="ai_analysis_results")
