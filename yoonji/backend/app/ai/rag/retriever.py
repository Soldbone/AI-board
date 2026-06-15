from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any

from sqlalchemy.orm import Session

from app.ai.rag import document_loader
from app.ai.rag.embedding_client import (
    EmbeddingClientError,
    build_embedding_error_details,
    get_embedding_client,
)
from app.ai.rag.vector_store import VectorStoreError, get_vector_store
from app.core.config import settings
from app.core.exceptions import AppException
from app.models.enums import BoardCode, ContentSourceType, PriceRange
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

    query_vector = _embed_query(_build_similar_review_query_text(document))
    target_metadata = document.metadata
    target_figure_name = _as_text(target_metadata.get("figure_name"))
    target_manufacturer = _as_text(target_metadata.get("manufacturer"))
    target_tags = _normalize_tags(target_metadata.get("tags", []))
    target_price_range = _price_range_from_metadata(target_metadata.get("price_range"))

    try:
        search_results = get_vector_store().similarity_search(
            db,
            query_vector=query_vector,
            board_code=BoardCode.REVIEW,
            source_types=[ContentSourceType.POST],
            limit=max(limit * 12, 30),
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

        ranked = _rank_similar_review_chunk(
            chunk_metadata=chunk.metadata_json or {},
            target_figure_name=target_figure_name,
            target_manufacturer=target_manufacturer,
            target_tags=target_tags,
            target_price_range=target_price_range,
            base_score=score,
        )

        current = candidates_by_post_id.get(chunk.post_id)
        candidate = SimilarPostCandidate(
            post_id=chunk.post_id,
            score=ranked.score,
            chunk_id=chunk.id,
            metadata=ranked.metadata,
        )

        if current is None or _similar_review_candidate_sort_key(
            candidate
        ) > _similar_review_candidate_sort_key(current):
            candidates_by_post_id[chunk.post_id] = candidate

    return sorted(
        candidates_by_post_id.values(),
        key=_similar_review_candidate_sort_key,
        reverse=True,
    )[:limit]


def _build_similar_review_query_text(document: Any) -> str:
    figure_name = _as_text(document.metadata.get("figure_name"))
    manufacturer = _as_text(document.metadata.get("manufacturer"))
    query_parts: list[str] = []

    if figure_name:
        # Put product identity first so the embedding query leans toward the
        # reviewed figure before broader writing style or sentiment.
        query_parts.extend(
            [
                f"Figure name: {figure_name}",
                f"Target figure name: {figure_name}",
                f"Reviewed figure: {figure_name}",
            ]
        )

    if manufacturer:
        query_parts.append(f"Manufacturer: {manufacturer}")

    query_parts.append(document.page_content)
    return "\n\n".join(query_parts)


@dataclass
class _RankedSimilarReviewChunk:
    score: float
    priority: int
    metadata: dict[str, Any]


def _rank_similar_review_chunk(
    *,
    chunk_metadata: dict[str, Any],
    target_figure_name: str | None,
    target_manufacturer: str | None,
    target_tags: set[str],
    target_price_range: PriceRange | None,
    base_score: float,
) -> _RankedSimilarReviewChunk:
    candidate_figure_name = _as_text(chunk_metadata.get("figure_name"))
    candidate_manufacturer = _as_text(chunk_metadata.get("manufacturer"))
    candidate_tags = _normalize_tags(chunk_metadata.get("tags", []))
    candidate_price_range = _price_range_from_metadata(chunk_metadata.get("price_range"))
    shared_tags = sorted(target_tags & candidate_tags)

    matched_signals: list[str] = []
    match_kind = "related_review"
    priority = 1
    rerank_score = base_score

    if _same_text(target_figure_name, candidate_figure_name):
        rerank_score += 0.7
        priority = 5
        match_kind = "same_figure_name"
        matched_signals.append("same figure name")
    elif _has_meaningful_text_overlap(target_figure_name, candidate_figure_name):
        rerank_score += 0.35
        priority = 4
        match_kind = "related_figure_name"
        matched_signals.append("related figure name")

    if _same_text(target_manufacturer, candidate_manufacturer):
        rerank_score += 0.18
        if priority < 3:
            priority = 3
            match_kind = "same_manufacturer"
        matched_signals.append("same manufacturer")

    if shared_tags:
        rerank_score += min(len(shared_tags), 3) * 0.06
        if priority < 2:
            priority = 2
            match_kind = "shared_tags"
        matched_signals.append("shared tags")

    if _same_price_range(target_price_range, candidate_price_range):
        rerank_score += 0.08
        if priority < 2:
            priority = 2
            match_kind = "similar_price_range"
        matched_signals.append("similar price range")

    bounded_score = round(min(rerank_score, 1.0), 4)

    return _RankedSimilarReviewChunk(
        score=bounded_score,
        priority=priority,
        metadata={
            **chunk_metadata,
            "match_kind": match_kind,
            "match_priority": priority,
            "matched_signals": matched_signals,
            "retrieval_score": round(base_score, 4),
            "rerank_score": bounded_score,
        },
    )


def _similar_review_candidate_sort_key(
    candidate: SimilarPostCandidate,
) -> tuple[int, float, float]:
    return (
        _safe_int(candidate.metadata.get("match_priority")),
        candidate.score,
        _safe_float(candidate.metadata.get("retrieval_score")),
    )


def _same_text(left: str | None, right: str | None) -> bool:
    if left is None or right is None:
        return False

    return _normalize_match_text(left) == _normalize_match_text(right)


def _has_meaningful_text_overlap(left: str | None, right: str | None) -> bool:
    if left is None or right is None:
        return False

    normalized_left = _normalize_match_text(left)
    normalized_right = _normalize_match_text(right)

    if len(normalized_left) >= 3 and len(normalized_right) >= 3:
        if normalized_left in normalized_right or normalized_right in normalized_left:
            return True

    left_tokens = _meaningful_tokens(normalized_left)
    right_tokens = _meaningful_tokens(normalized_right)

    return len(left_tokens & right_tokens) >= 2


def _normalize_match_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().casefold())


def _meaningful_tokens(value: str) -> set[str]:
    return {
        token
        for token in re.split(r"[\s_/(),.\-\[\]]+", value)
        if len(token) >= 2
    }


def _safe_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


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


def retrieve_purchase_summary_chunks(
    db: Session,
    *,
    post: Post,
    top_k: int,
    include_similar_price_range: bool,
) -> list[RetrievedChunk]:
    document = document_loader.build_post_document(post)

    if document is None or post.board.code != BoardCode.PURCHASE_HELP:
        return []

    query_text = document.page_content
    query_vector = _embed_query(query_text)
    target_tags = _normalize_tags(document.metadata.get("tags", []))
    target_price_range = _infer_price_range(query_text)

    try:
        search_results = get_vector_store().similarity_search(
            db,
            query_vector=query_vector,
            board_code=BoardCode.REVIEW,
            source_types=[ContentSourceType.POST],
            limit=max(top_k * 10, 20),
        )
    except VectorStoreError as exc:
        raise AppException(
            "Vector store search failed.",
            code="VECTOR_STORE_SEARCH_FAILED",
            status_code=500,
        ) from exc

    best_by_post_id: dict[int, RetrievedChunk] = {}

    for result in search_results:
        chunk = result.chunk

        if chunk.post_id is None:
            continue

        base_score = max(result.score, 0.0)

        if base_score <= 0:
            continue

        ranked = _rank_purchase_review_chunk(
            chunk_metadata=chunk.metadata_json or {},
            query_text=query_text,
            target_tags=target_tags,
            target_price_range=target_price_range,
            base_score=base_score,
            include_similar_price_range=include_similar_price_range,
        )

        if ranked is None:
            continue

        current = best_by_post_id.get(chunk.post_id)
        if current is None or ranked.score > current.score:
            best_by_post_id[chunk.post_id] = RetrievedChunk(
                chunk_id=chunk.id,
                post_id=chunk.post_id,
                comment_id=chunk.comment_id,
                chunk_text=chunk.chunk_text,
                score=ranked.score,
                metadata=ranked.metadata,
            )

    return sorted(
        best_by_post_id.values(),
        key=lambda chunk: (
            _purchase_evidence_priority(chunk.metadata),
            _safe_int(chunk.metadata.get("satisfaction_score")),
            chunk.score,
        ),
        reverse=True,
    )[:top_k]


def _embed_query(text: str) -> list[float]:
    try:
        return get_embedding_client().embed_query(text)
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


@dataclass
class _RankedPurchaseChunk:
    score: float
    metadata: dict[str, Any]


def _rank_purchase_review_chunk(
    *,
    chunk_metadata: dict[str, Any],
    query_text: str,
    target_tags: set[str],
    target_price_range: PriceRange | None,
    base_score: float,
    include_similar_price_range: bool,
) -> _RankedPurchaseChunk | None:
    matched_signals: list[str] = []
    evidence_kind = "related_review"
    rerank_score = base_score
    priority = 1

    figure_name = _as_text(chunk_metadata.get("figure_name"))
    manufacturer = _as_text(chunk_metadata.get("manufacturer"))
    review_price_range = _price_range_from_metadata(chunk_metadata.get("price_range"))
    satisfaction_score = _safe_int(chunk_metadata.get("satisfaction_score"))
    review_tags = _normalize_tags(chunk_metadata.get("tags", []))
    shared_tags = sorted(target_tags & review_tags)

    if _text_appears_in_query(figure_name, query_text):
        rerank_score += 0.45
        evidence_kind = "same_figure"
        priority = 4
        matched_signals.append("same figure name")
    elif _text_appears_in_query(manufacturer, query_text):
        rerank_score += 0.18
        evidence_kind = "same_manufacturer"
        priority = 3
        matched_signals.append("same manufacturer")

    if shared_tags:
        rerank_score += min(len(shared_tags), 3) * 0.06
        if priority < 2:
            evidence_kind = "shared_tags"
            priority = 2
        matched_signals.append("shared tags")

    if include_similar_price_range and _same_price_range(
        target_price_range,
        review_price_range,
    ):
        rerank_score += 0.12
        if priority < 2:
            evidence_kind = "similar_price_high_satisfaction"
            priority = 2
        matched_signals.append("similar price range")

    if include_similar_price_range and satisfaction_score >= 4:
        rerank_score += 0.08
        if priority < 2:
            evidence_kind = "similar_price_high_satisfaction"
            priority = 2
        matched_signals.append("high satisfaction")

    # Keep weak vector-only matches only when the score is still meaningful.
    if priority == 1 and base_score < 0.35:
        return None

    return _RankedPurchaseChunk(
        score=round(min(rerank_score, 1.0), 4),
        metadata={
            **chunk_metadata,
            "evidence_kind": evidence_kind,
            "matched_signals": matched_signals,
            "retrieval_score": round(base_score, 4),
            "rerank_score": round(min(rerank_score, 1.0), 4),
            "target_price_range": target_price_range.value if target_price_range else None,
        },
    )


def _infer_price_range(text: str) -> PriceRange | None:
    normalized = text.replace(",", "")
    amounts: list[float] = []

    for match in re.finditer(r"(\d+(?:\.\d+)?)\s*(만원|만|원)?", normalized):
        number = float(match.group(1))
        unit = match.group(2) or ""

        if unit in {"만원", "만"}:
            amounts.append(number * 10000)
        elif unit == "원":
            amounts.append(number)
        elif number >= 1000:
            amounts.append(number)

    if not amounts:
        return None

    amount = max(amounts)

    if amount < 30000:
        return PriceRange.UNDER_30000

    if amount < 50000:
        return PriceRange.PRICE_30000_50000

    if amount < 100000:
        return PriceRange.PRICE_50000_100000

    if amount < 200000:
        return PriceRange.PRICE_100000_200000

    return PriceRange.OVER_200000


def _same_price_range(
    left: PriceRange | None,
    right: PriceRange | None,
) -> bool:
    return left is not None and right is not None and left == right


def _price_range_from_metadata(value: Any) -> PriceRange | None:
    if isinstance(value, PriceRange):
        return value

    if isinstance(value, str):
        try:
            return PriceRange(value)
        except ValueError:
            return None

    return None


def _normalize_tags(value: Any) -> set[str]:
    if not isinstance(value, list):
        return set()

    return {
        str(item).strip().casefold()
        for item in value
        if str(item).strip()
    }


def _text_appears_in_query(value: str | None, query_text: str) -> bool:
    if value is None:
        return False

    normalized_value = value.strip().casefold()

    if len(normalized_value) < 2:
        return False

    return normalized_value in query_text.casefold()


def _as_text(value: Any) -> str | None:
    if value is None:
        return None

    text = str(value).strip()
    return text or None


def _safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _purchase_evidence_priority(metadata: dict[str, Any]) -> int:
    priority_by_kind = {
        "same_figure": 4,
        "same_manufacturer": 3,
        "shared_tags": 2,
        "similar_price_high_satisfaction": 2,
        "related_review": 1,
    }
    return priority_by_kind.get(str(metadata.get("evidence_kind")), 1)
