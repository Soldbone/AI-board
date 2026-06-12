from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.models.enums import ImageStatus
from app.models.user import User
from app.repositories import image_repository
from app.schemas.image_schema import ImageResponse
from app.storage import local_storage, thumbnail_generator


ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


async def upload_image(
    db: Session,
    *,
    file: UploadFile,
    current_user: User,
) -> ImageResponse:
    mime_type = file.content_type or ""
    extension = ALLOWED_IMAGE_TYPES.get(mime_type)

    if extension is None:
        raise AppException(
            "JPEG, PNG, WEBP 이미지만 업로드할 수 있습니다.",
            code="UNSUPPORTED_IMAGE_TYPE",
            status_code=400,
            details={"mime_type": mime_type},
        )

    content = await file.read(MAX_IMAGE_BYTES + 1)

    if not content:
        raise AppException(
            "비어 있는 파일은 업로드할 수 없습니다.",
            code="EMPTY_IMAGE_FILE",
            status_code=400,
        )

    if len(content) > MAX_IMAGE_BYTES:
        raise AppException(
            "이미지 파일은 최대 5MB까지 업로드할 수 있습니다.",
            code="IMAGE_TOO_LARGE",
            status_code=400,
            details={"max_bytes": MAX_IMAGE_BYTES},
        )

    try:
        width, height = thumbnail_generator.get_image_size(content)
    except thumbnail_generator.InvalidImageFileError as exc:
        raise AppException(
            "올바른 이미지 파일이 아닙니다.",
            code="INVALID_IMAGE_FILE",
            status_code=400,
        ) from exc

    image = image_repository.create_temp_image_record(
        db,
        uploader_id=current_user.id,
        original_name=_safe_original_name(file.filename),
        mime_type=mime_type,
        size_bytes=len(content),
    )
    paths = local_storage.build_temp_image_paths(
        image_id=image.id,
        extension=extension,
    )

    try:
        local_storage.write_bytes(paths.original_path, content)
        thumbnail_generator.create_thumbnail(paths.original_path, paths.thumbnail_path)
        image_repository.update_image_file_info(
            image,
            file_url=paths.original_url,
            thumbnail_url=paths.thumbnail_url,
            width=width,
            height=height,
        )
        db.commit()
        db.refresh(image)
        return ImageResponse.model_validate(image)
    except Exception:
        db.rollback()
        local_storage.remove_temp_image_directory(image.id)
        raise


def delete_image(
    db: Session,
    *,
    image_id: int,
    current_user: User,
) -> None:
    image = image_repository.get_image_by_id(db, image_id)

    if image is None:
        raise AppException(
            "이미지를 찾을 수 없습니다.",
            code="IMAGE_NOT_FOUND",
            status_code=404,
        )

    if image.uploader_id != current_user.id:
        raise AppException(
            "업로더 본인만 이미지를 삭제할 수 있습니다.",
            code="IMAGE_UPLOADER_REQUIRED",
            status_code=403,
        )

    if image.status == ImageStatus.DELETED:
        return

    try:
        image_repository.mark_image_deleted(image)
        db.commit()
    except Exception:
        db.rollback()
        raise


def _safe_original_name(filename: str | None) -> str:
    if not filename:
        return "upload"

    normalized = filename.replace("\\", "/")
    return normalized.rsplit("/", maxsplit=1)[-1] or "upload"
