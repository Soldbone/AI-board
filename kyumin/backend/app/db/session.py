from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from backend.app.core.config import get_settings


class Base(DeclarativeBase):
    """모든 SQLAlchemy 모델이 상속할 기본 클래스다."""

    pass


settings = get_settings()

# PostgreSQL 연결 엔진과 요청 단위 DB 세션 생성기를 준비한다.
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db() -> Generator[Session, None, None]:
    """FastAPI 의존성으로 사용할 DB 세션을 열고 요청 종료 시 닫는다."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
