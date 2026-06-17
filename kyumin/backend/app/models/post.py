from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.session import Base


class Post(Base):
    """아이디어/리뷰 게시판의 공통 게시글과 board_type별 입력 필드를 저장한다."""

    __tablename__ = "posts"
    __table_args__ = (
        CheckConstraint("board_type IN ('idea', 'review')", name="ck_posts_board_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    board_type: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), index=True, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    genre: Mapped[str | None] = mapped_column(String(100), nullable=True)
    core_fun: Mapped[str | None] = mapped_column(Text, nullable=True)
    platform: Mapped[str | None] = mapped_column(String(100), nullable=True)
    difficulty: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    author = relationship("User", back_populates="posts")
    comments = relationship("Comment", back_populates="post", cascade="all, delete-orphan", passive_deletes=True)
    tag_links = relationship("PostTag", back_populates="post", cascade="all, delete-orphan", passive_deletes=True)
    tags = relationship("Tag", secondary="post_tags", back_populates="posts", viewonly=True)
    media_items = relationship("PostMedia", back_populates="post", cascade="all, delete-orphan", passive_deletes=True)
    embeddings = relationship("PostEmbedding", back_populates="post", cascade="all, delete-orphan", passive_deletes=True)
    ai_analysis_results = relationship(
        "AiAnalysisResult",
        back_populates="post",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Tag(Base):
    """게시글 검색과 분류에 사용할 태그 이름을 중복 없이 저장한다."""

    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)

    post_links = relationship("PostTag", back_populates="tag", cascade="all, delete-orphan", passive_deletes=True)
    posts = relationship("Post", secondary="post_tags", back_populates="tags", viewonly=True)


class PostTag(Base):
    """게시글과 태그의 다대다 연결을 표현한다."""

    __tablename__ = "post_tags"
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)

    post = relationship("Post", back_populates="tag_links")
    tag = relationship("Tag", back_populates="post_links")


class PostMedia(Base):
    """리뷰 게시글의 게임 URL, 영상 URL, 이미지 URL 같은 미디어 항목을 저장한다."""

    __tablename__ = "post_media"
    __table_args__ = (
        CheckConstraint(
            "media_type IN ('game_url', 'video_url', 'image_url')",
            name="ck_post_media_media_type",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), index=True, nullable=False)
    media_type: Mapped[str] = mapped_column(String(30), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    post = relationship("Post", back_populates="media_items")
