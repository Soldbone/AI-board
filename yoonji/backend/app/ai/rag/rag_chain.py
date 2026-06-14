from __future__ import annotations

from dataclasses import dataclass

from app.ai.llm.llm_client import LlmClientError, get_chat_client
from app.ai.llm.prompts import (
    PURCHASE_SUMMARY_SYSTEM_PROMPT,
    PURCHASE_SUMMARY_USER_TEMPLATE,
    QUESTION_REFERENCE_SYSTEM_PROMPT,
    QUESTION_REFERENCE_USER_TEMPLATE,
)
from app.ai.rag.retriever import RetrievedChunk
from app.core.config import settings


class RagChainError(RuntimeError):
    pass


@dataclass
class RagAnswer:
    content: str
    model_name: str


def generate_question_reference_answer(
    *,
    question_title: str,
    question_content: str,
    retrieved_chunks: list[RetrievedChunk],
) -> RagAnswer:
    context = _format_context(retrieved_chunks)
    user_prompt = QUESTION_REFERENCE_USER_TEMPLATE.format(
        question_title=question_title,
        question_content=question_content,
        context=context,
    )

    try:
        content = get_chat_client().invoke(
            [
                ("system", QUESTION_REFERENCE_SYSTEM_PROMPT),
                ("user", user_prompt),
            ]
        )
    except LlmClientError as exc:
        raise RagChainError("LLM client failed.") from exc
    except Exception as exc:
        raise RagChainError("LLM call failed.") from exc

    normalized_content = content.strip()

    if not normalized_content:
        raise RagChainError("LLM returned an empty answer.")

    return RagAnswer(
        content=normalized_content,
        model_name=settings.openai_chat_model,
    )


def generate_purchase_summary(
    *,
    purchase_title: str,
    purchase_content: str,
    retrieved_chunks: list[RetrievedChunk],
) -> RagAnswer:
    context = _format_purchase_context(retrieved_chunks)
    user_prompt = PURCHASE_SUMMARY_USER_TEMPLATE.format(
        purchase_title=purchase_title,
        purchase_content=purchase_content,
        context=context,
    )

    try:
        content = get_chat_client().invoke(
            [
                ("system", PURCHASE_SUMMARY_SYSTEM_PROMPT),
                ("user", user_prompt),
            ]
        )
    except LlmClientError as exc:
        raise RagChainError("LLM client failed.") from exc
    except Exception as exc:
        raise RagChainError("LLM call failed.") from exc

    normalized_content = content.strip()

    if not normalized_content:
        raise RagChainError("LLM returned an empty purchase summary.")

    return RagAnswer(
        content=normalized_content,
        model_name=settings.openai_chat_model,
    )


def _format_context(retrieved_chunks: list[RetrievedChunk]) -> str:
    lines: list[str] = []

    for index, chunk in enumerate(retrieved_chunks, start=1):
        source_label = "comment" if chunk.comment_id else "post"
        lines.append(
            "\n".join(
                [
                    f"[{index}] source={source_label}, post_id={chunk.post_id}, comment_id={chunk.comment_id or '-'}",
                    f"score={chunk.score:.4f}",
                    chunk.chunk_text,
                ]
            )
        )

    return "\n\n---\n\n".join(lines)


def _format_purchase_context(retrieved_chunks: list[RetrievedChunk]) -> str:
    lines: list[str] = []

    for index, chunk in enumerate(retrieved_chunks, start=1):
        metadata = chunk.metadata
        lines.append(
            "\n".join(
                [
                    f"[{index}] source=review_post, post_id={chunk.post_id}",
                    f"score={chunk.score:.4f}, evidence_kind={metadata.get('evidence_kind', 'related_review')}",
                    f"figure_name={metadata.get('figure_name', '-')}, manufacturer={metadata.get('manufacturer', '-')}",
                    f"price_range={metadata.get('price_range', '-')}, satisfaction_score={metadata.get('satisfaction_score', '-')}",
                    f"matched_signals={', '.join(metadata.get('matched_signals', [])) or '-'}",
                    chunk.chunk_text,
                ]
            )
        )

    return "\n\n---\n\n".join(lines)
