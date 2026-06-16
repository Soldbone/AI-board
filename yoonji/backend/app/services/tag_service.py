from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.models.enums import TagStatus, TagType
from app.models.post import Post
from app.models.tag import Tag
from app.repositories import tag_repository
from app.schemas.tag_schema import (
    ALLOWED_TAG_TYPES,
    TagListResponse,
    TagRequest,
    TagResponse,
)
from app.utils.normalizer import clean_tag_name, normalize_tag_name


def list_tags(
    db: Session,
    *,
    q: str | None,
    tag_type: TagType | None,
    limit: int,
) -> TagListResponse:
    if tag_type is not None and tag_type not in ALLOWED_TAG_TYPES:
        raise AppException(
            "Tag type must be CHARACTER or WORK.",
            code="TAG_TYPE_NOT_SUPPORTED",
            status_code=400,
        )

    normalized_query = normalize_tag_name(q) if q else None
    tags = tag_repository.list_active_tags(
        db,
        normalized_query=normalized_query,
        tag_type=tag_type,
        tag_types=None if tag_type is not None else ALLOWED_TAG_TYPES,
        limit=limit,
    )
    return TagListResponse(items=[TagResponse.model_validate(tag) for tag in tags])


def create_tag(db: Session, *, payload: TagRequest) -> TagResponse:
    try:
        tag = get_or_create_tag(
            db,
            name=payload.name,
            tag_type=payload.tag_type,
        )
        db.commit()
        db.refresh(tag)
        return TagResponse.model_validate(tag)
    except Exception:
        db.rollback()
        raise


def sync_post_tags(
    db: Session,
    *,
    post: Post,
    tag_requests: list[TagRequest],
) -> None:
    desired_tags = get_or_create_tags(db, tag_requests=tag_requests)
    desired_tag_ids = {tag.id for tag in desired_tags}
    current_links_by_tag_id = {link.tag_id: link for link in list(post.tag_links)}

    for link in list(post.tag_links):
        if link.tag_id in desired_tag_ids:
            continue

        tag_repository.decrement_usage_count(link.tag)
        tag_repository.delete_post_tag_link(db, link)

    for tag in desired_tags:
        if tag.id in current_links_by_tag_id:
            continue

        tag_repository.create_post_tag_link(db, post_id=post.id, tag_id=tag.id)
        tag_repository.increment_usage_count(tag)


def decrement_usage_counts_for_post(post: Post) -> None:
    for link in post.tag_links:
        tag_repository.decrement_usage_count(link.tag)


def get_or_create_tags(
    db: Session,
    *,
    tag_requests: list[TagRequest],
) -> list[Tag]:
    tags: list[Tag] = []
    seen_keys: set[tuple[str, TagType]] = set()

    for tag_request in tag_requests:
        normalized_name = normalize_tag_name(tag_request.name)
        key = (normalized_name, tag_request.tag_type)

        if key in seen_keys:
            continue

        seen_keys.add(key)
        tags.append(
            get_or_create_tag(
                db,
                name=tag_request.name,
                tag_type=tag_request.tag_type,
            )
        )

    return tags


def get_or_create_tag(
    db: Session,
    *,
    name: str,
    tag_type: TagType,
) -> Tag:
    cleaned_name = clean_tag_name(name)
    normalized_name = normalize_tag_name(cleaned_name)

    if not normalized_name:
        raise AppException(
            "태그명을 입력해 주세요.",
            code="TAG_NAME_REQUIRED",
            status_code=400,
        )

    tag = tag_repository.get_tag_by_normalized_name_and_type(
        db,
        normalized_name=normalized_name,
        tag_type=tag_type,
    )

    if tag is None:
        return tag_repository.create_tag(
            db,
            name=cleaned_name,
            normalized_name=normalized_name,
            tag_type=tag_type,
        )

    if tag.status == TagStatus.ACTIVE:
        return tag

    raise AppException(
        "사용할 수 없는 태그입니다.",
        code="TAG_NOT_AVAILABLE",
        status_code=400,
        details={"name": cleaned_name, "tag_type": tag_type},
    )
