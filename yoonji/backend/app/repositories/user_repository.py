from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.auth_session import AuthSession
from app.models.user import User


def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def get_user_by_email(db: Session, email: str) -> User | None:
    statement = select(User).where(User.email == email)
    return db.scalar(statement)


def get_user_by_login_id(db: Session, login_id: str) -> User | None:
    statement = select(User).where(User.login_id == login_id)
    return db.scalar(statement)


def create_user(
    db: Session,
    *,
    login_id: str,
    password_hash: str,
    nickname: str,
    email: str | None = None,
) -> User:
    user = User(
        email=email,
        login_id=login_id,
        password_hash=password_hash,
        nickname=nickname,
    )
    db.add(user)
    return user


def create_auth_session(
    db: Session,
    *,
    user_id: int,
    refresh_token_hash: str,
    expires_at: datetime,
) -> AuthSession:
    auth_session = AuthSession(
        user_id=user_id,
        refresh_token_hash=refresh_token_hash,
        expires_at=expires_at,
    )
    db.add(auth_session)
    return auth_session


def get_active_auth_session_by_hash(
    db: Session,
    *,
    refresh_token_hash: str,
    now: datetime,
) -> AuthSession | None:
    statement = (
        select(AuthSession)
        .options(joinedload(AuthSession.user))
        .where(
            AuthSession.refresh_token_hash == refresh_token_hash,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > now,
        )
    )
    return db.scalar(statement)


def revoke_auth_session(auth_session: AuthSession, *, revoked_at: datetime) -> None:
    auth_session.revoked_at = revoked_at
