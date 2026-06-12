from dataclasses import dataclass
from pathlib import Path
import shutil

from app.core.config import settings


@dataclass(frozen=True)
class StoredImagePaths:
    original_path: Path
    thumbnail_path: Path
    original_url: str
    thumbnail_url: str


def build_temp_image_paths(*, image_id: int, extension: str) -> StoredImagePaths:
    upload_root = _upload_root()
    image_dir = upload_root / "temp" / str(image_id)
    original_path = image_dir / f"original{extension}"
    thumbnail_path = image_dir / "thumb.jpg"

    return StoredImagePaths(
        original_path=original_path,
        thumbnail_path=thumbnail_path,
        original_url=f"/uploads/temp/{image_id}/original{extension}",
        thumbnail_url=f"/uploads/temp/{image_id}/thumb.jpg",
    )


def write_bytes(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def remove_temp_image_directory(image_id: int) -> None:
    image_dir = _upload_root() / "temp" / str(image_id)
    shutil.rmtree(image_dir, ignore_errors=True)


def ensure_upload_root() -> Path:
    upload_root = _upload_root()
    upload_root.mkdir(parents=True, exist_ok=True)
    (upload_root / "temp").mkdir(parents=True, exist_ok=True)
    return upload_root


def _upload_root() -> Path:
    return Path(settings.upload_root).resolve()
