from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any

from langchain_core.documents import Document

from app.models.comment import Comment
from app.models.enums import (
    BoardCode,
    CommentStatus,
    ContentSourceType,
    FigureTargetType,
    PostStatus,
    TagStatus,
    TagType,
)
from app.models.post import Post
from app.models.post_figure_info import PostFigureInfo


INDEXABLE_POST_BOARD_CODES = {
    BoardCode.REVIEW,
    BoardCode.QUESTION,
    BoardCode.PURCHASE_HELP,
}
INDEXABLE_COMMENT_BOARD_CODES = {BoardCode.QUESTION}


def build_post_document(post: Post) -> Document | None:
    if not is_indexable_post(post):
        return None

    figure_info = _primary_figure_info(post)
    tags = _active_tag_names(post)
    character_tags = _active_tag_names(post, tag_type=TagType.CHARACTER)
    work_tags = _active_tag_names(post, tag_type=TagType.WORK)
    metadata = _compact_metadata(
        {
            "source_type": ContentSourceType.POST,
            "post_id": post.id,
            "comment_id": None,
            "board_code": post.board.code,
            "title": post.title,
            "author_id": post.author_id,
            "figure_name": figure_info.figure_name_text if figure_info else None,
            "manufacturer": figure_info.manufacturer_text if figure_info else None,
            "figure_type": figure_info.figure_type if figure_info else None,
            "price_amount": figure_info.price_amount if figure_info else None,
            "price_range": figure_info.price_range if figure_info else None,
            "satisfaction_score": (
                figure_info.satisfaction_score if figure_info else None
            ),
            "tags": tags,
            "character_tags": character_tags,
            "work_tags": work_tags,
            "published_at": post.published_at,
            "created_at": post.created_at,
            "updated_at": post.updated_at,
        }
    )

    return Document(
        page_content=_build_post_text(post, figure_info=figure_info, tags=tags),
        metadata=metadata,
    )


def build_comment_document(comment: Comment) -> Document | None:
    if not is_indexable_comment(comment):
        return None

    post = comment.post
    metadata = _compact_metadata(
        {
            "source_type": ContentSourceType.COMMENT,
            "post_id": post.id,
            "comment_id": comment.id,
            "board_code": post.board.code,
            "post_title": post.title,
            "author_id": comment.author_id,
            "parent_author_id": post.author_id,
            "created_at": comment.created_at,
            "updated_at": comment.updated_at,
        }
    )

    return Document(
        page_content=_build_comment_text(comment),
        metadata=metadata,
    )


def is_indexable_post(post: Post) -> bool:
    return (
        post.status == PostStatus.PUBLISHED
        and post.deleted_at is None
        and post.board is not None
        and post.board.is_active
        and post.board.code in INDEXABLE_POST_BOARD_CODES
    )


def is_indexable_comment(comment: Comment) -> bool:
    post = comment.post
    return (
        comment.status == CommentStatus.PUBLISHED
        and comment.deleted_at is None
        and post is not None
        and post.status == PostStatus.PUBLISHED
        and post.deleted_at is None
        and post.board is not None
        and post.board.is_active
        and post.board.code in INDEXABLE_COMMENT_BOARD_CODES
    )


def _build_post_text(
    post: Post,
    *,
    figure_info: PostFigureInfo | None,
    tags: list[str],
) -> str:
    parts = [
        f"Board: {post.board.code.value}",
        f"Title: {post.title}",
        f"Content:\n{post.content}",
    ]

    if figure_info is not None:
        parts.extend(
            [
                f"Figure name: {figure_info.figure_name_text}",
                f"Manufacturer: {figure_info.manufacturer_text or 'unknown'}",
                f"Figure type: {_to_plain_value(figure_info.figure_type) or 'unknown'}",
                f"Price range: {_to_plain_value(figure_info.price_range)}",
                f"Satisfaction score: {figure_info.satisfaction_score or 'unknown'}",
            ]
        )

    if tags:
        parts.append(f"Tags: {', '.join(tags)}")

    return "\n\n".join(parts)


def _build_comment_text(comment: Comment) -> str:
    post = comment.post
    return "\n\n".join(
        [
            f"Question title: {post.title}",
            f"Question content:\n{post.content}",
            f"Comment answer:\n{comment.content}",
        ]
    )


def _primary_figure_info(post: Post) -> PostFigureInfo | None:
    for figure_info in post.figure_infos:
        if figure_info.target_type == FigureTargetType.REVIEW_TARGET:
            return figure_info

    return post.figure_infos[0] if post.figure_infos else None


def _active_tag_names(post: Post, *, tag_type: TagType | None = None) -> list[str]:
    names: list[str] = []

    for tag_link in post.tag_links:
        tag = tag_link.tag
        if tag is None or tag.status != TagStatus.ACTIVE:
            continue

        if tag_type is not None and tag.tag_type != tag_type:
            continue

        names.append(tag.name)

    return sorted(names)


def _compact_metadata(values: dict[str, Any]) -> dict[str, Any]:
    return {
        key: _to_plain_value(value)
        for key, value in values.items()
        if value is not None and value != []
    }


def _to_plain_value(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value

    if isinstance(value, Decimal):
        return float(value)

    if isinstance(value, datetime | date):
        return value.isoformat()

    if isinstance(value, list):
        return [_to_plain_value(item) for item in value]

    return value
