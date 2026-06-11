from fastapi import APIRouter, Response, status

from app.api.deps import DbSession
from app.schemas.auth_schema import (
    LoginRequest,
    LogoutRequest,
    SignupRequest,
    SignupResponse,
    TokenRefreshRequest,
    TokenRefreshResponse,
    TokenResponse,
)
from app.services import auth_service


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/signup",
    response_model=SignupResponse,
    status_code=status.HTTP_201_CREATED,
)
def signup(payload: SignupRequest, db: DbSession) -> SignupResponse:
    return auth_service.signup(db, payload)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: DbSession) -> TokenResponse:
    return auth_service.login(db, payload)


@router.post("/refresh", response_model=TokenRefreshResponse)
def refresh(payload: TokenRefreshRequest, db: DbSession) -> TokenRefreshResponse:
    return auth_service.refresh(db, payload)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: LogoutRequest, db: DbSession) -> Response:
    auth_service.logout(db, payload)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
