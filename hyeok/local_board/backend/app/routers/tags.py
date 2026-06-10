from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.tag import Tag
from app.schemas.tag import TagRead

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=list[TagRead])
def read_tags(db: Session = Depends(get_db)):
    tags = db.query(Tag).order_by(Tag.name.asc()).all()

    return tags