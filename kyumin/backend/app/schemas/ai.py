from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

BoardType = Literal["idea", "review"]


class RagRecommendRequest(BaseModel):
    """새 글 작성 중 관련 게시글을 찾기 위한 제목 입력값이다."""

    title: str = Field(min_length=1, max_length=200)


class RagRecommendationItem(BaseModel):
    """RAG 추천 결과에서 화면에 보여줄 게시글 요약 정보다."""

    id: int
    board_type: BoardType
    title: str
    similarity: float


class RagRecommendResponse(BaseModel):
    """관련 게시글 추천 결과 목록을 감싼 응답이다."""

    items: list[RagRecommendationItem]


class SimilarGamesRequest(BaseModel):
    """유사 게임 MCP 조회를 실행할 아이디어 게시글 ID를 받는다."""

    post_id: int = Field(ge=1)


class SimilarGameItem(BaseModel):
    """게시글 상세 화면에서 표시할 기존 게임 후보 한 건이다."""

    id: int | None = None
    name: str
    released: str | None = None
    rating: float | None = None
    metacritic: int | None = None
    platforms: list[str] = Field(default_factory=list)
    genres: list[str] = Field(default_factory=list)
    image_url: str | None = None


class SimilarGamesResponse(BaseModel):
    """MCP 유사 게임 추천 API의 단순 응답 형식이다."""

    items: list[SimilarGameItem]


class AgentReviewRequest(BaseModel):
    """게임 아이디어 Agent 분석을 실행할 게시글 ID를 받는다."""

    post_id: int = Field(ge=1)


class AgentReviewResponse(BaseModel):
    """아이디어 리뷰 Agent가 화면에 보여줄 분석 결과다."""

    summary: str
    difference: str
    difficulty: str
    suggestions: list[str] = Field(min_length=3, max_length=3)
