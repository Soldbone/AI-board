from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Select, select, update
from sqlalchemy.orm import Session, joinedload

from app.models.content_chunk import ContentChunk
from app.models.enums import BoardCode, ContentChunkStatus, ContentSourceType


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def create_content_chunk(
    db: Session,
    *,
    source_type: ContentSourceType,
    chunk_text: str,
    post_id: int | None = None,
    comment_id: int | None = None,
    board_code: BoardCode | None = None,
    chunk_index: int = 0,
    embedding_model: str | None = None,
    embedding_vector: list[float] | None = None,
    token_count: int | None = None,
    index_status: ContentChunkStatus = ContentChunkStatus.PENDING,
    metadata_json: dict[str, Any] | None = None,
    indexed_at: datetime | None = None,
) -> ContentChunk:
    chunk = ContentChunk(
        source_type=source_type,
        post_id=post_id,
        comment_id=comment_id,
        board_code=board_code,
        chunk_index=chunk_index,
        chunk_text=chunk_text,
        embedding_model=embedding_model,
        embedding_vector=embedding_vector,
        token_count=token_count,
        index_status=index_status,
        metadata_json=metadata_json,
        indexed_at=indexed_at,
    )
    db.add(chunk)
    db.flush()
    return chunk


def create_content_chunks(
    db: Session,
    *,
    chunk_values: list[dict[str, Any]],
) -> list[ContentChunk]:
    chunks = [ContentChunk(**values) for values in chunk_values]
    db.add_all(chunks)
    db.flush()
    return chunks


def get_content_chunk_by_id(db: Session, chunk_id: int) -> ContentChunk | None:
    statement = (
        select(ContentChunk)
        .options(
            joinedload(ContentChunk.post),
            joinedload(ContentChunk.comment),
        )
        .where(ContentChunk.id == chunk_id)
    )
    return db.scalar(statement)


def list_chunks_for_post(
    db: Session,
    *,
    post_id: int,
    statuses: list[ContentChunkStatus] | None = None,
) -> list[ContentChunk]:
    statement = _chunks_statement(statuses=statuses).where(ContentChunk.post_id == post_id)
    return list(db.scalars(statement.order_by(ContentChunk.chunk_index.asc())).all())


def list_chunks_for_comment(
    db: Session,
    *,
    comment_id: int,
    statuses: list[ContentChunkStatus] | None = None,
) -> list[ContentChunk]:
    statement = _chunks_statement(statuses=statuses).where(
        ContentChunk.comment_id == comment_id
    )
    return list(db.scalars(statement.order_by(ContentChunk.chunk_index.asc())).all())


def list_indexed_chunks(
    db: Session,
    *,
    board_code: BoardCode | None = None,
    source_types: list[ContentSourceType] | None = None,
    limit: int | None = 20,
) -> list[ContentChunk]:
    filters: list[object] = [ContentChunk.index_status == ContentChunkStatus.INDEXED]

    if board_code is not None:
        filters.append(ContentChunk.board_code == board_code)

    if source_types:
        filters.append(ContentChunk.source_type.in_(source_types))

    statement = (
        select(ContentChunk)
        .where(*filters)
        .order_by(ContentChunk.indexed_at.desc().nullslast(), ContentChunk.id.desc())
    )

    if limit is not None:
        statement = statement.limit(limit)

    return list(db.scalars(statement).all())


def mark_post_chunks_stale(db: Session, *, post_id: int) -> int:
    return _mark_chunks_stale(db, ContentChunk.post_id == post_id)


def mark_comment_chunks_stale(db: Session, *, comment_id: int) -> int:
    return _mark_chunks_stale(db, ContentChunk.comment_id == comment_id)


def mark_post_chunks_deleted(db: Session, *, post_id: int) -> int:
    return _mark_chunks_deleted(db, ContentChunk.post_id == post_id)


def mark_comment_chunks_deleted(db: Session, *, comment_id: int) -> int:
    return _mark_chunks_deleted(db, ContentChunk.comment_id == comment_id)


def mark_chunk_indexed(
    chunk: ContentChunk,
    *,
    embedding_model: str,
    embedding_vector: list[float] | None = None,
    token_count: int | None = None,
    metadata_json: dict[str, Any] | None = None,
) -> ContentChunk:
    chunk.embedding_model = embedding_model
    chunk.embedding_vector = embedding_vector
    chunk.token_count = token_count
    chunk.metadata_json = metadata_json
    chunk.index_status = ContentChunkStatus.INDEXED
    chunk.indexed_at = utc_now()
    return chunk


def mark_chunk_failed(chunk: ContentChunk) -> ContentChunk:
    chunk.index_status = ContentChunkStatus.FAILED
    return chunk


def mark_chunk_deleted(chunk: ContentChunk) -> ContentChunk:
    chunk.index_status = ContentChunkStatus.DELETED
    return chunk


def _chunks_statement(
    *,
    statuses: list[ContentChunkStatus] | None,
) -> Select[tuple[ContentChunk]]:
    statement = select(ContentChunk)

    if statuses:
        statement = statement.where(ContentChunk.index_status.in_(statuses))

    return statement


def _mark_chunks_stale(db: Session, source_filter: object) -> int:
    statement = (
        update(ContentChunk)
        .where(
            source_filter,
            ContentChunk.index_status.in_(
                [
                    ContentChunkStatus.PENDING,
                    ContentChunkStatus.INDEXED,
                    ContentChunkStatus.FAILED,
                ]
            ),
        )
        .values(
            index_status=ContentChunkStatus.STALE,
            updated_at=utc_now(),
        )
        .execution_options(synchronize_session=False)
    )
    result = db.execute(statement)
    return int(result.rowcount or 0)


def _mark_chunks_deleted(db: Session, source_filter: object) -> int:
    statement = (
        update(ContentChunk)
        .where(
            source_filter,
            ContentChunk.index_status != ContentChunkStatus.DELETED,
        )
        .values(
            index_status=ContentChunkStatus.DELETED,
            updated_at=utc_now(),
        )
        .execution_options(synchronize_session=False)
    )
    result = db.execute(statement)
    return int(result.rowcount or 0)
