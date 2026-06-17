from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.app.api.dependencies import get_current_user
from backend.app.db.session import get_db
from backend.app.models.user import User
from backend.app.schemas.posts import TagCreateRequest, TagRead
from backend.app.services import posts as post_service

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=list[TagRead])
def list_tags(search: str | None = Query(default=None), db: Session = Depends(get_db)) -> list[TagRead]:
    """이미 등록된 태그 목록을 이름순으로 조회한다."""
    return post_service.list_tags(db, search)


@router.post("", response_model=TagRead)
def create_tag(
    payload: TagCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TagRead:
    """로그인한 사용자가 새 태그 이름을 등록하거나 기존 태그를 재사용한다."""
    return post_service.create_tag(db, payload.name)
