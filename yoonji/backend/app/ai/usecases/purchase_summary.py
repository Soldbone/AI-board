from __future__ import annotations

from sqlalchemy.orm import Session

from app.ai.llm.prompts import PURCHASE_NO_EVIDENCE_ANSWER
from app.ai.rag.rag_chain import RagChainError, generate_purchase_summary
from app.ai.rag.retriever import RetrievedChunk, retrieve_purchase_summary_chunks
from app.models.ai_output import AiOutput
from app.models.enums import GroundingStatus
from app.models.post import Post
from app.repositories import ai_output_repository


def generate_and_store_purchase_summary(
    db: Session,
    *,
    ai_output: AiOutput,
    post: Post,
    top_k: int,
    include_similar_price_range: bool,
) -> AiOutput:
    retrieved_chunks = retrieve_purchase_summary_chunks(
        db,
        post=post,
        top_k=top_k,
        include_similar_price_range=include_similar_price_range,
    )

    if not retrieved_chunks:
        ai_output_repository.mark_ai_output_generated(
            ai_output,
            content=PURCHASE_NO_EVIDENCE_ANSWER,
            grounding_status=GroundingStatus.NO_EVIDENCE,
            metadata_json={
                **(ai_output.metadata_json or {}),
                "top_k": top_k,
                "retrieved_count": 0,
                "fallback": "NO_REVIEW_EVIDENCE",
            },
        )
        ai_output_repository.replace_ai_output_sources(
            db,
            ai_output=ai_output,
            source_values=[],
        )
        return ai_output

    try:
        answer = generate_purchase_summary(
            purchase_title=post.title,
            purchase_content=post.content,
            retrieved_chunks=retrieved_chunks,
        )
    except RagChainError:
        raise

    evidence_summary = _summarize_evidence(retrieved_chunks)
    ai_output_repository.mark_ai_output_generated(
        ai_output,
        content=answer.content,
        grounding_status=_resolve_grounding_status(retrieved_chunks),
        confidence_score=_estimate_confidence(retrieved_chunks),
        model_name=answer.model_name,
        metadata_json={
            **(ai_output.metadata_json or {}),
            "top_k": top_k,
            "retrieved_count": len(retrieved_chunks),
            **evidence_summary,
        },
    )
    ai_output_repository.replace_ai_output_sources(
        db,
        ai_output=ai_output,
        source_values=[
            _build_source_value(chunk, rank_order=index)
            for index, chunk in enumerate(retrieved_chunks, start=1)
        ],
    )
    return ai_output


def _resolve_grounding_status(chunks: list[RetrievedChunk]) -> GroundingStatus:
    same_figure_count = _count_evidence_kind(chunks, "same_figure")

    if same_figure_count >= 2 or len(chunks) >= 4:
        return GroundingStatus.GROUNDED

    if chunks:
        return GroundingStatus.PARTIALLY_GROUNDED

    return GroundingStatus.NO_EVIDENCE


def _summarize_evidence(chunks: list[RetrievedChunk]) -> dict:
    return {
        "same_figure_count": _count_evidence_kind(chunks, "same_figure"),
        "same_manufacturer_count": _count_evidence_kind(chunks, "same_manufacturer"),
        "similar_price_recommendation_count": _count_evidence_kind(
            chunks,
            "similar_price_high_satisfaction",
        ),
    }


def _count_evidence_kind(chunks: list[RetrievedChunk], evidence_kind: str) -> int:
    return sum(
        1
        for chunk in chunks
        if chunk.metadata.get("evidence_kind") == evidence_kind
    )


def _estimate_confidence(chunks: list[RetrievedChunk]) -> float:
    if not chunks:
        return 0.0

    average_score = sum(chunk.score for chunk in chunks) / len(chunks)
    return round(max(0.0, min(average_score, 1.0)), 4)


def _build_source_value(chunk: RetrievedChunk, *, rank_order: int) -> dict:
    return {
        "content_chunk_id": chunk.chunk_id,
        "source_post_id": chunk.post_id,
        "source_comment_id": chunk.comment_id,
        "relevance_score": round(chunk.score, 4),
        "rank_order": rank_order,
        "excerpt": _make_excerpt(chunk.chunk_text),
    }


def _make_excerpt(text: str, *, max_length: int = 320) -> str:
    normalized = " ".join(text.split())

    if len(normalized) <= max_length:
        return normalized

    return f"{normalized[:max_length].rstrip()}..."
