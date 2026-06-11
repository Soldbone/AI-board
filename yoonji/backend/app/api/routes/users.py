from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.user_schema import UserResponse
from app.services import user_service


router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
def get_me(current_user: CurrentUser, db: DbSession) -> UserResponse:
    return user_service.get_me(db, user_id=current_user.id)
