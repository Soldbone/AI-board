from pydantic import BaseModel, ConfigDict

from app.models.enums import BoardCode


class BoardSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: BoardCode
    name: str


class BoardResponse(BoardSummary):
    description: str | None = None
    sort_order: int
    is_active: bool


class BoardListResponse(BaseModel):
    items: list[BoardResponse]
