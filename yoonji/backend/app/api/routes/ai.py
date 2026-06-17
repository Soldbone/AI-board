from typing import Annotated

from fastapi import APIRouter, Path

from app.api.deps import DbSession
from app.schemas.ai_schema import AiOutputResponse
from app.services import ai_service


router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/outputs/{ai_output_id}", response_model=AiOutputResponse)
def get_ai_output(
    ai_output_id: Annotated[int, Path(gt=0)],
    db: DbSession,
) -> AiOutputResponse:
    return ai_service.get_ai_output(db, ai_output_id=ai_output_id)
