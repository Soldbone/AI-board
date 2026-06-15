from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.ai import (
    PlaceSearchRequest,
    PlaceSearchResponse,
    SimilarPostRequest,
    SimilarPostResponse,
    TagSuggestionRequest,
    TagSuggestionResponse,
)
from app.services.mcp_client_service import McpClientError, search_places_with_mcp
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
        store_name=request_data.store_name,
        tag_names=request_data.tag_names,
        limit=request_data.limit,
        exclude_post_id=request_data.exclude_post_id,
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


@router.post("/place-search", response_model=PlaceSearchResponse)
async def search_places(request_data: PlaceSearchRequest):
    try:
        return await search_places_with_mcp(
            region=request_data.region,
            keyword=request_data.keyword,
            display=request_data.display,
        )
    except McpClientError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
