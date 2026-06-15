from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.db.database import SessionLocal
from app.mcp.client import McpClientError, ProductMetadataMcpClient
from app.mcp.matching import ProductMatchContext, match_product_candidates
from app.models.enums import BoardCode, ProductEnrichmentStatus
from app.models.mcp_product_enrichment import McpProductEnrichment
from app.models.post import Post
from app.models.post_figure_info import PostFigureInfo
from app.repositories import post_repository, product_enrichment_repository
from app.schemas.product_enrichment_schema import ProductEnrichmentResponse


logger = logging.getLogger(__name__)

DEFAULT_PRODUCT_ENRICHMENT_CACHE_TTL_HOURS = 24
DEFAULT_PRODUCT_SEARCH_DISPLAY = 10


def get_product_enrichment(
    db: Session,
    *,
    post_id: int,
) -> ProductEnrichmentResponse | None:
    _ensure_review_post(db, post_id=post_id)
    enrichment = product_enrichment_repository.get_latest_product_enrichment_for_post(
        db,
        post_id=post_id,
    )

    if enrichment is None:
        return None

    return ProductEnrichmentResponse.model_validate(enrichment)


def request_product_enrichment(
    db: Session,
    *,
    post_id: int,
    force_refresh: bool = False,
) -> ProductEnrichmentResponse:
    post = _ensure_review_post(db, post_id=post_id)

    if not force_refresh:
        cached = _get_cached_enrichment(db, post_id=post.id)
        if cached is not None:
            return ProductEnrichmentResponse.model_validate(cached)

    query_text = _build_product_search_query(post)

    try:
        enrichment = product_enrichment_repository.create_product_enrichment(
            db,
            post_id=post.id,
            query_text=query_text,
            status=ProductEnrichmentStatus.REQUESTED,
        )
        db.commit()
        db.refresh(enrichment)
    except Exception:
        db.rollback()
        raise

    return ProductEnrichmentResponse.model_validate(enrichment)


def run_product_enrichment_task(enrichment_id: int) -> None:
    db = SessionLocal()

    try:
        process_product_enrichment(db, enrichment_id=enrichment_id)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to run product enrichment task %s", enrichment_id)
        _fail_product_enrichment_task(db, enrichment_id=enrichment_id)
    finally:
        db.close()


def process_product_enrichment(
    db: Session,
    *,
    enrichment_id: int,
    mcp_client: ProductMetadataMcpClient | None = None,
) -> ProductEnrichmentResponse:
    enrichment = _get_enrichment_or_raise(db, enrichment_id=enrichment_id)
    post = post_repository.get_public_post_by_id(db, enrichment.post_id)

    if post is None:
        product_enrichment_repository.mark_product_enrichment_failed(
            enrichment,
            error_message="Target post was not found while processing enrichment.",
            candidates_json=[],
            match_reasons_json=[],
        )
        return ProductEnrichmentResponse.model_validate(enrichment)

    product_enrichment_repository.mark_product_enrichment_processing(enrichment)
    db.flush()

    client = mcp_client or ProductMetadataMcpClient()

    try:
        search_result = client.search_gsc_smartstore_products(
            query=enrichment.query_text,
            display=DEFAULT_PRODUCT_SEARCH_DISPLAY,
            sort="sim",
        )
    except McpClientError as exc:
        product_enrichment_repository.mark_product_enrichment_failed(
            enrichment,
            error_message=exc.message,
            candidates_json=[],
            match_reasons_json=[
                {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                }
            ],
        )
        return ProductEnrichmentResponse.model_validate(enrichment)

    if not search_result.get("ok", False):
        error = search_result.get("error") or {}
        product_enrichment_repository.mark_product_enrichment_failed(
            enrichment,
            error_message=str(error.get("message") or "MCP product search failed."),
            candidates_json=[],
            match_reasons_json=[
                {
                    "code": error.get("code", "MCP_TOOL_ERROR"),
                    "message": error.get("message", "MCP product search failed."),
                    "details": error.get("details"),
                }
            ],
        )
        return ProductEnrichmentResponse.model_validate(enrichment)

    candidates = _safe_candidate_list(search_result.get("candidates"))
    match_result = match_product_candidates(
        context=_build_match_context(post),
        raw_candidates=candidates,
    )

    matched_product = match_result.matched_product
    if matched_product and match_result.source_url:
        matched_product = _attach_best_effort_metadata(
            client,
            matched_product=matched_product,
            product_url=match_result.source_url,
        )

    product_enrichment_repository.mark_product_enrichment_completed(
        enrichment,
        match_status=match_result.match_status,
        confidence_score=match_result.confidence_score,
        matched_product_json=matched_product,
        candidates_json=match_result.candidates,
        match_reasons_json=match_result.match_reasons,
        source_url=match_result.source_url,
    )

    return ProductEnrichmentResponse.model_validate(enrichment)


def _ensure_review_post(db: Session, *, post_id: int) -> Post:
    post = post_repository.get_public_post_by_id(db, post_id)

    if post is None:
        raise AppException(
            "Post was not found.",
            code="POST_NOT_FOUND",
            status_code=404,
        )

    if post.board.code != BoardCode.REVIEW:
        raise AppException(
            "Product enrichment is only available for REVIEW posts.",
            code="PRODUCT_ENRICHMENT_ONLY_FOR_REVIEW",
            status_code=400,
        )

    if _primary_figure_info(post) is None:
        raise AppException(
            "Review figure information is required for product enrichment.",
            code="REVIEW_FIGURE_INFO_REQUIRED",
            status_code=400,
        )

    return post


def _get_cached_enrichment(
    db: Session,
    *,
    post_id: int,
) -> McpProductEnrichment | None:
    ttl_hours = _parse_int_env(
        "PRODUCT_ENRICHMENT_CACHE_TTL_HOURS",
        DEFAULT_PRODUCT_ENRICHMENT_CACHE_TTL_HOURS,
    )
    fetched_after = datetime.now(timezone.utc) - timedelta(hours=ttl_hours)

    return product_enrichment_repository.get_recent_completed_product_enrichment_for_post(
        db,
        post_id=post_id,
        fetched_after=fetched_after,
    )


def _get_enrichment_or_raise(
    db: Session,
    *,
    enrichment_id: int,
) -> McpProductEnrichment:
    enrichment = product_enrichment_repository.get_product_enrichment_by_id(
        db,
        enrichment_id,
    )

    if enrichment is None:
        raise RuntimeError(f"Product enrichment {enrichment_id} was not found.")

    return enrichment


def _fail_product_enrichment_task(db: Session, *, enrichment_id: int) -> None:
    enrichment = product_enrichment_repository.get_product_enrichment_by_id(
        db,
        enrichment_id,
    )

    if enrichment is None:
        return

    product_enrichment_repository.mark_product_enrichment_failed(
        enrichment,
        error_message="Unexpected product enrichment task failure.",
        candidates_json=[],
        match_reasons_json=[
            {
                "code": "UNEXPECTED_ENRICHMENT_TASK_FAILURE",
                "message": "Unexpected product enrichment task failure.",
            }
        ],
    )
    db.commit()


def _build_match_context(post: Post) -> ProductMatchContext:
    figure_info = _primary_figure_info(post)
    tag_names = [
        link.tag.name
        for link in post.tag_links
        if link.tag is not None
    ]

    return ProductMatchContext(
        post_title=post.title,
        figure_name=figure_info.figure_name_text if figure_info else None,
        manufacturer=figure_info.manufacturer_text if figure_info else None,
        figure_type=(
            figure_info.figure_type.value
            if figure_info and figure_info.figure_type is not None
            else None
        ),
        price_amount=_decimal_or_none(figure_info.price_amount if figure_info else None),
        price_range=figure_info.price_range if figure_info else None,
        tag_names=tag_names,
    )


def _build_product_search_query(post: Post) -> str:
    figure_info = _primary_figure_info(post)
    tag_names = [
        link.tag.name
        for link in post.tag_links
        if link.tag is not None
    ]
    parts = [
        figure_info.figure_name_text if figure_info else None,
        figure_info.manufacturer_text if figure_info else None,
        post.title,
        *tag_names[:4],
    ]
    query = " ".join(part.strip() for part in parts if part and part.strip())
    return query[:200]


def _primary_figure_info(post: Post) -> PostFigureInfo | None:
    return post.figure_infos[0] if post.figure_infos else None


def _attach_best_effort_metadata(
    client: ProductMetadataMcpClient,
    *,
    matched_product: dict[str, Any],
    product_url: str,
) -> dict[str, Any]:
    try:
        metadata_result = client.fetch_gsc_product_metadata(product_url=product_url)
    except McpClientError as exc:
        return {
            **matched_product,
            "metadata_error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
            },
        }

    if not metadata_result.get("ok", False):
        return {
            **matched_product,
            "metadata_error": metadata_result.get("error"),
        }

    metadata = metadata_result.get("metadata")
    if not isinstance(metadata, dict):
        return matched_product

    return {
        **matched_product,
        "metadata": metadata,
    }


def _safe_candidate_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []

    return [item for item in value if isinstance(item, dict)]


def _parse_int_env(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    try:
        return int(raw_value)
    except ValueError:
        return default


def _decimal_or_none(value: Any) -> Decimal | None:
    if value is None:
        return None

    if isinstance(value, Decimal):
        return value

    try:
        return Decimal(str(value))
    except Exception:
        return None
