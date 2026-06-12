from __future__ import annotations

from typing import Any

import httpx
from fastapi import HTTPException, status
from sqlalchemy import or_, select, text
from sqlalchemy.orm import Session, selectinload

from backend.app.core.config import Settings
from backend.app.core.security import decrypt_api_key
from backend.app.models.post import Post, PostTag, Tag
from backend.app.models.user import User
from backend.app.schemas.ai import RagRecommendationItem, RagRecommendResponse
from backend.app.services.users import SUPPORTED_API_KEY_PROVIDER, find_user_api_key

OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"
EMBEDDING_DIMENSIONS = 1536
RAG_RECOMMENDATION_LIMIT = 3
RAG_BACKFILL_CANDIDATE_LIMIT = 20


def recommend_posts_by_title(db: Session, user: User, title: str, settings: Settings) -> RagRecommendResponse:
    """제목 embedding과 후보 게시글 embedding을 비교해 관련 게시글 3개를 추천한다."""
    cleaned_title = title.strip()
    if not cleaned_title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="title_required")

    api_key = get_user_openai_api_key(db, user, settings, required=True)
    embedding = create_openai_embedding(api_key, settings.embedding_model, cleaned_title)
    backfill_missing_candidate_embeddings(db, api_key, cleaned_title, settings)
    items = find_similar_posts(db, embedding, RAG_RECOMMENDATION_LIMIT)
    return RagRecommendResponse(items=items)


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
    """게시글 수정 뒤 오래된 embedding이 검색에 쓰이지 않도록 삭제한다."""
    db.execute(text("DELETE FROM post_embeddings WHERE post_id = :post_id"), {"post_id": post_id})


def backfill_missing_candidate_embeddings(
    db: Session,
    api_key: str,
    title: str,
    settings: Settings,
) -> None:
    """제목 검색어로 좁힌 후보 중 embedding이 없는 게시글만 현재 사용자 Key로 채운다."""
    candidate_posts = find_backfill_candidate_posts(db, title, RAG_BACKFILL_CANDIDATE_LIMIT)
    if not candidate_posts:
        return

    embedding_texts = [build_post_embedding_text(post) for post in candidate_posts]
    embeddings = create_openai_embeddings(api_key, settings.embedding_model, embedding_texts)

    for post, embedding in zip(candidate_posts, embeddings):
        upsert_post_embedding(db, post.id, embedding, settings.embedding_model)

    db.commit()


def find_backfill_candidate_posts(db: Session, title: str, limit: int) -> list[Post]:
    """SQL 검색으로 먼저 좁힌 기존 게시글 중 embedding이 없는 후보만 조회한다."""
    filters = [Post.deleted_at.is_(None), ~Post.embeddings.any()]
    search_filter = build_candidate_search_filter(title)
    if search_filter is not None:
        filters.append(search_filter)

    return db.execute(
        select(Post)
        .where(*filters)
        .options(selectinload(Post.tag_links).selectinload(PostTag.tag))
        .order_by(Post.created_at.desc(), Post.id.desc())
        .limit(limit)
    ).scalars().all()


def build_candidate_search_filter(title: str) -> object | None:
    """새 제목에서 뽑은 검색어를 기존 게시글 필드/태그 검색 조건으로 바꾼다."""
    terms = extract_search_terms(title)
    if not terms:
        return None

    field_filters = []
    for term in terms:
        pattern = f"%{term}%"
        field_filters.extend(
            [
                Post.title.ilike(pattern),
                Post.content.ilike(pattern),
                Post.genre.ilike(pattern),
                Post.core_fun.ilike(pattern),
                Post.platform.ilike(pattern),
                Post.source_url.ilike(pattern),
                Post.tag_links.any(PostTag.tag.has(Tag.name.ilike(pattern))),
            ]
        )

    return or_(*field_filters)


def extract_search_terms(title: str) -> list[str]:
    """제목 전체와 공백 단어를 후보 게시글 SQL 검색어로 사용한다."""
    cleaned_title = title.strip()
    if not cleaned_title:
        return []

    terms: list[str] = [cleaned_title]
    for word in cleaned_title.split():
        cleaned_word = word.strip()
        if len(cleaned_word) >= 2 and cleaned_word not in terms:
            terms.append(cleaned_word)

    return terms[:6]


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
