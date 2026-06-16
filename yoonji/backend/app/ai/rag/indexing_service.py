from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.ai.rag import document_loader
from app.ai.rag.embedding_client import (
    EmbeddingClientError,
    build_embedding_error_details,
    get_embedding_client,
)
from app.ai.rag.text_splitter import estimate_token_count, split_document
from app.ai.rag.vector_store import VectorStoreError, get_vector_store
from app.core.config import settings
from app.core.exceptions import AppException
from app.db.database import SessionLocal
from app.models.enums import ContentChunkStatus, ContentSourceType
from app.repositories import comment_repository, content_chunk_repository, post_repository
from app.schemas.ai_schema import ContentIndexingResponse, ReindexContentResponse


logger = logging.getLogger(__name__)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def index_post(db: Session, *, post_id: int) -> ContentIndexingResponse:
    post = post_repository.get_post_for_indexing(db, post_id)

    if post is None:
        raise AppException(
            "Post is not found or is not indexable for RAG.",
            code="INDEXABLE_POST_NOT_FOUND",
            status_code=404,
        )

    document = document_loader.build_post_document(post)

    if document is None:
        return _mark_post_skipped(db, post_id=post_id)

    chunks = split_document(document)

    if not chunks:
        return _mark_post_skipped(db, post_id=post_id)

    embeddings = _embed_chunk_texts([chunk.page_content for chunk in chunks])
    chunk_values = [
        _build_chunk_values(chunk, embedding=embedding)
        for chunk, embedding in zip(chunks, embeddings, strict=True)
    ]

    try:
        stale_count = content_chunk_repository.mark_post_chunks_stale(
            db,
            post_id=post_id,
        )
        created_chunks = content_chunk_repository.create_content_chunks(
            db,
            chunk_values=chunk_values,
        )
        get_vector_store().upsert_chunks(db, created_chunks)
        db.commit()

        return ContentIndexingResponse(
            source_type=ContentSourceType.POST,
            post_id=post_id,
            status="INDEXED",
            chunk_count=len(created_chunks),
            stale_count=stale_count,
        )
    except VectorStoreError as exc:
        db.rollback()
        raise AppException(
            "Vector store initialization failed.",
            code="VECTOR_STORE_INITIALIZATION_FAILED",
            status_code=500,
        ) from exc
    except Exception:
        db.rollback()
        raise


def index_comment(db: Session, *, comment_id: int) -> ContentIndexingResponse:
    comment = comment_repository.get_comment_for_indexing(db, comment_id)

    if comment is None:
        raise AppException(
            "Comment is not found or is not indexable for RAG.",
            code="INDEXABLE_COMMENT_NOT_FOUND",
            status_code=404,
        )

    document = document_loader.build_comment_document(comment)

    if document is None:
        return _mark_comment_skipped(db, comment_id=comment_id)

    chunks = split_document(document)

    if not chunks:
        return _mark_comment_skipped(db, comment_id=comment_id)

    embeddings = _embed_chunk_texts([chunk.page_content for chunk in chunks])
    chunk_values = [
        _build_chunk_values(chunk, embedding=embedding)
        for chunk, embedding in zip(chunks, embeddings, strict=True)
    ]

    try:
        stale_count = content_chunk_repository.mark_comment_chunks_stale(
            db,
            comment_id=comment_id,
        )
        created_chunks = content_chunk_repository.create_content_chunks(
            db,
            chunk_values=chunk_values,
        )
        get_vector_store().upsert_chunks(db, created_chunks)
        db.commit()

        return ContentIndexingResponse(
            source_type=ContentSourceType.COMMENT,
            post_id=comment.post_id,
            comment_id=comment_id,
            status="INDEXED",
            chunk_count=len(created_chunks),
            stale_count=stale_count,
        )
    except VectorStoreError as exc:
        db.rollback()
        raise AppException(
            "Vector store initialization failed.",
            code="VECTOR_STORE_INITIALIZATION_FAILED",
            status_code=500,
        ) from exc
    except Exception:
        db.rollback()
        raise


def delete_post_index(db: Session, *, post_id: int) -> ContentIndexingResponse:
    try:
        deleted_count = content_chunk_repository.mark_post_chunks_deleted(
            db,
            post_id=post_id,
        )
        db.commit()
        return ContentIndexingResponse(
            source_type=ContentSourceType.POST,
            post_id=post_id,
            status="DELETED",
            stale_count=deleted_count,
            message="Existing post chunks were marked as deleted.",
        )
    except Exception:
        db.rollback()
        raise


def delete_comment_index(db: Session, *, comment_id: int) -> ContentIndexingResponse:
    try:
        deleted_count = content_chunk_repository.mark_comment_chunks_deleted(
            db,
            comment_id=comment_id,
        )
        db.commit()
        return ContentIndexingResponse(
            source_type=ContentSourceType.COMMENT,
            comment_id=comment_id,
            status="DELETED",
            stale_count=deleted_count,
            message="Existing comment chunks were marked as deleted.",
        )
    except Exception:
        db.rollback()
        raise


def reindex_all_content(
    db: Session,
    *,
    include_posts: bool = True,
    include_comments: bool = True,
    limit: int | None = None,
) -> ReindexContentResponse:
    response = ReindexContentResponse()

    if include_posts:
        posts = post_repository.list_posts_for_indexing(db, limit=limit)
        for post in posts:
            try:
                result = index_post(db, post_id=post.id)
                response.post_count += 1
                response.chunk_count += result.chunk_count
            except Exception as exc:
                db.rollback()
                response.failed_items.append(f"post:{post.id}:{type(exc).__name__}")

    if include_comments:
        comments = comment_repository.list_comments_for_indexing(db, limit=limit)
        for comment in comments:
            try:
                result = index_comment(db, comment_id=comment.id)
                response.comment_count += 1
                response.chunk_count += result.chunk_count
            except Exception as exc:
                db.rollback()
                response.failed_items.append(
                    f"comment:{comment.id}:{type(exc).__name__}"
                )

    return response


def schedule_post_indexing(background_tasks, *, post_id: int) -> None:
    if settings.auto_index_after_write:
        background_tasks.add_task(_run_post_indexing_task, post_id)


def schedule_comment_indexing(background_tasks, *, comment_id: int) -> None:
    if settings.auto_index_after_write:
        background_tasks.add_task(_run_comment_indexing_task, comment_id)


def schedule_post_index_deletion(background_tasks, *, post_id: int) -> None:
    if settings.auto_index_after_write:
        background_tasks.add_task(_run_post_index_delete_task, post_id)


def schedule_comment_index_deletion(background_tasks, *, comment_id: int) -> None:
    if settings.auto_index_after_write:
        background_tasks.add_task(_run_comment_index_delete_task, comment_id)


def _run_post_indexing_task(post_id: int) -> None:
    db = SessionLocal()
    try:
        index_post(db, post_id=post_id)
    except Exception:
        logger.exception("Failed to index post %s", post_id)
    finally:
        db.close()


def _run_comment_indexing_task(comment_id: int) -> None:
    db = SessionLocal()
    try:
        index_comment(db, comment_id=comment_id)
    except Exception:
        logger.exception("Failed to index comment %s", comment_id)
    finally:
        db.close()


def _run_post_index_delete_task(post_id: int) -> None:
    db = SessionLocal()
    try:
        delete_post_index(db, post_id=post_id)
    except Exception:
        logger.exception("Failed to delete post chunks %s", post_id)
    finally:
        db.close()


def _run_comment_index_delete_task(comment_id: int) -> None:
    db = SessionLocal()
    try:
        delete_comment_index(db, comment_id=comment_id)
    except Exception:
        logger.exception("Failed to delete comment chunks %s", comment_id)
    finally:
        db.close()


def _embed_chunk_texts(texts: list[str]) -> list[list[float]]:
    try:
        return get_embedding_client().embed_documents(texts)
    except EmbeddingClientError as exc:
        raise AppException(
            str(exc) or "Embedding generation failed.",
            code="EMBEDDING_GENERATION_FAILED",
            status_code=503,
            details=build_embedding_error_details(exc),
        ) from exc
    except Exception as exc:
        raise AppException(
            "OpenAI embedding API call failed.",
            code="OPENAI_EMBEDDING_API_FAILED",
            status_code=503,
            details={"model": settings.openai_embedding_model},
        ) from exc


def _build_chunk_values(document_chunk, *, embedding: list[float]) -> dict[str, Any]:
    metadata = dict(document_chunk.metadata)
    source_type = ContentSourceType(metadata["source_type"])
    post_id = metadata.get("post_id")
    comment_id = metadata.get("comment_id")
    board_code = metadata.get("board_code")

    return {
        "source_type": source_type,
        "post_id": post_id,
        "comment_id": comment_id,
        "board_code": board_code,
        "chunk_index": metadata.get("chunk_index", 0),
        "chunk_text": document_chunk.page_content,
        "embedding_model": settings.openai_embedding_model,
        "embedding_vector": embedding,
        "token_count": estimate_token_count(document_chunk.page_content),
        "index_status": ContentChunkStatus.INDEXED,
        "metadata_json": metadata,
        "indexed_at": utc_now(),
    }


def _mark_post_skipped(db: Session, *, post_id: int) -> ContentIndexingResponse:
    stale_count = content_chunk_repository.mark_post_chunks_stale(db, post_id=post_id)
    db.commit()
    return ContentIndexingResponse(
        source_type=ContentSourceType.POST,
        post_id=post_id,
        status="SKIPPED",
        stale_count=stale_count,
        message="No indexable post text was available.",
    )


def _mark_comment_skipped(
    db: Session,
    *,
    comment_id: int,
) -> ContentIndexingResponse:
    stale_count = content_chunk_repository.mark_comment_chunks_stale(
        db,
        comment_id=comment_id,
    )
    db.commit()
    return ContentIndexingResponse(
        source_type=ContentSourceType.COMMENT,
        comment_id=comment_id,
        status="SKIPPED",
        stale_count=stale_count,
        message="No indexable comment text was available.",
    )
