from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.enums import ProductEnrichmentStatus, ProductMatchStatus
from app.models.mcp_product_enrichment import McpProductEnrichment


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def create_product_enrichment(
    db: Session,
    *,
    post_id: int,
    query_text: str,
    status: ProductEnrichmentStatus = ProductEnrichmentStatus.REQUESTED,
    match_status: ProductMatchStatus = ProductMatchStatus.NO_MATCH,
    confidence_score: float | None = None,
    matched_product_json: dict[str, Any] | None = None,
    candidates_json: list[dict[str, Any]] | None = None,
    match_reasons_json: list[dict[str, Any]] | None = None,
    source_url: str | None = None,
    error_message: str | None = None,
    fetched_at: datetime | None = None,
) -> McpProductEnrichment:
    enrichment = McpProductEnrichment(
        post_id=post_id,
        query_text=query_text,
        status=status,
        match_status=match_status,
        confidence_score=confidence_score,
        matched_product_json=matched_product_json,
        candidates_json=candidates_json,
        match_reasons_json=match_reasons_json,
        source_url=source_url,
        error_message=error_message,
        fetched_at=fetched_at,
    )
    db.add(enrichment)
    db.flush()
    return enrichment


def get_product_enrichment_by_id(
    db: Session,
    enrichment_id: int,
) -> McpProductEnrichment | None:
    statement = (
        select(McpProductEnrichment)
        .options(joinedload(McpProductEnrichment.post))
        .where(McpProductEnrichment.id == enrichment_id)
    )
    return db.scalar(statement)


def get_latest_product_enrichment_for_post(
    db: Session,
    *,
    post_id: int,
) -> McpProductEnrichment | None:
    statement = (
        select(McpProductEnrichment)
        .where(McpProductEnrichment.post_id == post_id)
        .order_by(
            McpProductEnrichment.created_at.desc(),
            McpProductEnrichment.id.desc(),
        )
        .limit(1)
    )
    return db.scalar(statement)


def get_recent_completed_product_enrichment_for_post(
    db: Session,
    *,
    post_id: int,
    fetched_after: datetime,
) -> McpProductEnrichment | None:
    """Return a cache hit that is still inside the caller's TTL window."""

    statement = (
        select(McpProductEnrichment)
        .where(
            McpProductEnrichment.post_id == post_id,
            McpProductEnrichment.status == ProductEnrichmentStatus.COMPLETED,
            McpProductEnrichment.fetched_at.is_not(None),
            McpProductEnrichment.fetched_at >= fetched_after,
        )
        .order_by(
            McpProductEnrichment.fetched_at.desc(),
            McpProductEnrichment.id.desc(),
        )
        .limit(1)
    )
    return db.scalar(statement)


def list_product_enrichments_for_post(
    db: Session,
    *,
    post_id: int,
    limit: int = 20,
) -> list[McpProductEnrichment]:
    statement = (
        select(McpProductEnrichment)
        .where(McpProductEnrichment.post_id == post_id)
        .order_by(
            McpProductEnrichment.created_at.desc(),
            McpProductEnrichment.id.desc(),
        )
        .limit(limit)
    )
    return list(db.scalars(statement).all())


def mark_product_enrichment_processing(
    enrichment: McpProductEnrichment,
) -> McpProductEnrichment:
    enrichment.status = ProductEnrichmentStatus.PROCESSING
    enrichment.error_message = None
    return enrichment


def mark_product_enrichment_completed(
    enrichment: McpProductEnrichment,
    *,
    match_status: ProductMatchStatus,
    confidence_score: float | None,
    matched_product_json: dict[str, Any] | None,
    candidates_json: list[dict[str, Any]],
    match_reasons_json: list[dict[str, Any]],
    source_url: str | None = None,
    fetched_at: datetime | None = None,
) -> McpProductEnrichment:
    enrichment.status = ProductEnrichmentStatus.COMPLETED
    enrichment.match_status = match_status
    enrichment.confidence_score = confidence_score
    enrichment.matched_product_json = matched_product_json
    enrichment.candidates_json = candidates_json
    enrichment.match_reasons_json = match_reasons_json
    enrichment.source_url = source_url
    enrichment.error_message = None
    enrichment.fetched_at = fetched_at or utc_now()
    return enrichment


def mark_product_enrichment_failed(
    enrichment: McpProductEnrichment,
    *,
    error_message: str,
    candidates_json: list[dict[str, Any]] | None = None,
    match_reasons_json: list[dict[str, Any]] | None = None,
    fetched_at: datetime | None = None,
) -> McpProductEnrichment:
    enrichment.status = ProductEnrichmentStatus.FAILED
    enrichment.match_status = ProductMatchStatus.NO_MATCH
    enrichment.confidence_score = None
    enrichment.matched_product_json = None
    enrichment.candidates_json = candidates_json
    enrichment.match_reasons_json = match_reasons_json
    enrichment.error_message = error_message
    enrichment.fetched_at = fetched_at or utc_now()
    return enrichment
