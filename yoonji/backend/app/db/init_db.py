from app.db.base import Base
from app.db.database import engine
import app.models


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
