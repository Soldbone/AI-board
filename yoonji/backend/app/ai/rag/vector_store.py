from __future__ import annotations

from dataclasses import dataclass
from math import sqrt

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.content_chunk import ContentChunk
from app.models.enums import BoardCode, ContentSourceType
from app.repositories import content_chunk_repository


class VectorStoreError(RuntimeError):
    pass


@dataclass
class VectorSearchResult:
    chunk: ContentChunk
    score: float


class DatabaseVectorStore:
    """Development vector store backed by ContentChunk.embedding_vector.

    The project keeps vector-store operations behind this class so a later
    pgvector or Chroma implementation can replace the storage details without
    changing usecase code.
    """

    provider_name = "database"

    def upsert_chunks(self, db: Session, chunks: list[ContentChunk]) -> None:
        # ContentChunk rows already hold the embedding vector in this provider.
        db.flush()

    def similarity_search(
        self,
        db: Session,
        *,
        query_vector: list[float],
        board_code: BoardCode | None = None,
        source_types: list[ContentSourceType] | None = None,
        limit: int = 5,
        exclude_post_id: int | None = None,
        include_post_ids: set[int] | None = None,
    ) -> list[VectorSearchResult]:
        chunks = content_chunk_repository.list_indexed_chunks(
            db,
            board_code=board_code,
            source_types=source_types,
            limit=None,
        )
        results: list[VectorSearchResult] = []

        for chunk in chunks:
            if exclude_post_id is not None and chunk.post_id == exclude_post_id:
                continue

            if include_post_ids is not None and chunk.post_id not in include_post_ids:
                continue

            if not chunk.embedding_vector:
                continue

            score = _cosine_similarity(query_vector, chunk.embedding_vector)
            results.append(VectorSearchResult(chunk=chunk, score=score))

        return sorted(results, key=lambda result: result.score, reverse=True)[:limit]


def get_vector_store() -> DatabaseVectorStore:
    provider = settings.vector_store_provider.lower()

    if provider in {"database", "pgvector"}:
        return DatabaseVectorStore()

    if provider == "chroma":
        raise VectorStoreError(
            "Chroma provider is not installed in this project yet. "
            "Use VECTOR_STORE_PROVIDER=pgvector for the current implementation."
        )

    raise VectorStoreError(f"Unsupported VECTOR_STORE_PROVIDER: {provider}")


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    if len(left) != len(right) or not left:
        return 0.0

    dot_product = sum(a * b for a, b in zip(left, right, strict=False))
    left_norm = sqrt(sum(value * value for value in left))
    right_norm = sqrt(sum(value * value for value in right))

    if left_norm == 0 or right_norm == 0:
        return 0.0

    return dot_product / (left_norm * right_norm)
