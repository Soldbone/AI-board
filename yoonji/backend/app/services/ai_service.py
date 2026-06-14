from __future__ import annotations

import logging

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.ai.llm.prompts import NO_EVIDENCE_ANSWER
from app.ai.rag.rag_chain import RagChainError
from app.ai.usecases import question_reference_answer
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
from app.schemas.ai_schema import AiOutputResponse, ReferenceAnswerRequest


logger = logging.getLogger(__name__)


def request_question_reference_answer(
    db: Session,
    *,
    post_id: int,
    payload: ReferenceAnswerRequest,
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

    if post.board.code != BoardCode.QUESTION:
        raise AppException(
            "Question reference answer is only available for QUESTION posts.",
            code="QUESTION_REFERENCE_ANSWER_ONLY_FOR_QUESTION",
            status_code=400,
        )

    if not post.content.strip():
        raise AppException(
            "Question content is required for AI reference answer.",
            code="QUESTION_CONTENT_REQUIRED",
            status_code=400,
        )

    try:
        ai_output = ai_output_repository.create_ai_output(
            db,
            output_type=AiOutputType.QUESTION_REFERENCE_ANSWER,
            requester_id=current_user.id,
            target_post_id=post.id,
            query_text=_build_query_text(post),
            title="AI 참고 답변",
            status=AiOutputStatus.REQUESTED,
            grounding_status=GroundingStatus.NO_EVIDENCE,
            metadata_json={
                "top_k": payload.top_k,
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
        _run_question_reference_answer_task,
        ai_output.id,
        post.id,
        payload.top_k,
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


def _run_question_reference_answer_task(
    ai_output_id: int,
    post_id: int,
    top_k: int,
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

        question_reference_answer.generate_and_store_reference_answer(
            db,
            ai_output=ai_output,
            post=post,
            top_k=top_k,
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
        logger.exception("Failed to generate question reference answer %s", ai_output_id)
        _fail_background_task(
            db,
            ai_output_id=ai_output_id,
            error_message=type(exc).__name__,
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


def _mark_background_failed(
    db: Session,
    *,
    ai_output: AiOutput,
    error_message: str,
) -> None:
    ai_output_repository.mark_ai_output_failed(
        ai_output,
        error_message=error_message,
        content=NO_EVIDENCE_ANSWER,
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


def _build_query_text(post) -> str:
    return "\n\n".join([post.title, post.content])
