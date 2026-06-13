from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models.board import Board
from app.models.comment import Comment
from app.models.enums import CommentStatus, PostStatus
from app.models.post import Post


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def get_public_post_by_id(db: Session, post_id: int) -> Post | None:
    statement = (
        select(Post)
        .join(Post.board)
        .where(
            Post.id == post_id,
            Post.status == PostStatus.PUBLISHED,
            Post.deleted_at.is_(None),
            Board.is_active.is_(True),
        )
    )
    return db.scalar(statement)


def list_public_comments(
    db: Session,
    *,
    post_id: int,
    page: int,
    size: int,
) -> list[Comment]:
    statement = (
        select(Comment)
        .options(joinedload(Comment.author))
        .where(*_public_comment_filters(post_id=post_id))
        .order_by(Comment.created_at.asc(), Comment.id.asc())
        .offset((page - 1) * size)
        .limit(size)
    )
    return list(db.scalars(statement).all())


def count_public_comments(db: Session, *, post_id: int) -> int:
    statement = (
        select(func.count())
        .select_from(Comment)
        .where(*_public_comment_filters(post_id=post_id))
    )
    return int(db.scalar(statement) or 0)


def list_my_comments(
    db: Session,
    *,
    author_id: int,
    page: int,
    size: int,
) -> list[Comment]:
    statement = (
        select(Comment)
        .join(Comment.post)
        .join(Post.board)
        .options(joinedload(Comment.post))
        .where(*_my_comment_filters(author_id=author_id))
        .order_by(Comment.created_at.desc(), Comment.id.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    return list(db.scalars(statement).all())


def count_my_comments(db: Session, *, author_id: int) -> int:
    statement = (
        select(func.count(Comment.id))
        .select_from(Comment)
        .join(Comment.post)
        .join(Post.board)
        .where(*_my_comment_filters(author_id=author_id))
    )
    return int(db.scalar(statement) or 0)


def create_comment(
    db: Session,
    *,
    post: Post,
    author_id: int,
    content: str,
) -> Comment:
    comment = Comment(
        post_id=post.id,
        author_id=author_id,
        content=content,
        status=CommentStatus.PUBLISHED,
    )
    db.add(comment)
    db.flush()
    return comment


def get_comment_for_write_action(db: Session, comment_id: int) -> Comment | None:
    statement = (
        select(Comment)
        .options(
            joinedload(Comment.author),
            joinedload(Comment.post).joinedload(Post.board),
        )
        .where(
            Comment.id == comment_id,
            Comment.status != CommentStatus.DELETED,
            Comment.deleted_at.is_(None),
        )
    )
    return db.scalar(statement)


def update_comment_content(comment: Comment, *, content: str) -> Comment:
    comment.content = content
    return comment


def soft_delete_comment(comment: Comment) -> None:
    comment.status = CommentStatus.DELETED
    comment.deleted_at = utc_now()


def increment_comment_count(post: Post) -> None:
    post.comment_count += 1


def decrement_comment_count(post: Post) -> None:
    post.comment_count = max(post.comment_count - 1, 0)


def _public_comment_filters(*, post_id: int) -> list[object]:
    return [
        Comment.post_id == post_id,
        Comment.status == CommentStatus.PUBLISHED,
        Comment.deleted_at.is_(None),
    ]


def _my_comment_filters(*, author_id: int) -> list[object]:
    return [
        Comment.author_id == author_id,
        Comment.status != CommentStatus.DELETED,
        Comment.deleted_at.is_(None),
        Post.status == PostStatus.PUBLISHED,
        Post.deleted_at.is_(None),
        Board.is_active.is_(True),
    ]
