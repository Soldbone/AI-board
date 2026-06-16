from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import TagStatus, TagType
from app.models.post_tag import PostTag
from app.models.tag import Tag


def list_active_tags(
    db: Session,
    *,
    normalized_query: str | None,
    tag_type: TagType | None,
    limit: int,
    tag_types: set[TagType] | None = None,
) -> list[Tag]:
    statement = select(Tag).where(Tag.status == TagStatus.ACTIVE)

    if normalized_query:
        statement = statement.where(Tag.normalized_name.contains(normalized_query))

    if tag_type is not None:
        statement = statement.where(Tag.tag_type == tag_type)
    elif tag_types:
        statement = statement.where(Tag.tag_type.in_(tag_types))

    statement = statement.order_by(
        Tag.usage_count.desc(),
        Tag.name.asc(),
        Tag.id.asc(),
    ).limit(limit)

    return list(db.scalars(statement).all())


def get_tag_by_normalized_name_and_type(
    db: Session,
    *,
    normalized_name: str,
    tag_type: TagType,
) -> Tag | None:
    statement = select(Tag).where(
        Tag.normalized_name == normalized_name,
        Tag.tag_type == tag_type,
    )
    return db.scalar(statement)


def create_tag(
    db: Session,
    *,
    name: str,
    normalized_name: str,
    tag_type: TagType,
) -> Tag:
    tag = Tag(
        name=name,
        normalized_name=normalized_name,
        tag_type=tag_type,
        usage_count=0,
        status=TagStatus.ACTIVE,
    )
    db.add(tag)
    db.flush()
    return tag


def create_post_tag_link(db: Session, *, post_id: int, tag_id: int) -> PostTag:
    link = PostTag(post_id=post_id, tag_id=tag_id)
    db.add(link)
    db.flush()
    return link


def delete_post_tag_link(db: Session, link: PostTag) -> None:
    db.delete(link)


def increment_usage_count(tag: Tag) -> None:
    tag.usage_count += 1


def decrement_usage_count(tag: Tag) -> None:
    tag.usage_count = max(tag.usage_count - 1, 0)
