from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import TagType
from app.utils.normalizer import clean_tag_name

ALLOWED_TAG_TYPES = {TagType.CHARACTER, TagType.WORK}
AllowedTagType = Literal[TagType.CHARACTER, TagType.WORK]


class TagRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    tag_type: AllowedTagType = TagType.CHARACTER

    @field_validator("name")
    @classmethod
    def strip_tag_name(cls, value: str) -> str:
        cleaned = clean_tag_name(value)

        if not cleaned:
            raise ValueError("must not be blank")

        return cleaned

    @field_validator("tag_type")
    @classmethod
    def validate_tag_type(cls, value: TagType) -> TagType:
        if value not in ALLOWED_TAG_TYPES:
            raise ValueError("tag_type must be CHARACTER or WORK")

        return value


class TagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    normalized_name: str
    tag_type: TagType
    usage_count: int


class TagListResponse(BaseModel):
    items: list[TagResponse]
