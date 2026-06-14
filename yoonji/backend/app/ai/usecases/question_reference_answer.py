from __future__ import annotations

from sqlalchemy.orm import Session

from app.ai.llm.prompts import NO_EVIDENCE_ANSWER
from app.ai.rag.rag_chain import RagChainError, generate_question_reference_answer
from app.ai.rag.retriever import RetrievedChunk, retrieve_question_reference_chunks
from app.models.ai_output import AiOutput
from app.models.enums import GroundingStatus
from app.models.post import Post
from app.repositories import ai_output_repository


def generate_and_store_reference_answer(
    db: Session,
    *,
    ai_output: AiOutput,
    post: Post,
    top_k: int,
) -> AiOutput:
    retrieved_chunks = retrieve_question_reference_chunks(db, post=post, top_k=top_k)

    if not retrieved_chunks:
        ai_output_repository.mark_ai_output_generated(
            ai_output,
            content=NO_EVIDENCE_ANSWER,
            grounding_status=GroundingStatus.NO_EVIDENCE,
            metadata_json={
                **(ai_output.metadata_json or {}),
                "top_k": top_k,
                "retrieved_count": 0,
                "fallback": "NO_EVIDENCE",
            },
        )
        ai_output_repository.replace_ai_output_sources(
            db,
            ai_output=ai_output,
            source_values=[],
        )
        return ai_output

    try:
        answer = generate_question_reference_answer(
            question_title=post.title,
            question_content=post.content,
            retrieved_chunks=retrieved_chunks,
        )
    except RagChainError:
        raise

    grounding_status = _resolve_grounding_status(retrieved_chunks, top_k=top_k)
    ai_output_repository.mark_ai_output_generated(
        ai_output,
        content=answer.content,
        grounding_status=grounding_status,
        confidence_score=_estimate_confidence(retrieved_chunks),
        model_name=answer.model_name,
        metadata_json={
            **(ai_output.metadata_json or {}),
            "top_k": top_k,
            "retrieved_count": len(retrieved_chunks),
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


def _resolve_grounding_status(
    chunks: list[RetrievedChunk],
    *,
    top_k: int,
) -> GroundingStatus:
    if len(chunks) >= min(top_k, 3):
        return GroundingStatus.GROUNDED

    return GroundingStatus.PARTIALLY_GROUNDED


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


def _make_excerpt(text: str, *, max_length: int = 280) -> str:
    normalized = " ".join(text.split())

    if len(normalized) <= max_length:
        return normalized

    return f"{normalized[:max_length].rstrip()}..."
