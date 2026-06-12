from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.models.enums import BoardCode, FigureTargetType, ImageStatus
from app.models.post import Post
from app.models.post_figure_info import PostFigureInfo
from app.models.post_image import PostImage
from app.models.post_tag import PostTag
from app.repositories import post_repository
from app.repositories.post_repository import PostSort
from app.schemas.board_schema import BoardSummary
from app.schemas.post_schema import (
    PostDetailResponse,
    PostFigureInfoResponse,
    PostFigureInfoSummary,
    PostImageResponse,
    PostListItemResponse,
    PostListResponse,
    TagSummary,
)
from app.schemas.user_schema import UserSummary


def list_posts(
    db: Session,
    *,
    board_code: BoardCode | None,
    sort: PostSort,
    page: int,
    size: int,
) -> PostListResponse:
    total = post_repository.count_public_posts(db, board_code=board_code)
    posts = post_repository.list_public_posts(
        db,
        board_code=board_code,
        sort=sort,
        page=page,
        size=size,
    )

    return PostListResponse(
        items=[_build_post_list_item(post) for post in posts],
        page=page,
        size=size,
        total=total,
        has_next=page * size < total,
    )


def get_post(db: Session, *, post_id: int) -> PostDetailResponse:
    post = post_repository.get_public_post_by_id(db, post_id)

    if post is None:
        raise AppException(
            "게시글을 찾을 수 없습니다.",
            code="POST_NOT_FOUND",
            status_code=404,
        )

    post_repository.increment_view_count(post)
    db.commit()
    db.refresh(post)

    return _build_post_detail(post)


def _build_post_list_item(post: Post) -> PostListItemResponse:
    first_image = _first_public_image(post)

    return PostListItemResponse(
        id=post.id,
        board=BoardSummary.model_validate(post.board),
        author=UserSummary.model_validate(post.author),
        title=post.title,
        summary=_make_summary(post.content),
        thumbnail_url=first_image.thumbnail_url if first_image else None,
        tags=_build_tag_summaries(post),
        figure_info=_build_figure_info_summary(_primary_figure_info(post)),
        view_count=post.view_count,
        comment_count=post.comment_count,
        published_at=post.published_at,
    )


def _build_post_detail(post: Post) -> PostDetailResponse:
    return PostDetailResponse(
        id=post.id,
        board=BoardSummary.model_validate(post.board),
        author=UserSummary.model_validate(post.author),
        title=post.title,
        content=post.content,
        source_type=post.source_type,
        status=post.status,
        view_count=post.view_count,
        comment_count=post.comment_count,
        figure_info=_build_figure_info_response(_primary_figure_info(post)),
        tags=_build_tag_summaries(post),
        images=[_build_image_response(image) for image in _public_images(post)],
        published_at=post.published_at,
        created_at=post.created_at,
        updated_at=post.updated_at,
    )


def _primary_figure_info(post: Post) -> PostFigureInfo | None:
    for figure_info in post.figure_infos:
        if figure_info.target_type == FigureTargetType.REVIEW_TARGET:
            return figure_info

    return post.figure_infos[0] if post.figure_infos else None


def _build_figure_info_summary(
    figure_info: PostFigureInfo | None,
) -> PostFigureInfoSummary | None:
    if figure_info is None:
        return None

    return PostFigureInfoSummary(
        figure_name=figure_info.figure_name_text,
        manufacturer=figure_info.manufacturer_text,
        price_range=figure_info.price_range,
        satisfaction_score=figure_info.satisfaction_score,
    )


def _build_figure_info_response(
    figure_info: PostFigureInfo | None,
) -> PostFigureInfoResponse | None:
    if figure_info is None:
        return None

    return PostFigureInfoResponse(
        id=figure_info.id,
        figure_name=figure_info.figure_name_text,
        manufacturer=figure_info.manufacturer_text,
        figure_type=figure_info.figure_type,
        price_amount=figure_info.price_amount,
        price_range=figure_info.price_range,
        purchase_date=figure_info.purchase_date,
        satisfaction_score=figure_info.satisfaction_score,
        target_type=figure_info.target_type,
    )


def _build_tag_summaries(post: Post) -> list[TagSummary]:
    tag_links = sorted(post.tag_links, key=lambda link: link.tag.id)
    return [
        TagSummary(
            id=link.tag.id,
            name=link.tag.name,
            tag_type=link.tag.tag_type,
        )
        for link in tag_links
    ]


def _build_image_response(image: PostImage) -> PostImageResponse:
    return PostImageResponse(
        id=image.id,
        file_url=image.file_url,
        thumbnail_url=image.thumbnail_url,
        width=image.width,
        height=image.height,
        sort_order=image.sort_order,
    )


def _public_images(post: Post) -> list[PostImage]:
    return sorted(
        [
            image
            for image in post.images
            if image.status != ImageStatus.DELETED
        ],
        key=lambda image: (image.sort_order, image.id),
    )


def _first_public_image(post: Post) -> PostImage | None:
    images = _public_images(post)
    return images[0] if images else None


def _make_summary(content: str, *, max_length: int = 120) -> str:
    normalized = " ".join(content.split())

    if len(normalized) <= max_length:
        return normalized

    return f"{normalized[:max_length].rstrip()}..."
