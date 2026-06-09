from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.post import Post
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.post import PostCreate, PostListItem, PostRead

router = APIRouter(prefix="/posts", tags=["posts"])


@router.post("", response_model=PostRead, status_code=status.HTTP_201_CREATED)
def create_post(
    post_data: PostCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    new_post = Post(
        author_id=current_user.id,
        title=post_data.title,
        content=post_data.content,
        region=post_data.region,
        store_name=post_data.store_name,
        category=post_data.category,
    )

    db.add(new_post)
    db.commit()
    db.refresh(new_post)

    return new_post


@router.get("", response_model=list[PostListItem])
def read_posts(db: Session = Depends(get_db)):
    posts = (
        db.query(Post)
        .filter(Post.deleted_at.is_(None))
        .order_by(Post.created_at.desc())
        .all()
    )

    return posts