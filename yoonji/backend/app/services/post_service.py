from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.models.enums import (
    BoardCode,
    FigureTargetType,
    ImageStatus,
    PostStatus,
    PriceRange,
)
from app.models.post import Post
from app.models.post_figure_info import PostFigureInfo
from app.models.post_image import PostImage
from app.models.post_tag import PostTag
from app.models.user import User
from app.repositories import image_repository
from app.repositories import post_repository
from app.services import tag_service
from app.repositories.post_repository import PostSort
from app.schemas.board_schema import BoardSummary
from app.schemas.post_schema import (
    PostCreateRequest,
    PostCreateResponse,
    PostDetailResponse,
    PostFigureInfoResponse,
    PostFigureInfoRequest,
    PostFigureInfoSummary,
    PostImageResponse,
    PostListItemResponse,
    PostListResponse,
    PostUpdateRequest,
    TagSummary,
)
from app.schemas.user_schema import UserSummary
from app.utils.normalizer import normalize_tag_name

MVP_WRITABLE_BOARD_CODES = {
    BoardCode.REVIEW,
    BoardCode.INFO,
    BoardCode.QUESTION,
    BoardCode.PURCHASE_HELP,
}


def list_posts(
    db: Session,
    *,
    board_code: BoardCode | None,
    q: str | None,
    tag: str | None,
    sort: PostSort,
    page: int,
    size: int,
) -> PostListResponse:
    cleaned_q = _clean_optional_text(q)
    normalized_q = normalize_tag_name(cleaned_q) if cleaned_q else None
    normalized_tag = normalize_tag_name(tag) if tag else None
    if normalized_tag == "":
        normalized_tag = None

    total = post_repository.count_public_posts(
        db,
        board_code=board_code,
        q=cleaned_q,
        normalized_q=normalized_q,
        normalized_tag=normalized_tag,
    )
    posts = post_repository.list_public_posts(
        db,
        board_code=board_code,
        q=cleaned_q,
        normalized_q=normalized_q,
        normalized_tag=normalized_tag,
        sort=sort,
        page=page,
        size=size,
    )

    return build_post_list_response(
        posts=posts,
        page=page,
        size=size,
        total=total,
    )


def build_post_list_response(
    *,
    posts: list[Post],
    page: int,
    size: int,
    total: int,
) -> PostListResponse:
    return PostListResponse(
        items=[_build_post_list_item(post) for post in posts],
        page=page,
        size=size,
        total=total,
        has_next=page * size < total,
    )


def _clean_optional_text(value: str | None) -> str | None:
    if value is None:
        return None

    stripped = value.strip()
    return stripped or None


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


def create_post(
    db: Session,
    *,
    payload: PostCreateRequest,
    current_user: User,
) -> PostCreateResponse:
    board = post_repository.get_active_board_by_code(db, payload.board_code)

    if board is None:
        raise AppException(
            "게시판을 찾을 수 없습니다.",
            code="BOARD_NOT_FOUND",
            status_code=404,
        )

    _ensure_mvp_writable_board(board.code)
    _ensure_published_status(payload.status)
    _ensure_create_figure_info_rule(board.code, payload.figure_info)
    images = _get_attachable_images(
        db,
        image_ids=payload.image_ids,
        current_user=current_user,
        current_post_id=None,
    )

    try:
        post = post_repository.create_post(
            db,
            board=board,
            author_id=current_user.id,
            title=payload.title,
            content=payload.content,
            status=payload.status,
        )

        if board.code == BoardCode.REVIEW and payload.figure_info is not None:
            post_repository.create_figure_info(
                db,
                post=post,
                values=_build_figure_info_values(payload.figure_info),
            )

        tag_service.sync_post_tags(db, post=post, tag_requests=payload.tags)
        _sync_post_images(post=post, images=images)

        db.commit()
        db.refresh(post)

        return PostCreateResponse(
            id=post.id,
            board_code=board.code,
            title=post.title,
            status=post.status,
            created_at=post.created_at,
        )
    except Exception:
        db.rollback()
        raise


def update_post(
    db: Session,
    *,
    post_id: int,
    payload: PostUpdateRequest,
    current_user: User,
) -> PostDetailResponse:
    post = _get_mutable_post(db, post_id=post_id)
    _ensure_post_author(post, current_user)
    _ensure_update_figure_info_rule(post, payload)
    images: list[PostImage] | None = None

    if payload.image_ids is not None:
        images = _get_attachable_images(
            db,
            image_ids=payload.image_ids,
            current_user=current_user,
            current_post_id=post.id,
        )

    try:
        if payload.title is not None:
            post.title = payload.title

        if payload.content is not None:
            post.content = payload.content

        if (
            post.board.code == BoardCode.REVIEW
            and "figure_info" in payload.model_fields_set
            and payload.figure_info is not None
        ):
            _upsert_review_figure_info(db, post=post, payload=payload.figure_info)

        if images is not None:
            _sync_post_images(post=post, images=images)

        if payload.tags is not None:
            tag_service.sync_post_tags(db, post=post, tag_requests=payload.tags)

        db.commit()
        db.refresh(post)
        return _build_post_detail(post)
    except Exception:
        db.rollback()
        raise


def delete_post(
    db: Session,
    *,
    post_id: int,
    current_user: User,
) -> None:
    post = _get_mutable_post(db, post_id=post_id)
    _ensure_post_author(post, current_user)

    try:
        tag_service.decrement_usage_counts_for_post(post)
        post_repository.soft_delete_post(post)
        db.commit()
    except Exception:
        db.rollback()
        raise


def _ensure_mvp_writable_board(board_code: BoardCode) -> None:
    if board_code in MVP_WRITABLE_BOARD_CODES:
        return

    raise AppException(
        "MVP에서는 REVIEW, INFO, QUESTION, PURCHASE_HELP 게시판에만 글을 작성할 수 있습니다.",
        code="BOARD_NOT_WRITABLE_IN_MVP",
        status_code=400,
    )


def _ensure_published_status(status: PostStatus) -> None:
    if status == PostStatus.PUBLISHED:
        return

    raise AppException(
        "MVP에서는 PUBLISHED 상태의 게시글만 작성할 수 있습니다.",
        code="POST_STATUS_NOT_SUPPORTED_IN_MVP",
        status_code=400,
    )


def _ensure_create_figure_info_rule(
    board_code: BoardCode,
    figure_info: PostFigureInfoRequest | None,
) -> None:
    if board_code == BoardCode.REVIEW:
        if figure_info is None:
            raise AppException(
                "후기 게시판은 피규어 정보가 필요합니다.",
                code="FIGURE_INFO_REQUIRED",
                status_code=400,
            )

        _validate_review_figure_info_values(_build_figure_info_values(figure_info))
        return

    if figure_info is not None:
        raise AppException(
            "피규어 정보는 후기 게시판(REVIEW)에서만 입력할 수 있습니다.",
            code="FIGURE_INFO_ONLY_FOR_REVIEW",
            status_code=400,
        )


def _ensure_update_figure_info_rule(post: Post, payload: PostUpdateRequest) -> None:
    if "figure_info" not in payload.model_fields_set or payload.figure_info is None:
        return

    if post.board.code == BoardCode.REVIEW:
        return

    raise AppException(
        "피규어 정보는 후기 게시판(REVIEW)에서만 수정할 수 있습니다.",
        code="FIGURE_INFO_ONLY_FOR_REVIEW",
        status_code=400,
    )


def _get_mutable_post(db: Session, *, post_id: int) -> Post:
    post = post_repository.get_post_for_write_action(db, post_id)

    if post is None:
        raise AppException(
            "게시글을 찾을 수 없습니다.",
            code="POST_NOT_FOUND",
            status_code=404,
        )

    return post


def _ensure_post_author(post: Post, current_user: User) -> None:
    if post.author_id == current_user.id:
        return

    raise AppException(
        "작성자만 게시글을 수정하거나 삭제할 수 있습니다.",
        code="POST_AUTHOR_REQUIRED",
        status_code=403,
    )


def _get_attachable_images(
    db: Session,
    *,
    image_ids: list[int],
    current_user: User,
    current_post_id: int | None,
) -> list[PostImage]:
    if not image_ids:
        return []

    images = image_repository.get_images_by_ids(db, image_ids)
    images_by_id = {image.id: image for image in images}
    missing_ids = [
        image_id for image_id in image_ids if image_id not in images_by_id
    ]

    if missing_ids:
        raise AppException(
            "이미지를 찾을 수 없습니다.",
            code="IMAGE_NOT_FOUND",
            status_code=400,
            details={"image_ids": missing_ids},
        )

    ordered_images = [images_by_id[image_id] for image_id in image_ids]

    for image in ordered_images:
        _ensure_attachable_image(
            image,
            current_user=current_user,
            current_post_id=current_post_id,
        )

    return ordered_images


def _ensure_attachable_image(
    image: PostImage,
    *,
    current_user: User,
    current_post_id: int | None,
) -> None:
    if image.uploader_id != current_user.id:
        raise AppException(
            "본인이 업로드한 이미지만 게시글에 연결할 수 있습니다.",
            code="IMAGE_UPLOADER_REQUIRED",
            status_code=403,
        )

    if image.status == ImageStatus.DELETED:
        raise AppException(
            "삭제된 이미지는 게시글에 연결할 수 없습니다.",
            code="IMAGE_ALREADY_DELETED",
            status_code=400,
            details={"image_id": image.id},
        )

    if image.status == ImageStatus.FAILED:
        raise AppException(
            "업로드에 실패한 이미지는 게시글에 연결할 수 없습니다.",
            code="IMAGE_UPLOAD_FAILED",
            status_code=400,
            details={"image_id": image.id},
        )

    if image.post_id is not None and image.post_id != current_post_id:
        raise AppException(
            "이미 다른 게시글에 연결된 이미지입니다.",
            code="IMAGE_ALREADY_ATTACHED",
            status_code=400,
            details={"image_id": image.id, "post_id": image.post_id},
        )

    if image.status == ImageStatus.ATTACHED and image.post_id != current_post_id:
        raise AppException(
            "이미 연결된 이미지는 같은 게시글 수정에서만 유지할 수 있습니다.",
            code="IMAGE_ALREADY_ATTACHED",
            status_code=400,
            details={"image_id": image.id},
        )


def _sync_post_images(*, post: Post, images: list[PostImage]) -> None:
    requested_image_ids = {image.id for image in images}

    for image in list(post.images):
        if image.id in requested_image_ids or image.status == ImageStatus.DELETED:
            continue

        image.post_id = None
        image.status = ImageStatus.TEMP
        image.sort_order = 0

    for sort_order, image in enumerate(images):
        image.post_id = post.id
        image.status = ImageStatus.ATTACHED
        image.sort_order = sort_order


def _upsert_review_figure_info(
    db: Session,
    *,
    post: Post,
    payload: PostFigureInfoRequest,
) -> PostFigureInfo:
    figure_info = _primary_figure_info(post)
    values = _merge_figure_info_values(figure_info, payload)
    _validate_review_figure_info_values(values)

    if figure_info is None:
        return post_repository.create_figure_info(
            db,
            post=post,
            values=values,
        )

    return post_repository.update_figure_info(figure_info, values=values)


def _build_figure_info_values(payload: PostFigureInfoRequest) -> dict:
    return {
        "figure_name_text": payload.figure_name,
        "manufacturer_text": payload.manufacturer,
        "figure_type": payload.figure_type,
        "price_amount": payload.price_amount,
        "price_range": payload.price_range or PriceRange.UNKNOWN,
        "purchase_date": payload.purchase_date,
        "satisfaction_score": payload.satisfaction_score,
        "target_type": payload.target_type,
    }


def _merge_figure_info_values(
    figure_info: PostFigureInfo | None,
    payload: PostFigureInfoRequest,
) -> dict:
    values = _figure_info_to_values(figure_info)
    incoming = payload.model_dump(exclude_unset=True)

    field_map = {
        "figure_name": "figure_name_text",
        "manufacturer": "manufacturer_text",
    }

    for field_name, value in incoming.items():
        model_field_name = field_map.get(field_name, field_name)
        values[model_field_name] = value

    if values.get("price_range") is None:
        values["price_range"] = PriceRange.UNKNOWN

    if values.get("target_type") is None:
        values["target_type"] = FigureTargetType.REVIEW_TARGET

    return values


def _figure_info_to_values(figure_info: PostFigureInfo | None) -> dict:
    if figure_info is None:
        return {
            "figure_name_text": None,
            "manufacturer_text": None,
            "figure_type": None,
            "price_amount": None,
            "price_range": PriceRange.UNKNOWN,
            "purchase_date": None,
            "satisfaction_score": None,
            "target_type": FigureTargetType.REVIEW_TARGET,
        }

    return {
        "figure_name_text": figure_info.figure_name_text,
        "manufacturer_text": figure_info.manufacturer_text,
        "figure_type": figure_info.figure_type,
        "price_amount": figure_info.price_amount,
        "price_range": figure_info.price_range,
        "purchase_date": figure_info.purchase_date,
        "satisfaction_score": figure_info.satisfaction_score,
        "target_type": figure_info.target_type,
    }


def _validate_review_figure_info_values(values: dict) -> None:
    if values.get("target_type") != FigureTargetType.REVIEW_TARGET:
        raise AppException(
            "MVP 후기 게시글의 피규어 정보는 REVIEW_TARGET만 사용할 수 있습니다.",
            code="UNSUPPORTED_FIGURE_TARGET_TYPE",
            status_code=400,
        )

    if not values.get("figure_name_text"):
        raise AppException(
            "후기 게시판은 피규어명이 필요합니다.",
            code="FIGURE_NAME_REQUIRED",
            status_code=400,
        )

    if values.get("satisfaction_score") is None:
        raise AppException(
            "후기 게시판은 만족도 점수가 필요합니다.",
            code="SATISFACTION_SCORE_REQUIRED",
            status_code=400,
        )


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
