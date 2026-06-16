from __future__ import annotations

from typing import Any

import httpx
from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.core.config import Settings
from backend.app.core.security import decrypt_api_key
from backend.app.models.post import Post
from backend.app.models.user import User
from backend.app.schemas.ai import RagRecommendationItem, RagRecommendResponse
from backend.app.services import llm
from backend.app.services.users import SUPPORTED_API_KEY_PROVIDER, find_user_api_key

OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"
EMBEDDING_DIMENSIONS = 1536
RAG_RECOMMENDATION_LIMIT = 3


def recommend_posts_by_title(db: Session, user: User, title: str, settings: Settings) -> RagRecommendResponse:
    """제목 기반 검색 결과를 LLM에 함께 넣어 RAG 미리확인 응답을 만든다."""
    cleaned_title = title.strip()
    if not cleaned_title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="title_required")

    api_key = get_user_openai_api_key(db, user, settings, required=True)
    items = retrieve_related_posts_with_api_key(db, api_key, cleaned_title, settings)
    feedback = create_rag_preview_feedback(api_key, settings, cleaned_title, items)
    return RagRecommendResponse(items=items, **feedback)


def retrieve_related_posts_by_title(db: Session, user: User, title: str, settings: Settings) -> list[RagRecommendationItem]:
    """Agent 도구에서 재사용할 수 있게 LLM 생성 없이 관련 글만 검색한다."""
    cleaned_title = title.strip()
    if not cleaned_title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="title_required")

    api_key = get_user_openai_api_key(db, user, settings, required=True)
    return retrieve_related_posts_with_api_key(db, api_key, cleaned_title, settings)


def retrieve_related_posts_with_api_key(
    db: Session,
    api_key: str,
    title: str,
    settings: Settings,
) -> list[RagRecommendationItem]:
    """현재 사용자 제목 embedding과 저장된 게시글 embedding만 비교한다."""
    embedding = create_openai_embedding(api_key, settings.embedding_model, title)
    return find_similar_posts(db, embedding, RAG_RECOMMENDATION_LIMIT)


def create_rag_preview_feedback(
    api_key: str,
    settings: Settings,
    title: str,
    items: list[RagRecommendationItem],
) -> dict[str, str]:
    """검색된 게시글을 근거로 LLM이 중복 가능성과 개선 방향을 생성한다."""
    context = {
        "title": title,
        "related_posts": [item.model_dump() for item in items],
        "instruction": "관련 글이 없으면 새 아이디어로 보인다고 말하고, 그래도 제목을 구체화할 방법을 제안한다.",
    }
    return llm.create_rag_preview_with_openai(api_key, settings, context)


def get_user_openai_api_key(db: Session, user: User, settings: Settings, required: bool) -> str | None:
    """등록된 OpenAI API Key 암호문을 찾아 필요한 경우 복호화한다."""
    saved_api_key = find_user_api_key(db, user, SUPPORTED_API_KEY_PROVIDER)
    if saved_api_key is None:
        if required:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="openai_api_key_required")
        return None

    try:
        return decrypt_api_key(saved_api_key.encrypted_api_key, settings)
    except ValueError as error:
        if required:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(error)) from error
        return None


def delete_post_embedding(db: Session, post_id: int) -> None:
    """오래되었거나 더 이상 사용할 수 없는 게시글 embedding을 삭제한다."""
    db.execute(text("DELETE FROM post_embeddings WHERE post_id = :post_id"), {"post_id": post_id})


def refresh_post_embedding_from_author_key(db: Session, user: User, post: Post, settings: Settings) -> bool:
    """작성자 OpenAI API Key가 있을 때만 해당 게시글 embedding을 생성해 저장한다."""
    api_key = get_user_openai_api_key(db, user, settings, required=False)
    if api_key is None:
        return False

    try:
        embedding = create_openai_embedding(api_key, settings.embedding_model, build_post_embedding_text(post))
    except HTTPException:
        return False

    upsert_post_embedding(db, post.id, embedding, settings.embedding_model)
    return True


def build_post_embedding_text(post: Post) -> str:
    """게시글의 검색 대상 필드를 사람이 읽는 순서로 묶어 embedding 입력을 만든다."""
    tag_names = [tag_link.tag.name for tag_link in sorted(post.tag_links, key=lambda item: item.tag.name)]
    parts = [
        ("제목", post.title),
        ("본문", post.content),
        ("장르", post.genre),
        ("핵심 재미", post.core_fun),
        ("플랫폼", post.platform),
        ("난이도", post.difficulty),
        ("원본 URL", post.source_url),
        ("태그", ", ".join(tag_names) if tag_names else None),
    ]
    return "\n".join(f"{label}: {value}" for label, value in parts if value)


def create_openai_embedding(api_key: str, model_name: str, input_text: str) -> list[float]:
    """OpenAI Embeddings API를 호출해 검색용 벡터를 만든다."""
    return create_openai_embeddings(api_key, model_name, [input_text])[0]


def create_openai_embeddings(api_key: str, model_name: str, input_texts: list[str]) -> list[list[float]]:
    """여러 텍스트를 한 번의 OpenAI Embeddings 요청으로 벡터화한다."""
    if not model_name:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="embedding_model_not_configured")
    if not input_texts:
        return []

    try:
        response = httpx.post(
            OPENAI_EMBEDDINGS_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": model_name, "input": input_texts},
            timeout=30.0,
        )
    except httpx.HTTPError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="openai_embedding_request_failed",
        ) from error

    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="openai_embedding_request_failed",
        )

    try:
        data: dict[str, Any] = response.json()
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="openai_embedding_response_invalid") from error

    raw_embeddings = data.get("data")
    if not isinstance(raw_embeddings, list) or len(raw_embeddings) != len(input_texts):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="openai_embedding_response_invalid")

    embeddings: list[list[float]] = []
    for raw_item in sorted(
        raw_embeddings,
        key=lambda item: item.get("index", 0) if isinstance(item, dict) else 0,
    ):
        embedding = raw_item.get("embedding") if isinstance(raw_item, dict) else None
        if not isinstance(embedding, list):
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="openai_embedding_response_invalid")

        float_embedding = [float(value) for value in embedding]
        if len(float_embedding) != EMBEDDING_DIMENSIONS:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="openai_embedding_dimension_invalid")

        embeddings.append(float_embedding)

    return embeddings


def upsert_post_embedding(db: Session, post_id: int, embedding: list[float], model_name: str) -> None:
    """게시글당 하나의 embedding 레코드를 생성하거나 최신 값으로 교체한다."""
    db.execute(
        text(
            """
            INSERT INTO post_embeddings (post_id, embedding, embedding_model)
            VALUES (:post_id, CAST(:embedding AS vector), :embedding_model)
            ON CONFLICT (post_id)
            DO UPDATE SET
                embedding = EXCLUDED.embedding,
                embedding_model = EXCLUDED.embedding_model,
                created_at = now()
            """
        ),
        {
            "post_id": post_id,
            "embedding": format_pgvector_literal(embedding),
            "embedding_model": model_name,
        },
    )


def find_similar_posts(db: Session, embedding: list[float], limit: int) -> list[RagRecommendationItem]:
    """pgvector cosine distance가 가까운 게시글을 추천 응답으로 바꾼다."""
    rows = db.execute(
        text(
            """
            SELECT
                posts.id,
                posts.board_type,
                posts.title,
                1 - (post_embeddings.embedding <=> CAST(:embedding AS vector)) AS similarity
            FROM post_embeddings
            JOIN posts ON posts.id = post_embeddings.post_id
            WHERE posts.deleted_at IS NULL
            ORDER BY post_embeddings.embedding <=> CAST(:embedding AS vector)
            LIMIT :limit
            """
        ),
        {
            "embedding": format_pgvector_literal(embedding),
            "limit": limit,
        },
    ).mappings()

    return [
        RagRecommendationItem(
            id=int(row["id"]),
            board_type=row["board_type"],
            title=row["title"],
            similarity=round(float(row["similarity"]), 4),
        )
        for row in rows
    ]


def format_pgvector_literal(embedding: list[float]) -> str:
    """pgvector가 받을 수 있는 '[0.1,0.2]' 문자열로 벡터를 직렬화한다."""
    return "[" + ",".join(str(float(value)) for value in embedding) + "]"
