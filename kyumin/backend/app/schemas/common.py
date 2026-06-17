from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class MessageResponse(BaseModel):
    """단순 처리 결과를 message 값 하나로 돌려줄 때 사용한다."""

    message: str


class PaginationParams(BaseModel):
    """목록 API에서 공통으로 사용할 페이지 번호와 크기 입력값이다."""

    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=10, ge=1, le=100)


class PageResponse(BaseModel, Generic[T]):
    """목록 API가 items와 페이지 정보를 같은 모양으로 반환하게 한다."""

    items: list[T]
    page: int
    page_size: int
    total: int
