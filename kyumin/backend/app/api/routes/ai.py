from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.api.dependencies import get_current_user
from backend.app.core.config import Settings, get_settings
from backend.app.db.session import get_db
from backend.app.models.user import User
from backend.app.schemas.ai import (
    AgentReviewRequest,
    AgentReviewResponse,
    RagRecommendRequest,
    RagRecommendResponse,
    SimilarGamesRequest,
    SimilarGamesResponse,
)
from backend.app.services import idea_agent
from backend.app.services import rag as rag_service
from backend.app.services import similar_games

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/rag/recommend-posts", response_model=RagRecommendResponse)
def recommend_posts(
    payload: RagRecommendRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> RagRecommendResponse:
    """새 글 제목을 기준으로 관련 게시글 3개를 추천한다."""
    return rag_service.recommend_posts_by_title(db, current_user, payload.title, settings)


@router.post("/mcp/similar-games", response_model=SimilarGamesResponse)
async def find_similar_games(
    payload: SimilarGamesRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> SimilarGamesResponse:
    """아이디어 게시글을 기준으로 MCP 서버에서 비슷한 기존 게임을 최대 5개 찾는다."""
    return await similar_games.find_similar_games_for_post(db, current_user, payload.post_id, settings)


@router.post("/agent/review-idea", response_model=AgentReviewResponse)
async def review_idea(
    payload: AgentReviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AgentReviewResponse:
    """게임 아이디어 게시글에 대해 RAG/MCP 참고자료를 모아 Agent 분석을 실행한다."""
    return await idea_agent.review_idea_post(db, current_user, payload.post_id, settings)
