from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.api.dependencies import get_current_user
from backend.app.db.session import get_db
from backend.app.models.user import User
from backend.app.schemas.common import MessageResponse
from backend.app.schemas.posts import CommentCreateRequest, CommentRead, CommentUpdateRequest
from backend.app.services import posts as post_service

router = APIRouter(tags=["comments"])


@router.post("/posts/{post_id}/comments", response_model=CommentRead)
def create_comment(
    post_id: int,
    payload: CommentCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommentRead:
    """로그인한 사용자가 게시글에 일반 댓글이나 별점 리뷰를 남긴다."""
    return post_service.create_comment(db, post_id, current_user, payload)


@router.patch("/comments/{comment_id}", response_model=CommentRead)
def update_comment(
    comment_id: int,
    payload: CommentUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommentRead:
    """작성자만 댓글 본문과 리뷰 필드를 수정한다."""
    return post_service.update_comment(db, comment_id, current_user, payload)


@router.delete("/comments/{comment_id}", response_model=MessageResponse)
def delete_comment(
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    """작성자만 댓글을 삭제 처리한다."""
    post_service.delete_comment(db, comment_id, current_user)
    return MessageResponse(message="comment_deleted")
