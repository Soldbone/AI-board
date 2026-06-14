from pydantic import BaseModel, Field, field_validator, model_validator


class AgentPlaceRecommendationRequest(BaseModel):
    region: str
    title: str = ""
    content: str = ""
    keyword: str | None = None
    display: int = Field(default=3, ge=1, le=5)

    @field_validator("region")
    @classmethod
    def validate_region(cls, value: str) -> str:
        cleaned_value = value.strip()
        if not cleaned_value:
            raise ValueError("region is required.")
        return cleaned_value

    @field_validator("title", "content")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("keyword")
    @classmethod
    def strip_keyword(cls, value: str | None) -> str | None:
        if value is None:
            return value

        cleaned_value = value.strip()
        return cleaned_value or None

    @model_validator(mode="after")
    def validate_has_user_intent(self):
        if not self.title and not self.content and not self.keyword:
            raise ValueError("title, content, or keyword is required.")
        return self


class AgentRecommendedPlace(BaseModel):
    title: str = ""
    category: str = ""
    road_address: str = ""
    address: str = ""
    link: str = ""
    naver_map_url: str = ""


class AgentPlaceRecommendationResponse(BaseModel):
    answer: str
    used_mcp: bool
    query: str = ""
    places: list[AgentRecommendedPlace] = Field(default_factory=list)
    fallback_map_url: str = ""
    reasoning_summary: str = ""
    tool_status: str = ""
