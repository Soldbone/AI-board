from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.models.enums import UserStatus
from app.models.user import User
from app.repositories import user_repository
from app.schemas.user_schema import UserResponse


def get_me(db: Session, *, user_id: int) -> UserResponse:
    user = user_repository.get_user_by_id(db, user_id)

    if user is None:
        raise AppException(
            "사용자를 찾을 수 없습니다.",
            code="USER_NOT_FOUND",
            status_code=404,
        )

    _ensure_active_user(user)
    return UserResponse.model_validate(user)


def _ensure_active_user(user: User) -> None:
    if user.status != UserStatus.ACTIVE:
        raise AppException(
            "활성 상태가 아닌 계정입니다.",
            code="USER_NOT_ACTIVE",
            status_code=403,
        )
