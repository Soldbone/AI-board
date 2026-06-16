from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import ImageStatus


class ImageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    file_url: str
    thumbnail_url: str | None = None
    original_name: str
    mime_type: str
    size_bytes: int
    width: int | None = None
    height: int | None = None
    sort_order: int
    status: ImageStatus
    created_at: datetime
