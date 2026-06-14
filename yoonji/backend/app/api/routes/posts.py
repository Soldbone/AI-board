from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Path, Query, status

from app.api.deps import CurrentUser, DbSession
from app.ai.rag import indexing_service
from app.ai.usecases import similar_posts
from app.models.enums import BoardCode
from app.schemas.ai_schema import (
    AiOutputResponse,
    ReferenceAnswerRequest,
    SimilarPostListResponse,
)
from app.schemas.post_schema import (
    PostCreateRequest,
    PostCreateResponse,
    PostDetailResponse,
    PostListResponse,
    PostUpdateRequest,
)
from app.services import post_service
from app.services import ai_service


router = APIRouter(prefix="/posts", tags=["posts"])


@router.get("", response_model=PostListResponse)
def list_posts(
    db: DbSession,
    board_code: BoardCode | None = Query(default=None),
    q: str | None = Query(default=None, max_length=100),
    tag: str | None = Query(default=None, max_length=100),
    sort: Literal["latest", "relevance", "views", "satisfaction", "comments"] = Query(
        default="latest"
    ),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=50),
) -> PostListResponse:
    return post_service.list_posts(
        db,
        board_code=board_code,
        q=q,
        tag=tag,
        sort=sort,
        page=page,
        size=size,
    )


@router.post(
    "",
    response_model=PostCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_post(
    payload: PostCreateRequest,
    db: DbSession,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
) -> PostCreateResponse:
    response = post_service.create_post(
        db,
        payload=payload,
        current_user=current_user,
    )
    indexing_service.schedule_post_indexing(
        background_tasks,
        post_id=response.id,
    )
    return response


@router.get("/{post_id}/similar-posts", response_model=SimilarPostListResponse)
def get_similar_posts(
    post_id: Annotated[int, Path(gt=0)],
    db: DbSession,
    limit: int = Query(default=3, ge=1, le=10),
) -> SimilarPostListResponse:
    return similar_posts.get_similar_review_posts(
        db,
        post_id=post_id,
        limit=limit,
    )


@router.post(
    "/{post_id}/ai/reference-answer",
    response_model=AiOutputResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def request_question_reference_answer(
    post_id: Annotated[int, Path(gt=0)],
    payload: ReferenceAnswerRequest,
    db: DbSession,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
) -> AiOutputResponse:
    return ai_service.request_question_reference_answer(
        db,
        post_id=post_id,
        payload=payload,
        current_user=current_user,
        background_tasks=background_tasks,
    )


@router.get("/{post_id}", response_model=PostDetailResponse)
def get_post(
    post_id: Annotated[int, Path(gt=0)],
    db: DbSession,
) -> PostDetailResponse:
    return post_service.get_post(db, post_id=post_id)


@router.patch("/{post_id}", response_model=PostDetailResponse)
def update_post(
    post_id: Annotated[int, Path(gt=0)],
    payload: PostUpdateRequest,
    db: DbSession,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
) -> PostDetailResponse:
    response = post_service.update_post(
        db,
        post_id=post_id,
        payload=payload,
        current_user=current_user,
    )
    indexing_service.schedule_post_indexing(
        background_tasks,
        post_id=post_id,
    )
    return response


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(
    post_id: Annotated[int, Path(gt=0)],
    db: DbSession,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
) -> None:
    post_service.delete_post(
        db,
        post_id=post_id,
        current_user=current_user,
    )
    indexing_service.schedule_post_index_deletion(
        background_tasks,
        post_id=post_id,
    )
