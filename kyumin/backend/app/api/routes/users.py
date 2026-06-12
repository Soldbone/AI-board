from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.api.dependencies import get_current_user
from backend.app.core.config import Settings, get_settings
from backend.app.db.session import get_db
from backend.app.models.user import User
from backend.app.schemas.common import MessageResponse
from backend.app.schemas.users import ApiKeyStatusResponse, ApiKeyUpsertRequest, NicknameUpdateRequest, UserRead
from backend.app.services import users as user_service

router = APIRouter(prefix="/users/me", tags=["users"])


@router.patch("/nickname", response_model=UserRead)
def update_nickname(
    payload: NicknameUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    """로그인한 사용자의 닉네임만 수정한다."""
    return user_service.update_nickname(db, current_user, payload.nickname)


@router.delete("", response_model=MessageResponse)
def delete_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MessageResponse:
    """회원 계정과 연결된 작성 기록을 삭제한다."""
    user_service.delete_account(db, current_user)
    return MessageResponse(message="user_deleted")


@router.get("/api-key", response_model=ApiKeyStatusResponse)
def get_api_key(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> ApiKeyStatusResponse:
    """API Key 원문 없이 등록 여부와 마지막 4자리만 반환한다."""
    return user_service.get_api_key_status(db, current_user)


@router.put("/api-key", response_model=ApiKeyStatusResponse)
def save_api_key(
    payload: ApiKeyUpsertRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ApiKeyStatusResponse:
    """사용자 OpenAI API Key를 암호화해 저장한다."""
    return user_service.save_api_key(db, current_user, payload.provider, payload.api_key, settings)


@router.delete("/api-key", response_model=ApiKeyStatusResponse)
def delete_api_key(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApiKeyStatusResponse:
    """저장된 사용자 OpenAI API Key 암호문을 삭제한다."""
    return user_service.delete_api_key(db, current_user)
