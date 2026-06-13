from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.app.core.config import Settings
from backend.app.models.ai import AiAnalysisResult
from backend.app.models.post import Post, PostTag
from backend.app.models.user import User
from backend.app.schemas.ai import AgentReviewResponse
from backend.app.services import llm, rag, similar_games

AGENT_ANALYSIS_TYPE = "agent_idea_review"
AGENT_MAX_STEPS = 3


@dataclass
class AgentStepResult:
    """Agent가 실행한 도구 단계의 성공 여부와 결과를 기록한다."""

    name: str
    ok: bool
    data: Any


def review_idea_post(db: Session, user: User, post_id: int, settings: Settings) -> AgentReviewResponse:
    """RAG, MCP, LLM 단계를 최대 3번으로 제한해 아이디어 리뷰 Agent를 실행한다."""
    post = get_idea_post_or_404(db, post_id)
    api_key = rag.get_user_openai_api_key(db, user, settings, required=True)
    assert api_key is not None

    steps: list[AgentStepResult] = []
    rag_items = run_rag_tool(db, user, post, settings, steps)
    similar_game_items = load_latest_similar_games(db, post.id)
    steps.append(AgentStepResult(name="load_mcp_result", ok=True, data={"count": len(similar_game_items)}))

    context = build_llm_context(post, rag_items, similar_game_items, steps[:AGENT_MAX_STEPS])
    review = llm.review_game_idea_with_openai(api_key, settings, context)
    steps.append(AgentStepResult(name="llm_review", ok=True, data={"model": settings.openai_model}))

    save_agent_result(db, post, user, review, steps[:AGENT_MAX_STEPS], settings.openai_model)
    return review


def get_idea_post_or_404(db: Session, post_id: int) -> Post:
    """Agent 분석 대상이 되는 삭제되지 않은 아이디어 게시글을 조회한다."""
    post = db.execute(
        select(Post)
        .where(Post.id == post_id, Post.deleted_at.is_(None))
        .options(selectinload(Post.tag_links).selectinload(PostTag.tag))
    ).scalar_one_or_none()
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="post_not_found")
    if post.board_type != "idea":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="idea_post_required")

    return post


def run_rag_tool(
    db: Session,
    user: User,
    post: Post,
    settings: Settings,
    steps: list[AgentStepResult],
) -> list[dict[str, Any]]:
    """Agent의 첫 도구로 제목 기반 RAG 추천을 실행하고 실패는 참고 정보로 남긴다."""
    try:
        response = rag.recommend_posts_by_title(db, user, post.title, settings)
    except HTTPException as error:
        steps.append(AgentStepResult(name="rag_recommend_posts", ok=False, data={"detail": error.detail}))
        return []

    items = [item.model_dump() for item in response.items]
    steps.append(AgentStepResult(name="rag_recommend_posts", ok=True, data={"count": len(items)}))
    return items


def load_latest_similar_games(db: Session, post_id: int) -> list[dict[str, Any]]:
    """이미 실행된 MCP 유사 게임 결과 중 최신 항목을 Agent 참고자료로 읽는다."""
    result = db.execute(
        select(AiAnalysisResult)
        .where(
            AiAnalysisResult.post_id == post_id,
            AiAnalysisResult.analysis_type == similar_games.MCP_ANALYSIS_TYPE,
        )
        .order_by(AiAnalysisResult.created_at.desc(), AiAnalysisResult.id.desc())
        .limit(1)
    ).scalar_one_or_none()
    if result is None:
        return []

    raw_items = result.result_json.get("items") if isinstance(result.result_json, dict) else None
    if not isinstance(raw_items, list):
        return []

    return [item for item in raw_items if isinstance(item, dict)][:5]


def build_llm_context(
    post: Post,
    rag_items: list[dict[str, Any]],
    similar_game_items: list[dict[str, Any]],
    steps: list[AgentStepResult],
) -> dict[str, Any]:
    """게시글, RAG, MCP 결과를 LLM 입력용 작은 JSON으로 정리한다."""
    tag_names = [tag_link.tag.name for tag_link in post.tag_links if tag_link.tag is not None]
    return {
        "task": "게임 아이디어를 분석하고 JSON으로 응답한다.",
        "post": {
            "title": post.title,
            "content": post.content,
            "genre": post.genre,
            "core_fun": post.core_fun,
            "platform": post.platform,
            "difficulty": post.difficulty,
            "tags": tag_names,
            "source_url": post.source_url,
        },
        "related_posts": rag_items[:3],
        "similar_games": similar_game_items[:5],
        "agent_steps": [step_to_json(step) for step in steps],
    }


def save_agent_result(
    db: Session,
    post: Post,
    user: User,
    review: AgentReviewResponse,
    steps: list[AgentStepResult],
    model_name: str,
) -> None:
    """Agent 리뷰 성공 결과를 ai_analysis_results에 저장한다."""
    db.add(
        AiAnalysisResult(
            post_id=post.id,
            user_id=user.id,
            analysis_type=AGENT_ANALYSIS_TYPE,
            model_name=model_name,
            result_json={
                **review.model_dump(),
                "steps": [step_to_json(step) for step in steps],
            },
        )
    )
    db.commit()


def step_to_json(step: AgentStepResult) -> dict[str, Any]:
    """dataclass 상태를 DB JSON에 저장하기 쉬운 dict로 바꾼다."""
    return {
        "name": step.name,
        "ok": step.ok,
        "data": step.data,
    }
