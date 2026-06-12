from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import TagType
from app.utils.normalizer import clean_tag_name


class TagRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    tag_type: TagType = TagType.GENERAL

    @field_validator("name")
    @classmethod
    def strip_tag_name(cls, value: str) -> str:
        cleaned = clean_tag_name(value)

        if not cleaned:
            raise ValueError("must not be blank")

        return cleaned


class TagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    normalized_name: str
    tag_type: TagType
    usage_count: int


class TagListResponse(BaseModel):
    items: list[TagResponse]
