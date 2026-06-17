from __future__ import annotations

import logging

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.ai.agent.agent_runner import AgentRunError, run_post_context_agent
from app.ai.agent.tools import FALLBACK_NO_EVIDENCE_ANSWER
from app.ai.llm.prompts import PURCHASE_NO_EVIDENCE_ANSWER
from app.ai.rag.rag_chain import RagChainError
from app.ai.usecases import purchase_summary
from app.core.config import settings
from app.core.exceptions import AppException
from app.db.database import SessionLocal
from app.models.ai_output import AiOutput
from app.models.enums import (
    AiOutputStatus,
    AiOutputType,
    BoardCode,
    GroundingStatus,
)
from app.models.user import User
from app.repositories import ai_output_repository, post_repository
from app.schemas.ai_schema import (
    AgentAnswerRequest,
    AiOutputResponse,
    PurchaseSummaryRequest,
)


logger = logging.getLogger(__name__)

AGENT_BOARD_CODES = {
    BoardCode.REVIEW,
    BoardCode.QUESTION,
    BoardCode.PURCHASE_HELP,
}


def request_purchase_summary(
    db: Session,
    *,
    post_id: int,
    payload: PurchaseSummaryRequest,
    current_user: User,
    background_tasks: BackgroundTasks,
) -> AiOutputResponse:
    post = post_repository.get_public_post_by_id(db, post_id)

    if post is None:
        raise AppException(
            "Post was not found.",
            code="POST_NOT_FOUND",
            status_code=404,
        )

    if post.board.code != BoardCode.PURCHASE_HELP:
        raise AppException(
            "Purchase summary is only available for PURCHASE_HELP posts.",
            code="PURCHASE_SUMMARY_ONLY_FOR_PURCHASE_HELP",
            status_code=400,
        )

    if not post.content.strip():
        raise AppException(
            "Purchase help content is required for AI purchase summary.",
            code="PURCHASE_CONTENT_REQUIRED",
            status_code=400,
        )

    try:
        ai_output = ai_output_repository.create_ai_output(
            db,
            output_type=AiOutputType.PURCHASE_SUMMARY,
            requester_id=current_user.id,
            target_post_id=post.id,
            query_text=_build_query_text(post),
            title="AI 구매 요약",
            status=AiOutputStatus.REQUESTED,
            grounding_status=GroundingStatus.NO_EVIDENCE,
            metadata_json={
                "top_k": payload.top_k,
                "include_similar_price_range": payload.include_similar_price_range,
                "embedding_model": settings.openai_embedding_model,
                "chat_model": settings.openai_chat_model,
            },
        )
        db.commit()
        db.refresh(ai_output)
    except Exception:
        db.rollback()
        raise

    background_tasks.add_task(
        _run_purchase_summary_task,
        ai_output.id,
        post.id,
        payload.top_k,
        payload.include_similar_price_range,
    )

    return AiOutputResponse.model_validate(ai_output)


def get_ai_output(db: Session, *, ai_output_id: int) -> AiOutputResponse:
    ai_output = ai_output_repository.get_ai_output_by_id(db, ai_output_id)

    if ai_output is None:
        raise AppException(
            "AI output was not found.",
            code="AI_OUTPUT_NOT_FOUND",
            status_code=404,
        )

    return AiOutputResponse.model_validate(ai_output)


def request_agent_answer(
    db: Session,
    *,
    post_id: int,
    payload: AgentAnswerRequest,
    current_user: User,
    background_tasks: BackgroundTasks,
) -> AiOutputResponse:
    post = post_repository.get_public_post_by_id(db, post_id)

    if post is None:
        raise AppException(
            "Post was not found.",
            code="POST_NOT_FOUND",
            status_code=404,
        )

    if post.board.code not in AGENT_BOARD_CODES:
        raise AppException(
            "Agent answer is only available for REVIEW, QUESTION, and PURCHASE_HELP posts.",
            code="AGENT_ANSWER_BOARD_NOT_SUPPORTED",
            status_code=400,
        )

    try:
        ai_output = ai_output_repository.create_ai_output(
            db,
            output_type=AiOutputType.AGENT_ANSWER,
            requester_id=current_user.id,
            target_post_id=post.id,
            query_text=_build_agent_query_text(post, payload.message),
            title=(
                "AI 답변"
                if post.board.code == BoardCode.QUESTION
                else "AI Agent Answer"
            ),
            status=AiOutputStatus.REQUESTED,
            grounding_status=GroundingStatus.NO_EVIDENCE,
            metadata_json={
                "top_k": payload.top_k,
                "include_mcp": payload.include_mcp,
                "embedding_model": settings.openai_embedding_model,
                "chat_model": settings.openai_chat_model,
            },
        )
        db.commit()
        db.refresh(ai_output)
    except Exception:
        db.rollback()
        raise

    background_tasks.add_task(
        _run_agent_answer_task,
        ai_output.id,
        post.id,
        payload.message,
        payload.top_k,
        payload.include_mcp,
    )

    return AiOutputResponse.model_validate(ai_output)


def _run_purchase_summary_task(
    ai_output_id: int,
    post_id: int,
    top_k: int,
    include_similar_price_range: bool,
) -> None:
    db = SessionLocal()

    try:
        ai_output = _get_ai_output_for_background(db, ai_output_id=ai_output_id)
        post = post_repository.get_public_post_by_id(db, post_id)

        if post is None:
            _mark_background_failed(
                db,
                ai_output=ai_output,
                error_message="Target post was not found while generating AI output.",
            )
            return

        ai_output_repository.mark_ai_output_processing(ai_output)
        db.commit()
        db.refresh(ai_output)

        purchase_summary.generate_and_store_purchase_summary(
            db,
            ai_output=ai_output,
            post=post,
            top_k=top_k,
            include_similar_price_range=include_similar_price_range,
        )
        db.commit()
    except RagChainError as exc:
        db.rollback()
        _fail_background_task(
            db,
            ai_output_id=ai_output_id,
            error_message=str(exc),
        )
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to generate purchase summary %s", ai_output_id)
        _fail_background_task(
            db,
            ai_output_id=ai_output_id,
            error_message=type(exc).__name__,
        )
    finally:
        db.close()


def _run_agent_answer_task(
    ai_output_id: int,
    post_id: int,
    message: str,
    top_k: int,
    include_mcp: bool,
) -> None:
    db = SessionLocal()

    try:
        ai_output = _get_ai_output_for_background(db, ai_output_id=ai_output_id)
        post = post_repository.get_public_post_by_id(db, post_id)

        if post is None:
            _mark_background_failed(
                db,
                ai_output=ai_output,
                error_message="Target post was not found while generating AI output.",
            )
            return

        ai_output_repository.mark_ai_output_processing(ai_output)
        db.commit()
        db.refresh(ai_output)

        result = run_post_context_agent(
            db,
            post=post,
            user_message=message,
            top_k=top_k,
            include_mcp=include_mcp,
        )
        ai_output_repository.mark_ai_output_generated(
            ai_output,
            content=result.content,
            grounding_status=result.grounding_status,
            confidence_score=result.confidence_score,
            model_name=result.model_name or settings.openai_chat_model,
            metadata_json={
                **(ai_output.metadata_json or {}),
                "agent_trace": result.agent_trace,
                "mcp_sources": result.mcp_sources,
            },
        )
        ai_output_repository.replace_ai_output_sources(
            db,
            ai_output=ai_output,
            source_values=result.source_values,
        )
        db.commit()
    except AgentRunError as exc:
        db.rollback()
        logger.exception("Failed to run post-context agent %s", ai_output_id)
        _fail_agent_background_task(
            db,
            ai_output_id=ai_output_id,
            error_message=str(exc),
            agent_trace=exc.trace,
            mcp_sources=exc.mcp_sources,
        )
    except Exception as exc:
        db.rollback()
        logger.exception("Unexpected post-context agent failure %s", ai_output_id)
        _fail_agent_background_task(
            db,
            ai_output_id=ai_output_id,
            error_message=type(exc).__name__,
            agent_trace=[],
            mcp_sources=[],
        )
    finally:
        db.close()


def _get_ai_output_for_background(
    db: Session,
    *,
    ai_output_id: int,
) -> AiOutput:
    ai_output = ai_output_repository.get_ai_output_by_id(db, ai_output_id)

    if ai_output is None:
        raise RuntimeError(f"AI output {ai_output_id} was not found.")

    return ai_output


def _fail_background_task(
    db: Session,
    *,
    ai_output_id: int,
    error_message: str,
) -> None:
    ai_output = ai_output_repository.get_ai_output_by_id(db, ai_output_id)

    if ai_output is None:
        return

    _mark_background_failed(db, ai_output=ai_output, error_message=error_message)


def _fail_agent_background_task(
    db: Session,
    *,
    ai_output_id: int,
    error_message: str,
    agent_trace: list[dict],
    mcp_sources: list[dict],
) -> None:
    ai_output = ai_output_repository.get_ai_output_by_id(db, ai_output_id)

    if ai_output is None:
        return

    ai_output_repository.mark_ai_output_failed(
        ai_output,
        error_message=error_message,
        content=FALLBACK_NO_EVIDENCE_ANSWER,
        grounding_status=GroundingStatus.NO_EVIDENCE,
        model_name=settings.openai_chat_model,
        metadata_json={
            **(ai_output.metadata_json or {}),
            "fallback": "AGENT_FAILED",
            "agent_trace": agent_trace,
            "mcp_sources": mcp_sources,
        },
    )
    ai_output_repository.replace_ai_output_sources(
        db,
        ai_output=ai_output,
        source_values=[],
    )
    db.commit()


def _mark_background_failed(
    db: Session,
    *,
    ai_output: AiOutput,
    error_message: str,
) -> None:
    ai_output_repository.mark_ai_output_failed(
        ai_output,
        error_message=error_message,
        content=_fallback_content_for(ai_output),
        grounding_status=GroundingStatus.NO_EVIDENCE,
        model_name=settings.openai_chat_model,
        metadata_json={
            **(ai_output.metadata_json or {}),
            "fallback": "GENERATION_FAILED",
        },
    )
    ai_output_repository.replace_ai_output_sources(
        db,
        ai_output=ai_output,
        source_values=[],
    )
    db.commit()


def _fallback_content_for(ai_output: AiOutput) -> str:
    return PURCHASE_NO_EVIDENCE_ANSWER


def _build_query_text(post) -> str:
    return "\n\n".join([post.title, post.content])


def _build_agent_query_text(post, message: str) -> str:
    return "\n\n".join(
        [
            f"Post title: {post.title}",
            f"Post content:\n{post.content}",
            f"User message:\n{message}",
        ]
    )
