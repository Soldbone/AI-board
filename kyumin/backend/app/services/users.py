from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.config import Settings
from backend.app.core.security import encrypt_api_key
from backend.app.models.user import User, UserApiKey
from backend.app.schemas.users import ApiKeyStatusResponse

SUPPORTED_API_KEY_PROVIDER = "openai"


def update_nickname(db: Session, user: User, nickname: str | None) -> User:
    """이메일은 그대로 두고 사용자 닉네임만 수정한다."""
    if nickname is None:
        user.nickname = None
    else:
        cleaned_nickname = nickname.strip()
        user.nickname = cleaned_nickname or None

    db.commit()
    db.refresh(user)
    return user


def delete_account(db: Session, user: User) -> None:
    """회원 탈퇴 시 사용자와 연결된 작성 기록을 cascade 삭제한다."""
    db.delete(user)
    db.commit()


def get_api_key_status(db: Session, user: User, provider: str = SUPPORTED_API_KEY_PROVIDER) -> ApiKeyStatusResponse:
    """API Key 원문 없이 등록 여부와 마지막 4자리만 조회한다."""
    normalized_provider = normalize_provider(provider)
    api_key = find_user_api_key(db, user, normalized_provider)
    if api_key is None:
        return ApiKeyStatusResponse(provider=normalized_provider, has_api_key=False, api_key_last4=None)

    return ApiKeyStatusResponse(
        provider=normalized_provider,
        has_api_key=True,
        api_key_last4=api_key.api_key_last4,
    )


def save_api_key(db: Session, user: User, provider: str, api_key: str, settings: Settings) -> ApiKeyStatusResponse:
    """사용자 API Key를 Fernet으로 암호화해 등록하거나 수정한다."""
    normalized_provider = normalize_provider(provider)
    try:
        encrypted_api_key = encrypt_api_key(api_key, settings)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(error)) from error

    saved_api_key = find_user_api_key(db, user, normalized_provider)
    if saved_api_key is None:
        saved_api_key = UserApiKey(
            user_id=user.id,
            provider=normalized_provider,
            encrypted_api_key=encrypted_api_key,
            api_key_last4=api_key[-4:],
        )
        db.add(saved_api_key)
    else:
        saved_api_key.encrypted_api_key = encrypted_api_key
        saved_api_key.api_key_last4 = api_key[-4:]

    db.commit()
    db.refresh(saved_api_key)
    return get_api_key_status(db, user, normalized_provider)


def delete_api_key(db: Session, user: User, provider: str = SUPPORTED_API_KEY_PROVIDER) -> ApiKeyStatusResponse:
    """등록된 API Key 암호문을 삭제하고 미등록 상태를 반환한다."""
    normalized_provider = normalize_provider(provider)
    api_key = find_user_api_key(db, user, normalized_provider)
    if api_key is not None:
        db.delete(api_key)
        db.commit()

    return ApiKeyStatusResponse(provider=normalized_provider, has_api_key=False, api_key_last4=None)


def find_user_api_key(db: Session, user: User, provider: str) -> UserApiKey | None:
    """사용자와 provider 조합에 맞는 API Key 레코드를 찾는다."""
    return db.execute(
        select(UserApiKey).where(
            UserApiKey.user_id == user.id,
            UserApiKey.provider == provider,
        )
    ).scalar_one_or_none()


def normalize_provider(provider: str) -> str:
    """MVP에서 지원하는 API Key provider 값을 검증한다."""
    normalized_provider = provider.strip().lower()
    if normalized_provider != SUPPORTED_API_KEY_PROVIDER:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unsupported_api_key_provider")

    return normalized_provider
