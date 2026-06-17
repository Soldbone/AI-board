from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from backend.app.core.config import Settings
from backend.app.core.security import create_access_token, hash_password, verify_password
from backend.app.models.user import EmailVerificationCode, User
from backend.app.schemas.users import TokenResponse, TokenUser

EMAIL_CODE_EXPIRE_MINUTES = 10

logger = logging.getLogger(__name__)


def normalize_email(email: str) -> str:
    """로그인/회원가입에서 이메일 비교가 흔들리지 않도록 정리한다."""
    return email.strip().lower()


def find_user_by_email(db: Session, email: str) -> User | None:
    """이메일로 사용자 한 명을 조회한다."""
    return db.execute(select(User).where(User.email == normalize_email(email))).scalar_one_or_none()


def request_register_code(db: Session, email: str, password: str) -> str:
    """회원가입 시작 시 미인증 사용자를 만들고 인증코드를 저장한다."""
    normalized_email = normalize_email(email)
    if not normalized_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="email_required")

    user = find_user_by_email(db, normalized_email)
    if user is not None and user.is_email_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="already_registered")

    password_hash = hash_password(password)
    if user is None:
        user = User(email=normalized_email, password_hash=password_hash, is_email_verified=False)
        db.add(user)
    else:
        user.password_hash = password_hash

    code = f"{secrets.randbelow(1_000_000):06d}"
    verification_code = EmailVerificationCode(
        email=normalized_email,
        code=code,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=EMAIL_CODE_EXPIRE_MINUTES),
    )
    db.add(verification_code)
    db.commit()

    logger.info("MVP email verification code created: email=%s code=%s", normalized_email, code)
    print(f"[Potato maker] email verification code for {normalized_email}: {code}")
    return normalized_email


def verify_register_code(db: Session, email: str, code: str, settings: Settings) -> TokenResponse:
    """인증코드가 맞으면 사용자 이메일 인증을 완료하고 JWT를 발급한다."""
    normalized_email = normalize_email(email)
    verification_code = db.execute(
        select(EmailVerificationCode)
        .where(
            EmailVerificationCode.email == normalized_email,
            EmailVerificationCode.code == code.strip(),
            EmailVerificationCode.verified_at.is_(None),
        )
        .order_by(desc(EmailVerificationCode.id))
    ).scalar_one_or_none()

    if verification_code is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_verification_code")

    now = datetime.now(timezone.utc)
    expires_at = ensure_aware_datetime(verification_code.expires_at)
    if expires_at < now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="verification_code_expired")

    user = find_user_by_email(db, normalized_email)
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="register_request_not_found")

    user.is_email_verified = True
    user.email_verified_at = now
    verification_code.verified_at = now
    db.commit()
    db.refresh(user)

    return build_token_response(user, settings)


def login_user(db: Session, email: str, password: str, settings: Settings) -> TokenResponse:
    """이메일과 비밀번호를 확인해 로그인 JWT 응답을 만든다."""
    user = find_user_by_email(db, email)
    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_email_or_password")

    if not user.is_email_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="email_not_verified")

    return build_token_response(user, settings)


def build_token_response(user: User, settings: Settings) -> TokenResponse:
    """인증 완료 응답에서 공통으로 쓰는 access token JSON을 만든다."""
    try:
        access_token = create_access_token(user.id, settings)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(error)) from error

    return TokenResponse(access_token=access_token, user=TokenUser.model_validate(user))


def ensure_aware_datetime(value: datetime) -> datetime:
    """테스트 DB처럼 timezone 정보가 빠진 datetime도 UTC 기준으로 비교하게 맞춘다."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value
