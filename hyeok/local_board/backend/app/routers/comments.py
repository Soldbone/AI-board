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
DELETED_COMMENT_CONTENT = "삭제된 댓글입니다."


def build_comment_response(comment: Comment, author: User) -> dict:
    is_deleted = comment.deleted_at is not None

    if is_deleted:
        author_id = None
        author_nickname = ""
        content = DELETED_COMMENT_CONTENT
    elif comment.is_anonymous:
        author_id = None
        author_nickname = "익명"
        content = comment.content
    else:
        author_id = comment.author_id
        author_nickname = author.nickname
        content = comment.content

    return {
        "id": comment.id,
        "post_id": comment.post_id,
        "author_id": author_id,
        "author_nickname": author_nickname,
        "parent_id": comment.parent_id,
        "content": content,
        "is_anonymous": comment.is_anonymous,
        "is_deleted": is_deleted,
        "created_at": comment.created_at,
        "updated_at": comment.updated_at,
    }


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
        
        if parent_comment.parent_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="대댓글에는 답글을 달 수 없습니다."
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

    return build_comment_response(new_comment, current_user)


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

    comment_rows = (
        db.query(Comment, User)
        .join(User, Comment.author_id == User.id)
        .filter(Comment.post_id == post_id)
        .order_by(Comment.created_at.asc())
        .all()
    )

    comment_items = [
        build_comment_response(comment, author)
        for comment, author in comment_rows
    ]

    parent_comments = [
        comment
        for comment in comment_items
        if comment["parent_id"] is None
    ]

    reply_comments = [
        comment
        for comment in comment_items
        if comment["parent_id"] is not None
    ]

    replies_by_parent_id = {}

    for reply in reply_comments:
        parent_id = reply["parent_id"]

        if parent_id not in replies_by_parent_id:
            replies_by_parent_id[parent_id] = []

        replies_by_parent_id[parent_id].append(reply)

    ordered_comments = []

    for parent in parent_comments:
        ordered_comments.append(parent)
        ordered_comments.extend(replies_by_parent_id.get(parent["id"], []))

    parent_ids = {parent["id"] for parent in parent_comments}

    orphan_replies = [
        reply
        for reply in reply_comments
        if reply["parent_id"] not in parent_ids
    ]

    ordered_comments.extend(orphan_replies)

    return ordered_comments


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

    return build_comment_response(comment, current_user)


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

    comment.content = DELETED_COMMENT_CONTENT
    comment.is_anonymous = True
    comment.deleted_at = datetime.utcnow()

    db.commit()

    return None
