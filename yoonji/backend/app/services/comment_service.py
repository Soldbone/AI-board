from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.models.comment import Comment
from app.models.enums import PostStatus
from app.models.post import Post
from app.models.user import User
from app.repositories import comment_repository
from app.schemas.comment_schema import (
    CommentCreateRequest,
    CommentListResponse,
    CommentResponse,
    CommentUpdateRequest,
)
from app.schemas.user_schema import UserSummary


def list_comments(
    db: Session,
    *,
    post_id: int,
    page: int,
    size: int,
) -> CommentListResponse:
    _get_public_post(db, post_id=post_id)
    total = comment_repository.count_public_comments(db, post_id=post_id)
    comments = comment_repository.list_public_comments(
        db,
        post_id=post_id,
        page=page,
        size=size,
    )

    return CommentListResponse(
        items=[_build_comment_response(comment) for comment in comments],
        page=page,
        size=size,
        total=total,
        has_next=page * size < total,
    )


def create_comment(
    db: Session,
    *,
    post_id: int,
    payload: CommentCreateRequest,
    current_user: User,
) -> CommentResponse:
    post = _get_public_post(db, post_id=post_id)

    try:
        comment = comment_repository.create_comment(
            db,
            post=post,
            author_id=current_user.id,
            content=payload.content,
        )
        comment_repository.increment_comment_count(post)
        db.commit()
        db.refresh(comment)
        return _build_comment_response(comment)
    except Exception:
        db.rollback()
        raise


def update_comment(
    db: Session,
    *,
    comment_id: int,
    payload: CommentUpdateRequest,
    current_user: User,
) -> CommentResponse:
    comment = _get_mutable_comment(db, comment_id=comment_id)
    _ensure_comment_author(comment, current_user)

    try:
        comment_repository.update_comment_content(comment, content=payload.content)
        db.commit()
        db.refresh(comment)
        return _build_comment_response(comment)
    except Exception:
        db.rollback()
        raise


def delete_comment(
    db: Session,
    *,
    comment_id: int,
    current_user: User,
) -> None:
    comment = _get_mutable_comment(db, comment_id=comment_id)
    _ensure_comment_author(comment, current_user)

    try:
        comment_repository.soft_delete_comment(comment)
        comment_repository.decrement_comment_count(comment.post)
        db.commit()
    except Exception:
        db.rollback()
        raise


def _get_public_post(db: Session, *, post_id: int) -> Post:
    post = comment_repository.get_public_post_by_id(db, post_id)

    if post is None:
        raise AppException(
            "게시글을 찾을 수 없습니다.",
            code="POST_NOT_FOUND",
            status_code=404,
        )

    return post


def _get_mutable_comment(db: Session, *, comment_id: int) -> Comment:
    comment = comment_repository.get_comment_for_write_action(db, comment_id)

    if comment is None or not _is_comment_post_public(comment):
        raise AppException(
            "댓글을 찾을 수 없습니다.",
            code="COMMENT_NOT_FOUND",
            status_code=404,
        )

    return comment


def _is_comment_post_public(comment: Comment) -> bool:
    post = comment.post
    return (
        post.status == PostStatus.PUBLISHED
        and post.deleted_at is None
        and post.board.is_active
    )


def _ensure_comment_author(comment: Comment, current_user: User) -> None:
    if comment.author_id == current_user.id:
        return

    raise AppException(
        "작성자만 댓글을 수정하거나 삭제할 수 있습니다.",
        code="COMMENT_AUTHOR_REQUIRED",
        status_code=403,
    )


def _build_comment_response(comment: Comment) -> CommentResponse:
    return CommentResponse(
        id=comment.id,
        post_id=comment.post_id,
        author=UserSummary.model_validate(comment.author),
        content=comment.content,
        status=comment.status,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )
