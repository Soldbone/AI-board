from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import AppException
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.models.enums import UserStatus
from app.models.user import User
from app.repositories import user_repository
from app.schemas.auth_schema import (
    LoginRequest,
    LogoutRequest,
    SignupRequest,
    SignupResponse,
    TokenRefreshRequest,
    TokenRefreshResponse,
    TokenResponse,
)
from app.schemas.user_schema import UserSummary


def signup(db: Session, payload: SignupRequest) -> SignupResponse:
    if user_repository.get_user_by_login_id(db, payload.login_id):
        raise AppException(
            "이미 사용 중인 로그인 ID입니다.",
            code="LOGIN_ID_ALREADY_EXISTS",
            status_code=409,
        )

    user = user_repository.create_user(
        db,
        login_id=payload.login_id,
        password_hash=hash_password(payload.password),
        nickname=payload.nickname,
    )

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppException(
            "회원가입 정보가 이미 사용 중입니다.",
            code="SIGNUP_CONFLICT",
            status_code=409,
        ) from exc

    db.refresh(user)
    return SignupResponse.model_validate(user)


def login(db: Session, payload: LoginRequest) -> TokenResponse:
    user = user_repository.get_user_by_login_id(db, payload.login_id)

    if user is None or not verify_password(payload.password, user.password_hash):
        raise AppException(
            "로그인 ID 또는 비밀번호가 올바르지 않습니다.",
            code="INVALID_CREDENTIALS",
            status_code=401,
        )

    _ensure_active_user(user)

    now = _utc_now()
    user.last_login_at = now
    refresh_token = create_refresh_token()
    user_repository.create_auth_session(
        db,
        user_id=user.id,
        refresh_token_hash=hash_refresh_token(refresh_token),
        expires_at=now + timedelta(days=settings.refresh_token_expire_days),
    )

    db.commit()
    db.refresh(user)

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserSummary.model_validate(user),
    )


def refresh(db: Session, payload: TokenRefreshRequest) -> TokenRefreshResponse:
    now = _utc_now()
    auth_session = user_repository.get_active_auth_session_by_hash(
        db,
        refresh_token_hash=hash_refresh_token(payload.refresh_token),
        now=now,
    )

    if auth_session is None:
        raise AppException(
            "유효하지 않은 refresh token입니다.",
            code="INVALID_REFRESH_TOKEN",
            status_code=401,
        )

    _ensure_active_user(auth_session.user)
    user_id = auth_session.user_id
    user_repository.revoke_auth_session(auth_session, revoked_at=now)

    new_refresh_token = create_refresh_token()
    user_repository.create_auth_session(
        db,
        user_id=user_id,
        refresh_token_hash=hash_refresh_token(new_refresh_token),
        expires_at=now + timedelta(days=settings.refresh_token_expire_days),
    )

    db.commit()

    return TokenRefreshResponse(
        access_token=create_access_token(user_id),
        refresh_token=new_refresh_token,
        expires_in=settings.access_token_expire_minutes * 60,
    )


def logout(db: Session, payload: LogoutRequest) -> None:
    now = _utc_now()
    auth_session = user_repository.get_active_auth_session_by_hash(
        db,
        refresh_token_hash=hash_refresh_token(payload.refresh_token),
        now=now,
    )

    if auth_session is not None:
        user_repository.revoke_auth_session(auth_session, revoked_at=now)
        db.commit()


def _ensure_active_user(user: User) -> None:
    if user.status != UserStatus.ACTIVE:
        raise AppException(
            "활성 상태가 아닌 계정입니다.",
            code="USER_NOT_ACTIVE",
            status_code=403,
        )


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)
