from __future__ import annotations

from typing import Any

import jwt
from cryptography.fernet import Fernet
from pwdlib import PasswordHash

from backend.app.core.config import Settings

JWT_ALGORITHM = "HS256"

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    """회원 비밀번호를 DB에 저장하기 전 안전한 해시 문자열로 바꾼다."""
    return password_hash.hash(password)


def verify_password(password: str, password_hash_value: str) -> bool:
    """로그인 요청 비밀번호가 저장된 해시와 맞는지 확인한다."""
    return password_hash.verify(password, password_hash_value)


def create_access_token(user_id: int, settings: Settings) -> str:
    """사용자 id를 담은 JWT access token을 만든다."""
    if not settings.jwt_secret:
        raise ValueError("JWT_SECRET is not configured")

    payload: dict[str, Any] = {"sub": str(user_id), "token_type": "access"}
    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str, settings: Settings) -> int:
    """Bearer token을 검증하고 payload 안의 사용자 id를 꺼낸다."""
    if not settings.jwt_secret:
        raise ValueError("JWT_SECRET is not configured")

    payload = jwt.decode(token, settings.jwt_secret, algorithms=[JWT_ALGORITHM])
    user_id = payload.get("sub")
    if not isinstance(user_id, str) or not user_id.isdigit():
        raise jwt.InvalidTokenError("Invalid subject")

    return int(user_id)


def build_api_key_fernet(settings: Settings) -> Fernet:
    """환경변수의 Fernet 키로 사용자 API Key 암복호화 객체를 준비한다."""
    if not settings.api_key_encryption_secret:
        raise ValueError("API_KEY_ENCRYPTION_SECRET is not configured")

    return Fernet(settings.api_key_encryption_secret.encode("utf-8"))


def encrypt_api_key(api_key: str, settings: Settings) -> str:
    """사용자 API Key 원문을 DB 저장용 암호문으로 바꾼다."""
    fernet = build_api_key_fernet(settings)
    return fernet.encrypt(api_key.encode("utf-8")).decode("utf-8")


def decrypt_api_key(encrypted_api_key: str, settings: Settings) -> str:
    """Agent/LLM 호출에서 사용할 수 있도록 사용자 API Key를 복호화한다."""
    fernet = build_api_key_fernet(settings)
    return fernet.decrypt(encrypted_api_key.encode("utf-8")).decode("utf-8")
