from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import DATABASE_URL

engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_db_connection():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))


def enable_pgvector_extension():
    with engine.begin() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))


def check_pgvector_extension():
    with engine.connect() as connection:
        result = connection.execute(
            text("SELECT extversion FROM pg_extension WHERE extname = 'vector'")
        )

        return result.scalar_one_or_none()
