from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

#  Python 코드와 PostgreSQL 사이의 연결 관리자
engine = create_engine(settings.database_url, pool_pre_ping=True)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)
