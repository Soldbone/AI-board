from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from backend.app.schemas.users import UserSummary

BoardType = Literal["idea", "review"]
MediaType = Literal["game_url", "video_url", "image_url"]


class TagCreateRequest(BaseModel):
    """태그를 직접 만들 때 사용할 요청 스키마다."""

    name: str = Field(min_length=1, max_length=50)


class TagRead(BaseModel):
    """게시글 작성과 검색 화면에서 보여줄 태그 정보다."""

    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class PostMediaRead(BaseModel):
    """리뷰 게시글에 첨부된 게임/영상/이미지 URL을 응답으로 보낸다."""

    id: int
    media_type: MediaType
    url: str
    thumbnail_url: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PostCreateRequest(BaseModel):
    """아이디어/리뷰 게시글 작성 화면의 입력값을 받는다."""

    board_type: BoardType
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1)
    genre: str | None = Field(default=None, max_length=100)
    core_fun: str | None = None
    platform: str | None = Field(default=None, max_length=100)
    difficulty: str | None = Field(default=None, max_length=50)
    tags: list[str] = Field(default_factory=list)
    source_url: str | None = None
    video_url: str | None = None
    image_url: str | None = None


class PostUpdateRequest(BaseModel):
    """게시글 수정에서 바꿀 수 있는 필드만 받는다."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = Field(default=None, min_length=1)
    genre: str | None = Field(default=None, max_length=100)
    core_fun: str | None = None
    platform: str | None = Field(default=None, max_length=100)
    difficulty: str | None = Field(default=None, max_length=50)
    tags: list[str] | None = None
    source_url: str | None = None
    video_url: str | None = None
    image_url: str | None = None


class CommentCreateRequest(BaseModel):
    """일반 댓글과 리뷰 별점 댓글 작성 입력값을 함께 받는다."""

    content: str = Field(min_length=1)
    rating: int | None = Field(default=None, ge=1, le=5)
    good_point: str | None = None
    bad_point: str | None = None
    suggestion: str | None = None


class CommentUpdateRequest(BaseModel):
    """댓글 수정에서 바꿀 수 있는 필드만 받는다."""

    content: str | None = Field(default=None, min_length=1)
    rating: int | None = Field(default=None, ge=1, le=5)
    good_point: str | None = None
    bad_point: str | None = None
    suggestion: str | None = None


class CommentRead(BaseModel):
    """게시글 상세 화면에서 댓글 작성자와 리뷰 필드를 함께 보여준다."""

    id: int
    post_id: int
    content: str
    rating: int | None = None
    good_point: str | None = None
    bad_point: str | None = None
    suggestion: str | None = None
    author: UserSummary
    created_at: datetime
    updated_at: datetime


class PostListItem(BaseModel):
    """게시글 목록에서 빠르게 훑어볼 수 있는 요약 정보다."""

    id: int
    board_type: BoardType
    title: str
    genre: str | None = None
    core_fun: str | None = None
    platform: str | None = None
    difficulty: str | None = None
    source_url: str | None = None
    author: UserSummary
    tags: list[str]
    comment_count: int
    average_rating: float | None = None
    review_count: int
    created_at: datetime
    updated_at: datetime


class PostRead(PostListItem):
    """게시글 상세 화면에 필요한 본문, 미디어, 댓글까지 포함한다."""

    content: str
    media: list[PostMediaRead]
    comments: list[CommentRead]
