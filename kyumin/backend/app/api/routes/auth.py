from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.api.dependencies import get_current_user
from backend.app.core.config import Settings, get_settings
from backend.app.db.session import get_db
from backend.app.models.user import User
from backend.app.schemas.common import MessageResponse
from backend.app.schemas.users import LoginRequest, RegisterCodeRequest, RegisterVerifyRequest, TokenResponse, UserRead
from backend.app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register/request-code")
def request_register_code(payload: RegisterCodeRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    """회원가입 요청을 받아 인증코드를 생성하고 서버 콘솔/로그에 출력한다."""
    email = auth_service.request_register_code(db, payload.email, payload.password)
    return {"message": "verification_code_created", "email": email}


@router.post("/register/verify", response_model=TokenResponse)
def verify_register_code(
    payload: RegisterVerifyRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TokenResponse:
    """사용자가 입력한 인증코드를 검증하고 로그인 토큰을 발급한다."""
    return auth_service.verify_register_code(db, payload.email, payload.code, settings)


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TokenResponse:
    """이메일과 비밀번호 로그인 요청에 JWT 응답을 반환한다."""
    return auth_service.login_user(db, payload.email, payload.password, settings)


@router.post("/logout", response_model=MessageResponse)
def logout(current_user: User = Depends(get_current_user)) -> MessageResponse:
    """JWT는 서버에 저장하지 않으므로 로그아웃 성공 메시지만 반환한다."""
    return MessageResponse(message="logged_out")


@router.get("/me", response_model=UserRead)
def read_me(current_user: User = Depends(get_current_user)) -> User:
    """현재 JWT로 식별된 사용자 공개 정보를 반환한다."""
    return current_user
