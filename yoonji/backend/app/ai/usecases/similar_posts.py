from __future__ import annotations

from sqlalchemy.orm import Session

from app.ai.rag.retriever import SimilarPostCandidate, retrieve_similar_review_posts
from app.core.exceptions import AppException
from app.models.enums import BoardCode, FigureTargetType, ImageStatus, TagStatus
from app.models.post import Post
from app.models.post_figure_info import PostFigureInfo
from app.models.post_image import PostImage
from app.repositories import post_repository
from app.schemas.ai_schema import (
    SimilarPostItemResponse,
    SimilarPostListResponse,
    SimilarPostSummary,
)


def get_similar_review_posts(
    db: Session,
    *,
    post_id: int,
    limit: int,
) -> SimilarPostListResponse:
    post = post_repository.get_public_post_by_id(db, post_id)

    if post is None:
        raise AppException(
            "Post was not found.",
            code="POST_NOT_FOUND",
            status_code=404,
        )

    if post.board.code != BoardCode.REVIEW:
        raise AppException(
            "Similar post recommendation is only available for REVIEW posts.",
            code="SIMILAR_POSTS_REVIEW_ONLY",
            status_code=400,
        )

    candidates = retrieve_similar_review_posts(db, post=post, limit=limit)

    if not candidates:
        return SimilarPostListResponse(items=[])

    posts_by_id = {
        candidate_post.id: candidate_post
        for candidate_post in post_repository.get_public_posts_by_ids(
            db,
            post_ids=[candidate.post_id for candidate in candidates],
        )
    }

    items: list[SimilarPostItemResponse] = []

    for candidate in candidates:
        candidate_post = posts_by_id.get(candidate.post_id)

        if candidate_post is None:
            continue

        items.append(
            SimilarPostItemResponse(
                post=_build_similar_post_summary(candidate_post),
                score=round(candidate.score, 4),
                reason=_build_reason(post, candidate_post, candidate),
            )
        )

    return SimilarPostListResponse(items=items)


def _build_similar_post_summary(post: Post) -> SimilarPostSummary:
    figure_info = _primary_figure_info(post)
    image = _first_public_image(post)

    return SimilarPostSummary(
        id=post.id,
        board_code=post.board.code,
        title=post.title,
        thumbnail_url=image.thumbnail_url if image else None,
        satisfaction_score=figure_info.satisfaction_score if figure_info else None,
        price_range=figure_info.price_range if figure_info else None,
    )


def _build_reason(
    target_post: Post,
    candidate_post: Post,
    candidate: SimilarPostCandidate,
) -> str:
    target_info = _primary_figure_info(target_post)
    candidate_info = _primary_figure_info(candidate_post)
    reason_parts: list[str] = []

    if target_info is not None and candidate_info is not None:
        if _same_text(target_info.figure_name_text, candidate_info.figure_name_text):
            reason_parts.append("same figure name")

        if _same_text(target_info.manufacturer_text, candidate_info.manufacturer_text):
            reason_parts.append("same manufacturer")

        if target_info.price_range == candidate_info.price_range:
            reason_parts.append("similar price range")

    shared_tags = _active_tag_names(target_post) & _active_tag_names(candidate_post)

    if shared_tags:
        reason_parts.append("shared tags")

    if not reason_parts and candidate.metadata:
        reason_parts.append("similar review content")

    if not reason_parts:
        reason_parts.append("similar indexed review")

    return ", ".join(reason_parts)


def _primary_figure_info(post: Post) -> PostFigureInfo | None:
    for figure_info in post.figure_infos:
        if figure_info.target_type == FigureTargetType.REVIEW_TARGET:
            return figure_info

    return post.figure_infos[0] if post.figure_infos else None


def _first_public_image(post: Post) -> PostImage | None:
    images = sorted(
        [
            image
            for image in post.images
            if image.status != ImageStatus.DELETED
        ],
        key=lambda image: (image.sort_order, image.id),
    )
    return images[0] if images else None


def _active_tag_names(post: Post) -> set[str]:
    return {
        tag_link.tag.normalized_name
        for tag_link in post.tag_links
        if tag_link.tag is not None and tag_link.tag.status == TagStatus.ACTIVE
    }


def _same_text(left: str | None, right: str | None) -> bool:
    if not left or not right:
        return False

    return left.strip().casefold() == right.strip().casefold()
