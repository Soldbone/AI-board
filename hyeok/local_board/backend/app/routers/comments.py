from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.comment import Comment
from app.models.post import Post
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.comment import CommentCreate, CommentRead, CommentUpdate

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


@router.patch("/comments/{comment_id}", response_model=CommentRead)
def update_comment(
    comment_id: int,
    comment_data: CommentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    comment = (
        db.query(Comment)
        .filter(Comment.id == comment_id, Comment.deleted_at.is_(None))
        .first()
    )

    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="댓글을 찾을 수 없습니다.",
        )

    if comment.author_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="댓글을 수정할 권한이 없습니다.",
        )

    comment.content = comment_data.content

    db.commit()
    db.refresh(comment)

    return comment


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    comment = (
        db.query(Comment)
        .filter(Comment.id == comment_id, Comment.deleted_at.is_(None))
        .first()
    )

    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="댓글을 찾을 수 없습니다.",
        )

    if comment.author_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="댓글을 삭제할 권한이 없습니다.",
        )

    comment.deleted_at = datetime.utcnow()

    db.commit()

    return None