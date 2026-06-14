from fastapi import APIRouter, HTTPException

from app.schemas.agent import (
    AgentPlaceRecommendationRequest,
    AgentPlaceRecommendationResponse,
)
from app.services.agent_service import (
    AgentServiceError,
    recommend_places_with_agent,
)


router = APIRouter(prefix="/agent", tags=["agent"])


@router.post(
    "/place-recommendation",
    response_model=AgentPlaceRecommendationResponse,
)
async def recommend_places(request_data: AgentPlaceRecommendationRequest):
    try:
        return await recommend_places_with_agent(request_data)
    except AgentServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
