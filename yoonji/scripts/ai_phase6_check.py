"""Run AI Phase 6 smoke checks against dev RAG seed data.

This script is intentionally read-only by default. It checks the current DB and
public HTTP read APIs without calling OpenAI. Run `scripts/seed_dev_data.py`
first so the deterministic RAG chunks and example AiOutput rows exist.

Before running:
1. Start the backend server.
2. Seed dev data:
   backend\\.venv\\Scripts\\python.exe scripts\\seed_dev_data.py --reset
3. Run:
   backend\\.venv\\Scripts\\python.exe scripts\\ai_phase6_check.py

Optional:
    AI_API_BASE_URL=http://127.0.0.1:8000/api/v1
    AI_PHASE6_SKIP_API=1
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "backend"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.database import SessionLocal
from app.models.ai_output import AiOutput
from app.models.ai_output_source import AiOutputSource
from app.models.comment import Comment
from app.models.content_chunk import ContentChunk
from app.models.enums import (
    AiOutputStatus,
    AiOutputType,
    BoardCode,
    ContentChunkStatus,
    ContentSourceType,
    GroundingStatus,
)
from app.models.post import Post


DEV_EMBEDDING_MODEL = "dev-deterministic-embedding-v1"
API_BASE_URL = os.getenv(
    "AI_API_BASE_URL",
    "http://127.0.0.1:8000/api/v1",
).rstrip("/")
SKIP_API = os.getenv("AI_PHASE6_SKIP_API", "").strip().lower() in {
    "1",
    "true",
    "yes",
    "y",
}


class CheckFailure(AssertionError):
    """Raised when a Phase 6 smoke check fails."""


@dataclass(frozen=True)
class SeedPostTargets:
    review_title: str = "하츠네 미쿠 NT 넨도로이드 후기 - 표정 파츠가 좋아요"
    isolated_review_title: str = "알베도 1/7 스케일 피규어 후기"
    question_title: str = "장식장 조명을 어떤 색온도로 맞추면 좋을까요?"
    question_context_title: str = "장식장 LED 조명 색온도 써보신 분?"
    purchase_same_title: str = "하츠네 미쿠 NT 넨도로이드 살까요?"
    purchase_similar_title: str = "첫 스케일 피규어 예약 고민입니다"
    purchase_no_evidence_title: str = "고가 레진 킷 구매 고민"


def main() -> int:
    print("Running AI Phase 6 smoke checks.")
    db = SessionLocal()

    try:
        targets = SeedPostTargets()
        post_by_title = load_seed_posts(db, targets)
        check_seed_posts(post_by_title)
        check_content_chunks(db, post_by_title)
        check_similar_review_readiness(db, post_by_title, targets)
        check_question_reference_output(db, post_by_title, targets)
        check_purchase_outputs(db, post_by_title, targets)
        check_ai_comment_separation(db, post_by_title, targets)

        if SKIP_API:
            print("[SKIP] API checks disabled by AI_PHASE6_SKIP_API")
        else:
            with httpx.Client(base_url=API_BASE_URL, timeout=10.0) as client:
                check_read_apis(client, db, post_by_title, targets)
    except httpx.ConnectError as exc:
        print(f"[FAIL] Backend is not reachable: {exc}", file=sys.stderr)
        print(
            "Start the backend first, or set AI_PHASE6_SKIP_API=1 for DB-only checks.",
            file=sys.stderr,
        )
        return 1
    except CheckFailure as exc:
        print(f"[FAIL] {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()

    print("\nAll AI Phase 6 smoke checks passed.")
    return 0


def load_seed_posts(
    db: Session,
    targets: SeedPostTargets,
) -> dict[str, Post]:
    target_titles = {
        targets.review_title,
        targets.isolated_review_title,
        targets.question_title,
        targets.question_context_title,
        targets.purchase_same_title,
        targets.purchase_similar_title,
        targets.purchase_no_evidence_title,
    }
    posts = {
        post.title: post
        for post in db.scalars(select(Post).where(Post.title.in_(target_titles))).all()
    }
    missing_titles = sorted(target_titles - set(posts))

    if missing_titles:
        raise CheckFailure(
            "missing dev seed posts. Run scripts/seed_dev_data.py --reset first: "
            + ", ".join(missing_titles)
        )

    return posts


def check_seed_posts(post_by_title: dict[str, Post]) -> None:
    board_counts = {
        board_code: sum(
            1
            for post in post_by_title.values()
            if post.board.code == board_code
        )
        for board_code in (BoardCode.REVIEW, BoardCode.QUESTION, BoardCode.PURCHASE_HELP)
    }

    for board_code, count in board_counts.items():
        if count <= 0:
            raise CheckFailure(f"seed data has no {board_code.value} posts")

    print("[PASS] Seed posts cover REVIEW, QUESTION, and PURCHASE_HELP")


def check_content_chunks(
    db: Session,
    post_by_title: dict[str, Post],
) -> None:
    post_ids = [post.id for post in post_by_title.values()]
    chunks = db.scalars(
        select(ContentChunk).where(
            ContentChunk.post_id.in_(post_ids),
            ContentChunk.index_status == ContentChunkStatus.INDEXED,
        )
    ).all()

    if not chunks:
        raise CheckFailure("no indexed content chunks found for dev seed posts")

    dev_chunks = [
        chunk
        for chunk in chunks
        if chunk.metadata_json and chunk.metadata_json.get("seed") == "dev"
    ]

    if not dev_chunks:
        raise CheckFailure(
            "no dev seed content chunks found. Run scripts/seed_dev_data.py --reset"
        )

    chunk_board_codes = {chunk.board_code for chunk in dev_chunks}
    for board_code in (BoardCode.REVIEW, BoardCode.QUESTION, BoardCode.PURCHASE_HELP):
        if board_code not in chunk_board_codes:
            raise CheckFailure(f"missing indexed chunks for {board_code.value}")

    comment_chunks = db.scalars(
        select(ContentChunk).where(
            ContentChunk.source_type == ContentSourceType.COMMENT,
            ContentChunk.index_status == ContentChunkStatus.INDEXED,
        )
    ).all()
    dev_comment_chunk_count = sum(
        1
        for chunk in comment_chunks
        if chunk.metadata_json and chunk.metadata_json.get("seed") == "dev"
    )

    if dev_comment_chunk_count <= 0:
        raise CheckFailure("question comment chunks are required for reference answers")

    for chunk in dev_chunks:
        if not chunk.embedding_vector:
            raise CheckFailure(f"chunk {chunk.id} has no embedding_vector")
        if chunk.embedding_model != DEV_EMBEDDING_MODEL:
            raise CheckFailure(
                f"chunk {chunk.id} should use {DEV_EMBEDDING_MODEL}, "
                f"got {chunk.embedding_model}"
            )

    print("[PASS] RAG content chunks and deterministic embeddings exist")


def check_similar_review_readiness(
    db: Session,
    post_by_title: dict[str, Post],
    targets: SeedPostTargets,
) -> None:
    review = post_by_title[targets.review_title]
    related_review_count = db.scalar(
        select(func.count(ContentChunk.id)).where(
            ContentChunk.board_code == BoardCode.REVIEW,
            ContentChunk.source_type == ContentSourceType.POST,
            ContentChunk.post_id != review.id,
            ContentChunk.index_status == ContentChunkStatus.INDEXED,
        )
    )

    if int(related_review_count or 0) < 2:
        raise CheckFailure("similar review recommendation needs multiple REVIEW chunks")

    isolated_review = post_by_title[targets.isolated_review_title]
    isolated_chunk_count = db.scalar(
        select(func.count(ContentChunk.id)).where(
            ContentChunk.post_id == isolated_review.id,
            ContentChunk.board_code == BoardCode.REVIEW,
            ContentChunk.index_status == ContentChunkStatus.INDEXED,
        )
    )

    if int(isolated_chunk_count or 0) <= 0:
        raise CheckFailure("isolated review fallback scenario has no REVIEW chunk")

    print("[PASS] Similar review recommendation seed readiness is valid")


def check_question_reference_output(
    db: Session,
    post_by_title: dict[str, Post],
    targets: SeedPostTargets,
) -> None:
    question = post_by_title[targets.question_title]
    ai_output = get_latest_ai_output(
        db,
        target_post_id=question.id,
        output_type=AiOutputType.QUESTION_REFERENCE_ANSWER,
    )

    assert_generated_output(
        ai_output,
        expected_type=AiOutputType.QUESTION_REFERENCE_ANSWER,
        allowed_grounding={
            GroundingStatus.GROUNDED,
            GroundingStatus.PARTIALLY_GROUNDED,
        },
        label="question reference answer",
    )
    assert_sources(ai_output, min_count=2, label="question reference answer")

    if not any(source.source_comment_id for source in ai_output.sources):
        raise CheckFailure("question reference answer should cite at least one comment")

    print("[PASS] Question reference AiOutput has grounded sources")


def check_purchase_outputs(
    db: Session,
    post_by_title: dict[str, Post],
    targets: SeedPostTargets,
) -> None:
    same_figure_post = post_by_title[targets.purchase_same_title]
    same_figure_output = get_latest_ai_output(
        db,
        target_post_id=same_figure_post.id,
        output_type=AiOutputType.PURCHASE_SUMMARY,
    )
    assert_generated_output(
        same_figure_output,
        expected_type=AiOutputType.PURCHASE_SUMMARY,
        allowed_grounding={
            GroundingStatus.GROUNDED,
            GroundingStatus.PARTIALLY_GROUNDED,
        },
        label="same figure purchase summary",
    )
    assert_sources(same_figure_output, min_count=2, label="same figure purchase summary")

    similar_price_post = post_by_title[targets.purchase_similar_title]
    similar_price_output = get_latest_ai_output(
        db,
        target_post_id=similar_price_post.id,
        output_type=AiOutputType.PURCHASE_SUMMARY,
    )
    assert_generated_output(
        similar_price_output,
        expected_type=AiOutputType.PURCHASE_SUMMARY,
        allowed_grounding={
            GroundingStatus.GROUNDED,
            GroundingStatus.PARTIALLY_GROUNDED,
        },
        label="similar price purchase summary",
    )
    assert_sources(similar_price_output, min_count=1, label="similar price summary")

    no_evidence_post = post_by_title[targets.purchase_no_evidence_title]
    no_evidence_output = get_latest_ai_output(
        db,
        target_post_id=no_evidence_post.id,
        output_type=AiOutputType.PURCHASE_SUMMARY,
    )
    assert_generated_output(
        no_evidence_output,
        expected_type=AiOutputType.PURCHASE_SUMMARY,
        allowed_grounding={GroundingStatus.NO_EVIDENCE},
        label="no evidence purchase summary",
    )

    if no_evidence_output.sources:
        raise CheckFailure("no evidence purchase summary should not have sources")

    print("[PASS] Purchase summary AiOutputs cover grounded and fallback cases")


def check_ai_comment_separation(
    db: Session,
    post_by_title: dict[str, Post],
    targets: SeedPostTargets,
) -> None:
    question = post_by_title[targets.question_title]
    ai_output = get_latest_ai_output(
        db,
        target_post_id=question.id,
        output_type=AiOutputType.QUESTION_REFERENCE_ANSWER,
    )
    comment_count = int(
        db.scalar(
            select(func.count(Comment.id)).where(Comment.post_id == question.id)
        )
        or 0
    )

    if comment_count != question.comment_count:
        raise CheckFailure(
            "question comment_count should count only user comments, not AiOutput rows"
        )

    if ai_output.content and db.scalar(
        select(func.count(Comment.id)).where(Comment.content == ai_output.content)
    ):
        raise CheckFailure("AI answer content was stored as a user comment")

    print("[PASS] AI outputs are stored separately from user comments")


def check_read_apis(
    client: httpx.Client,
    db: Session,
    post_by_title: dict[str, Post],
    targets: SeedPostTargets,
) -> None:
    expect_status(client.get("/health"), 200, "health check")

    for board_code in ("REVIEW", "QUESTION", "PURCHASE_HELP"):
        response = expect_status(
            client.get("/posts", params={"board_code": board_code, "size": 10}),
            200,
            f"list posts for {board_code}",
        )
        body = response.json()
        assert_list_shape(body, f"{board_code} list")

        if body["total"] <= 0:
            raise CheckFailure(f"{board_code} list API returned no seeded posts")

    question = post_by_title[targets.question_title]
    output = get_latest_ai_output(
        db,
        target_post_id=question.id,
        output_type=AiOutputType.QUESTION_REFERENCE_ANSWER,
    )
    output_response = expect_status(
        client.get(f"/ai/outputs/{output.id}"),
        200,
        "get seeded question AiOutput",
    ).json()

    if not output_response.get("sources"):
        raise CheckFailure("GET /ai/outputs/{id} should include sources")

    print("[PASS] Public read APIs expose seeded RAG data")


def get_latest_ai_output(
    db: Session,
    *,
    target_post_id: int,
    output_type: AiOutputType,
) -> AiOutput:
    ai_output = db.scalars(
        select(AiOutput)
        .where(
            AiOutput.target_post_id == target_post_id,
            AiOutput.output_type == output_type,
        )
        .order_by(AiOutput.created_at.desc(), AiOutput.id.desc())
    ).first()

    if ai_output is None:
        raise CheckFailure(
            f"missing AiOutput type={output_type.value} for post_id={target_post_id}"
        )

    return ai_output


def assert_generated_output(
    ai_output: AiOutput,
    *,
    expected_type: AiOutputType,
    allowed_grounding: set[GroundingStatus],
    label: str,
) -> None:
    if ai_output.output_type != expected_type:
        raise CheckFailure(f"{label}: wrong output_type {ai_output.output_type}")

    if ai_output.status != AiOutputStatus.GENERATED:
        raise CheckFailure(f"{label}: expected GENERATED, got {ai_output.status}")

    if ai_output.grounding_status not in allowed_grounding:
        raise CheckFailure(
            f"{label}: unexpected grounding_status {ai_output.grounding_status}"
        )

    if not ai_output.content:
        raise CheckFailure(f"{label}: content is empty")


def assert_sources(ai_output: AiOutput, *, min_count: int, label: str) -> None:
    if len(ai_output.sources) < min_count:
        raise CheckFailure(
            f"{label}: expected at least {min_count} source rows, "
            f"got {len(ai_output.sources)}"
        )

    for source in ai_output.sources:
        if source.content_chunk_id is None:
            raise CheckFailure(f"{label}: source {source.id} has no content_chunk_id")
        if not source.excerpt:
            raise CheckFailure(f"{label}: source {source.id} has no excerpt")


def expect_status(
    response: httpx.Response,
    expected_status: int | tuple[int, ...],
    label: str,
) -> httpx.Response:
    expected = (
        expected_status
        if isinstance(expected_status, tuple)
        else (expected_status,)
    )

    if response.status_code not in expected:
        raise CheckFailure(
            f"{label}: expected HTTP {expected}, got {response.status_code}. "
            f"Body: {response.text[:500]}"
        )

    return response


def assert_list_shape(body: dict[str, Any], label: str) -> None:
    for key in ("items", "page", "size", "total", "has_next"):
        if key not in body:
            raise CheckFailure(f"{label}: missing list response key {key!r}")


if __name__ == "__main__":
    raise SystemExit(main())
