from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.config import EMBEDDING_DIMENSION
from app.database import Base


class PostEmbedding(Base):
    __tablename__ = "post_embeddings"

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("posts.id"), unique=True, nullable=False)
    embedding = Column(Vector(EMBEDDING_DIMENSION), nullable=True)
    embedding_model = Column(String(100), nullable=False)
    source_text = Column(Text, nullable=False)
    comment_summary = Column(Text, nullable=True)
    source_hash = Column(String(64), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
