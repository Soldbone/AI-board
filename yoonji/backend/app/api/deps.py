from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.enums import UserStatus
from app.models.user import User
from app.repositories import user_repository


DbSession = Annotated[Session, Depends(get_db)]

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: DbSession,
) -> User:
    if credentials is None:
        raise AppException(
            "인증이 필요합니다.",
            code="AUTHENTICATION_REQUIRED",
            status_code=401,
        )

    user_id = decode_access_token(credentials.credentials)

    if user_id is None:
        raise AppException(
            "유효하지 않은 access token입니다.",
            code="INVALID_ACCESS_TOKEN",
            status_code=401,
        )

    user = user_repository.get_user_by_id(db, user_id)

    if user is None:
        raise AppException(
            "사용자를 찾을 수 없습니다.",
            code="USER_NOT_FOUND",
            status_code=401,
        )

    if user.status != UserStatus.ACTIVE:
        raise AppException(
            "활성 상태가 아닌 계정입니다.",
            code="USER_NOT_ACTIVE",
            status_code=403,
        )

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
