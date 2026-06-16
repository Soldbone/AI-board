from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import ImageStatus
from app.models.post_image import PostImage


def create_temp_image_record(
    db: Session,
    *,
    uploader_id: int,
    original_name: str,
    mime_type: str,
    size_bytes: int,
) -> PostImage:
    image = PostImage(
        uploader_id=uploader_id,
        file_url="",
        thumbnail_url=None,
        original_name=original_name,
        mime_type=mime_type,
        size_bytes=size_bytes,
        width=None,
        height=None,
        sort_order=0,
        status=ImageStatus.TEMP,
    )
    db.add(image)
    db.flush()
    return image


def get_image_by_id(db: Session, image_id: int) -> PostImage | None:
    return db.get(PostImage, image_id)


def get_images_by_ids(db: Session, image_ids: list[int]) -> list[PostImage]:
    if not image_ids:
        return []

    statement = select(PostImage).where(PostImage.id.in_(image_ids))
    return list(db.scalars(statement).all())


def update_image_file_info(
    image: PostImage,
    *,
    file_url: str,
    thumbnail_url: str,
    width: int,
    height: int,
) -> PostImage:
    image.file_url = file_url
    image.thumbnail_url = thumbnail_url
    image.width = width
    image.height = height
    return image


def mark_image_deleted(image: PostImage) -> None:
    image.post_id = None
    image.status = ImageStatus.DELETED
