from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.ai_output import AiOutput
from app.models.ai_output_source import AiOutputSource
from app.models.enums import AiOutputStatus, AiOutputType, GroundingStatus


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def create_ai_output(
    db: Session,
    *,
    output_type: AiOutputType,
    requester_id: int,
    target_post_id: int,
    query_text: str,
    title: str,
    content: str | None = None,
    status: AiOutputStatus = AiOutputStatus.REQUESTED,
    grounding_status: GroundingStatus = GroundingStatus.NO_EVIDENCE,
    confidence_score: float | None = None,
    model_name: str | None = None,
    metadata_json: dict[str, Any] | None = None,
) -> AiOutput:
    ai_output = AiOutput(
        output_type=output_type,
        requester_id=requester_id,
        target_post_id=target_post_id,
        query_text=query_text,
        title=title,
        content=content,
        status=status,
        grounding_status=grounding_status,
        confidence_score=confidence_score,
        model_name=model_name,
        metadata_json=metadata_json,
    )
    db.add(ai_output)
    db.flush()
    return ai_output


def get_ai_output_by_id(db: Session, ai_output_id: int) -> AiOutput | None:
    statement = (
        select(AiOutput)
        .options(
            joinedload(AiOutput.target_post),
            selectinload(AiOutput.sources).joinedload(AiOutputSource.content_chunk),
        )
        .where(AiOutput.id == ai_output_id)
    )
    return db.scalar(statement)


def list_ai_outputs_for_post(
    db: Session,
    *,
    target_post_id: int,
    output_type: AiOutputType | None = None,
) -> list[AiOutput]:
    filters: list[object] = [AiOutput.target_post_id == target_post_id]

    if output_type is not None:
        filters.append(AiOutput.output_type == output_type)

    statement = (
        select(AiOutput)
        .options(selectinload(AiOutput.sources))
        .where(*filters)
        .order_by(AiOutput.created_at.desc(), AiOutput.id.desc())
    )
    return list(db.scalars(statement).all())


def mark_ai_output_processing(ai_output: AiOutput) -> AiOutput:
    ai_output.status = AiOutputStatus.PROCESSING
    ai_output.error_message = None
    return ai_output


def mark_ai_output_generated(
    ai_output: AiOutput,
    *,
    content: str,
    grounding_status: GroundingStatus,
    confidence_score: float | None = None,
    model_name: str | None = None,
    metadata_json: dict[str, Any] | None = None,
) -> AiOutput:
    ai_output.content = content
    ai_output.status = AiOutputStatus.GENERATED
    ai_output.grounding_status = grounding_status
    ai_output.confidence_score = confidence_score
    ai_output.model_name = model_name
    ai_output.metadata_json = metadata_json
    ai_output.error_message = None
    ai_output.completed_at = utc_now()
    return ai_output


def mark_ai_output_failed(
    ai_output: AiOutput,
    *,
    error_message: str,
    content: str | None = None,
    grounding_status: GroundingStatus = GroundingStatus.NO_EVIDENCE,
    model_name: str | None = None,
    metadata_json: dict[str, Any] | None = None,
) -> AiOutput:
    ai_output.content = content
    ai_output.status = AiOutputStatus.FAILED
    ai_output.grounding_status = grounding_status
    ai_output.model_name = model_name
    ai_output.metadata_json = metadata_json
    ai_output.error_message = error_message
    ai_output.completed_at = utc_now()
    return ai_output


def add_ai_output_source(
    db: Session,
    *,
    ai_output: AiOutput,
    content_chunk_id: int | None = None,
    source_post_id: int | None = None,
    source_comment_id: int | None = None,
    relevance_score: float | None = None,
    rank_order: int,
    excerpt: str,
) -> AiOutputSource:
    source = AiOutputSource(
        ai_output_id=ai_output.id,
        content_chunk_id=content_chunk_id,
        source_post_id=source_post_id,
        source_comment_id=source_comment_id,
        relevance_score=relevance_score,
        rank_order=rank_order,
        excerpt=excerpt,
    )
    db.add(source)
    db.flush()
    return source


def replace_ai_output_sources(
    db: Session,
    *,
    ai_output: AiOutput,
    source_values: list[dict[str, Any]],
) -> list[AiOutputSource]:
    for source in list(ai_output.sources):
        db.delete(source)

    db.flush()

    return [
        add_ai_output_source(db, ai_output=ai_output, **source_value)
        for source_value in source_values
    ]
