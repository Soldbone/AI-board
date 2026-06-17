from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.post import Post
from app.models.tag import Tag, post_tags
from app.schemas.tag import TagRead, TagSuggestionRead

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=list[TagRead])
def read_tags(db: Session = Depends(get_db)):
    tags = db.query(Tag).order_by(Tag.name.asc()).all()

    return tags


@router.get("/suggestions", response_model=list[TagSuggestionRead])
def read_tag_suggestions(limit: int = 10, db: Session = Depends(get_db)):
    normalized_limit = min(max(limit, 1), 10)

    tag_rows = (
        db.query(
            Tag.id,
            Tag.name,
            func.count(post_tags.c.post_id).label("post_count"),
        )
        .join(post_tags, Tag.id == post_tags.c.tag_id)
        .join(Post, Post.id == post_tags.c.post_id)
        .filter(Post.deleted_at.is_(None))
        .group_by(Tag.id, Tag.name)
        .order_by(func.count(post_tags.c.post_id).desc(), Tag.name.asc())
        .limit(normalized_limit)
        .all()
    )

    return [
        {
            "id": tag_id,
            "name": name,
            "count": post_count,
        }
        for tag_id, name, post_count in tag_rows
    ]
