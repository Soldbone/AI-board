from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.ai.rag import document_loader
from app.ai.rag.embedding_client import EmbeddingClientError, get_embedding_client
from app.ai.rag.vector_store import VectorStoreError, get_vector_store
from app.core.config import settings
from app.core.exceptions import AppException
from app.models.enums import BoardCode, ContentSourceType
from app.models.post import Post


@dataclass
class SimilarPostCandidate:
    post_id: int
    score: float
    chunk_id: int
    metadata: dict[str, Any]


@dataclass
class RetrievedChunk:
    chunk_id: int
    post_id: int | None
    comment_id: int | None
    chunk_text: str
    score: float
    metadata: dict[str, Any]


def retrieve_similar_review_posts(
    db: Session,
    *,
    post: Post,
    limit: int,
) -> list[SimilarPostCandidate]:
    document = document_loader.build_post_document(post)

    if document is None or post.board.code != BoardCode.REVIEW:
        return []

    query_vector = _embed_query(document.page_content)

    try:
        search_results = get_vector_store().similarity_search(
            db,
            query_vector=query_vector,
            board_code=BoardCode.REVIEW,
            source_types=[ContentSourceType.POST],
            limit=max(limit * 8, limit),
            exclude_post_id=post.id,
        )
    except VectorStoreError as exc:
        raise AppException(
            "Vector store search failed.",
            code="VECTOR_STORE_SEARCH_FAILED",
            status_code=500,
        ) from exc

    candidates_by_post_id: dict[int, SimilarPostCandidate] = {}

    for result in search_results:
        chunk = result.chunk

        if chunk.post_id is None or chunk.post_id == post.id:
            continue

        score = max(result.score, 0.0)

        if score <= 0:
            continue

        current = candidates_by_post_id.get(chunk.post_id)
        if current is None or score > current.score:
            candidates_by_post_id[chunk.post_id] = SimilarPostCandidate(
                post_id=chunk.post_id,
                score=score,
                chunk_id=chunk.id,
                metadata=chunk.metadata_json or {},
            )

    return sorted(
        candidates_by_post_id.values(),
        key=lambda candidate: candidate.score,
        reverse=True,
    )[:limit]


def retrieve_question_reference_chunks(
    db: Session,
    *,
    post: Post,
    top_k: int,
) -> list[RetrievedChunk]:
    document = document_loader.build_post_document(post)

    if document is None or post.board.code != BoardCode.QUESTION:
        return []

    query_vector = _embed_query(document.page_content)

    try:
        search_results = get_vector_store().similarity_search(
            db,
            query_vector=query_vector,
            board_code=BoardCode.QUESTION,
            source_types=[ContentSourceType.POST, ContentSourceType.COMMENT],
            limit=max(top_k * 4, top_k),
            exclude_post_id=post.id,
        )
    except VectorStoreError as exc:
        raise AppException(
            "Vector store search failed.",
            code="VECTOR_STORE_SEARCH_FAILED",
            status_code=500,
        ) from exc

    retrieved: list[RetrievedChunk] = []

    for result in search_results:
        chunk = result.chunk
        score = max(result.score, 0.0)

        if score <= 0:
            continue

        retrieved.append(
            RetrievedChunk(
                chunk_id=chunk.id,
                post_id=chunk.post_id,
                comment_id=chunk.comment_id,
                chunk_text=chunk.chunk_text,
                score=score,
                metadata=chunk.metadata_json or {},
            )
        )

    return retrieved[:top_k]


def _embed_query(text: str) -> list[float]:
    try:
        return get_embedding_client().embed_query(text)
    except EmbeddingClientError as exc:
        raise AppException(
            "Embedding generation failed.",
            code="EMBEDDING_GENERATION_FAILED",
            status_code=503,
            details={"model": settings.openai_embedding_model},
        ) from exc
    except Exception as exc:
        raise AppException(
            "OpenAI embedding API call failed.",
            code="OPENAI_EMBEDDING_API_FAILED",
            status_code=503,
            details={"model": settings.openai_embedding_model},
        ) from exc
