from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError


THUMBNAIL_SIZE = (480, 480)


class InvalidImageFileError(ValueError):
    pass


def get_image_size(content: bytes) -> tuple[int, int]:
    try:
        with Image.open(BytesIO(content)) as image:
            image = ImageOps.exif_transpose(image)
            return image.size
    except (UnidentifiedImageError, OSError) as exc:
        raise InvalidImageFileError("Invalid image file") from exc


def create_thumbnail(source_path: Path, thumbnail_path: Path) -> None:
    try:
        with Image.open(source_path) as image:
            image = ImageOps.exif_transpose(image)
            image.thumbnail(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
            thumbnail = _to_rgb(image)
            thumbnail_path.parent.mkdir(parents=True, exist_ok=True)
            thumbnail.save(thumbnail_path, format="JPEG", quality=85, optimize=True)
    except (UnidentifiedImageError, OSError) as exc:
        raise InvalidImageFileError("Invalid image file") from exc


def _to_rgb(image: Image.Image) -> Image.Image:
    if image.mode in ("RGBA", "LA"):
        background = Image.new("RGB", image.size, (255, 255, 255))
        alpha_channel = image.getchannel("A")
        background.paste(image, mask=alpha_channel)
        return background

    if image.mode == "P" and "transparency" in image.info:
        rgba_image = image.convert("RGBA")
        background = Image.new("RGB", rgba_image.size, (255, 255, 255))
        background.paste(rgba_image, mask=rgba_image.getchannel("A"))
        return background

    return image.convert("RGB")
