from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.ai import (
    SimilarPostRequest,
    SimilarPostResponse,
    TagSuggestionRequest,
    TagSuggestionResponse,
)
from app.services.rag_service import find_similar_posts, suggest_tags

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/similar-posts", response_model=SimilarPostResponse)
@router.post("/rag/similar-posts", response_model=SimilarPostResponse)
def get_similar_posts(
    request_data: SimilarPostRequest,
    db: Session = Depends(get_db),
):
    items = find_similar_posts(
        db=db,
        title=request_data.title,
        content=request_data.content,
        tag_names=request_data.tag_names,
        limit=request_data.limit,
    )

    return {"items": items}


@router.post("/tag-suggestions", response_model=TagSuggestionResponse)
def get_tag_suggestions(
    request_data: TagSuggestionRequest,
    db: Session = Depends(get_db),
):
    items = suggest_tags(
        db=db,
        title=request_data.title,
        content=request_data.content,
        limit=request_data.limit,
    )

    return {"items": items}
