from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.app.api.dependencies import get_current_user
from backend.app.db.session import get_db
from backend.app.models.user import User
from backend.app.schemas.common import MessageResponse, PageResponse, PaginationParams
from backend.app.schemas.posts import PostCreateRequest, PostListItem, PostRead, PostUpdateRequest
from backend.app.services import posts as post_service

router = APIRouter(prefix="/posts", tags=["posts"])


@router.get("", response_model=PageResponse[PostListItem])
def list_posts(
    board_type: str | None = Query(default=None),
    search: str | None = Query(default=None),
    pagination: PaginationParams = Depends(),
    db: Session = Depends(get_db),
) -> PageResponse[PostListItem]:
    """게시판별 게시글 목록을 검색어와 페이지 조건으로 조회한다."""
    return post_service.list_posts(db, board_type, search, pagination.page, pagination.page_size)


@router.post("", response_model=PostRead)
def create_post(
    payload: PostCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PostRead:
    """로그인한 사용자의 아이디어/리뷰 게시글을 생성한다."""
    return post_service.create_post(db, current_user, payload)


@router.get("/{post_id}", response_model=PostRead)
def read_post(post_id: int, db: Session = Depends(get_db)) -> PostRead:
    """게시글 본문, 태그, 미디어, 댓글을 상세 화면용으로 조회한다."""
    return post_service.get_post_detail(db, post_id)


@router.patch("/{post_id}", response_model=PostRead)
def update_post(
    post_id: int,
    payload: PostUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PostRead:
    """작성자만 게시글 내용과 태그/미디어를 수정한다."""
    return post_service.update_post(db, post_id, current_user, payload)


@router.delete("/{post_id}", response_model=MessageResponse)
def delete_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    """작성자만 게시글을 삭제 처리한다."""
    post_service.delete_post(db, post_id, current_user)
    return MessageResponse(message="post_deleted")
