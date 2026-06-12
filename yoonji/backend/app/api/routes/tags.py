from fastapi import APIRouter, Query, status

from app.api.deps import CurrentUser, DbSession
from app.models.enums import TagType
from app.schemas.tag_schema import TagListResponse, TagRequest, TagResponse
from app.services import tag_service


router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=TagListResponse)
def list_tags(
    db: DbSession,
    q: str | None = Query(default=None, max_length=100),
    type: TagType | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
) -> TagListResponse:
    return tag_service.list_tags(
        db,
        q=q,
        tag_type=type,
        limit=limit,
    )


@router.post(
    "",
    response_model=TagResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_tag(
    payload: TagRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> TagResponse:
    return tag_service.create_tag(db, payload=payload)
