from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.comment import Comment
from app.models.post import Post
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.comment import CommentCreate, CommentRead

router = APIRouter(tags=["comments"])


@router.post(
    "/posts/{post_id}/comments",
    response_model=CommentRead,
    status_code=status.HTTP_201_CREATED,
)
def create_comment(
    post_id: int,
    comment_data: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    post = (
        db.query(Post)
        .filter(Post.id == post_id, Post.deleted_at.is_(None))
        .first()
    )

    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="게시글을 찾을 수 없습니다.",
        )

    if comment_data.parent_id is not None:
        parent_comment = (
            db.query(Comment)
            .filter(
                Comment.id == comment_data.parent_id,
                Comment.post_id == post_id,
                Comment.deleted_at.is_(None),
            )
            .first()
        )

        if not parent_comment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="부모 댓글을 찾을 수 없습니다.",
            )

    new_comment = Comment(
        post_id=post_id,
        author_id=current_user.id,
        parent_id=comment_data.parent_id,
        content=comment_data.content,
        is_anonymous=comment_data.is_anonymous,
    )

    db.add(new_comment)
    db.commit()
    db.refresh(new_comment)

    return new_comment


@router.get("/posts/{post_id}/comments", response_model=list[CommentRead])
def read_comments(post_id: int, db: Session = Depends(get_db)):
    post = (
        db.query(Post)
        .filter(Post.id == post_id, Post.deleted_at.is_(None))
        .first()
    )

    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="게시글을 찾을 수 없습니다.",
        )

    comments = (
        db.query(Comment)
        .filter(Comment.post_id == post_id, Comment.deleted_at.is_(None))
        .order_by(Comment.created_at.asc())
        .all()
    )

    return comments