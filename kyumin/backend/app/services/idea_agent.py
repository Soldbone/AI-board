from __future__ import annotations

import json
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
from backend.app.services.mcp_client import McpClientError

AGENT_ANALYSIS_TYPE = "agent_idea_review"
AGENT_MAX_STEPS = 3
AGENT_TOOL_RESULT_LIMIT = 5

AGENT_TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "rag_search_posts",
            "description": "현재 아이디어 제목과 비슷한 게시글을 pgvector RAG 검색으로 찾는다.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "검색할 게임 아이디어 제목. 비어 있으면 현재 게시글 제목을 사용한다.",
                    }
                },
                "required": ["title"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mcp_list_genres",
            "description": "Video Games MCP Server에서 RAWG 장르 목록을 가져온다.",
            "parameters": {
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mcp_search_game_by_title",
            "description": "Video Games MCP Server로 게임 제목을 검색한다.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "검색할 게임 제목 또는 영어 키워드"},
                    "limit": {"type": "integer", "description": "가져올 게임 수. 1부터 5까지 사용한다."},
                },
                "required": ["title", "limit"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mcp_get_popular_games",
            "description": "Video Games MCP Server에서 인기 게임을 장르 기준으로 가져온다.",
            "parameters": {
                "type": "object",
                "properties": {
                    "genre": {"type": "string", "description": "선택 장르. 모르면 빈 문자열을 사용한다."},
                    "limit": {"type": "integer", "description": "가져올 게임 수. 1부터 5까지 사용한다."},
                },
                "required": ["genre", "limit"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mcp_get_game_details",
            "description": "Video Games MCP Server에서 특정 게임의 상세 정보를 가져온다.",
            "parameters": {
                "type": "object",
                "properties": {
                    "game_id": {"type": "integer", "description": "RAWG 게임 ID"},
                },
                "required": ["game_id"],
                "additionalProperties": False,
            },
        },
    },
]


@dataclass
class AgentStepResult:
    """Agent가 실행한 도구 단계의 성공 여부와 결과를 기록한다."""

    name: str
    ok: bool
    data: Any


async def review_idea_post(db: Session, user: User, post_id: int, settings: Settings) -> AgentReviewResponse:
    """LLM이 RAG/MCP 도구를 고르고 관찰한 뒤 최종 아이디어 리뷰를 만든다."""
    post = get_idea_post_or_404(db, post_id)
    api_key = rag.get_user_openai_api_key(db, user, settings, required=True)
    assert api_key is not None

    messages = build_agent_messages(post)
    steps: list[AgentStepResult] = []

    for _ in range(AGENT_MAX_STEPS):
        assistant_message = llm.create_agent_turn_with_openai(
            api_key,
            settings,
            messages,
            AGENT_TOOL_DEFINITIONS,
        )
        tool_call = extract_first_tool_call(assistant_message)
        if tool_call is None:
            review = parse_final_review_or_none(assistant_message, steps)
            if review is not None:
                save_agent_result(db, post, user, review, steps, settings.openai_model)
                return review
            break

        messages.append(build_assistant_tool_call_message(assistant_message, tool_call))
        tool_result = await execute_agent_tool(db, user, post, api_key, settings, tool_call)
        steps.append(
            AgentStepResult(
                name=tool_result["name"],
                ok=tool_result["ok"],
                data=tool_result["data"],
            )
        )
        messages.append(build_tool_result_message(tool_call, tool_result))

    review = llm.create_agent_final_review_with_openai(api_key, settings, messages)
    steps.append(AgentStepResult(name="final_review", ok=True, data={"model": settings.openai_model}))
    save_agent_result(db, post, user, review, steps, settings.openai_model)
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


def build_agent_messages(post: Post) -> list[dict[str, Any]]:
    """Agent가 도구 선택과 최종 응답을 판단할 수 있게 초기 대화 상태를 만든다."""
    return [
        {
            "role": "system",
            "content": (
                "너는 게임랩 학생의 게임 아이디어를 분석하는 Agent다. "
                "필요하면 제공된 RAG/MCP 도구를 직접 선택해 호출한다. "
                "도구 결과를 관찰한 뒤 최종 답변은 summary, difference, difficulty, suggestions JSON으로만 작성한다. "
                "suggestions는 정확히 3개의 짧은 한국어 문장이다."
            ),
        },
        {
            "role": "user",
            "content": json.dumps(build_post_context(post), ensure_ascii=False),
        },
    ]


def build_post_context(post: Post) -> dict[str, Any]:
    """게시글 필드를 LLM과 도구 선택에 필요한 작은 JSON으로 정리한다."""
    tag_names = [tag_link.tag.name for tag_link in post.tag_links if tag_link.tag is not None]
    return {
        "task": "이 게임 아이디어를 분석한다.",
        "post": {
            "id": post.id,
            "title": post.title,
            "content": post.content,
            "genre": post.genre,
            "core_fun": post.core_fun,
            "platform": post.platform,
            "difficulty": post.difficulty,
            "tags": tag_names,
            "source_url": post.source_url,
        },
    }


def extract_first_tool_call(message: dict[str, Any]) -> dict[str, Any] | None:
    """assistant 응답에서 첫 번째 function tool call만 꺼낸다."""
    tool_calls = message.get("tool_calls")
    if not isinstance(tool_calls, list) or not tool_calls:
        return None

    first_tool_call = tool_calls[0]
    if not isinstance(first_tool_call, dict):
        return None

    return first_tool_call


def build_assistant_tool_call_message(
    message: dict[str, Any],
    tool_call: dict[str, Any],
) -> dict[str, Any]:
    """OpenAI tool 메시지 규칙에 맞춰 assistant의 도구 호출 기록을 남긴다."""
    return {
        "role": "assistant",
        "content": message.get("content") or "",
        "tool_calls": [sanitize_tool_call(tool_call)],
    }


def build_tool_result_message(tool_call: dict[str, Any], tool_result: dict[str, Any]) -> dict[str, Any]:
    """도구 실행 결과를 다음 LLM 판단에 관찰값으로 전달한다."""
    return {
        "role": "tool",
        "tool_call_id": str(tool_call.get("id") or "tool_call"),
        "content": json.dumps(tool_result, ensure_ascii=False),
    }


def sanitize_tool_call(tool_call: dict[str, Any]) -> dict[str, Any]:
    """응답으로 받은 tool_call 중 다음 요청에 필요한 필드만 보존한다."""
    function_payload = tool_call.get("function") if isinstance(tool_call.get("function"), dict) else {}
    return {
        "id": str(tool_call.get("id") or "tool_call"),
        "type": tool_call.get("type") or "function",
        "function": {
            "name": function_payload.get("name"),
            "arguments": function_payload.get("arguments") or "{}",
        },
    }


async def execute_agent_tool(
    db: Session,
    user: User,
    post: Post,
    api_key: str,
    settings: Settings,
    tool_call: dict[str, Any],
) -> dict[str, Any]:
    """LLM이 고른 도구 이름과 인자를 실제 RAG/MCP 서비스 호출로 연결한다."""
    tool_name, arguments, parse_error = parse_tool_call(tool_call)
    if parse_error is not None:
        return build_tool_error(tool_name, parse_error)

    try:
        if tool_name == "rag_search_posts":
            data = run_rag_search_tool(db, post, api_key, settings, arguments)
        elif tool_name.startswith("mcp_"):
            data = await run_mcp_tool(settings, tool_name, arguments)
        else:
            return build_tool_error(tool_name, "unknown_agent_tool")
    except HTTPException as error:
        return build_tool_error(tool_name, str(error.detail))
    except McpClientError as error:
        return build_tool_error(tool_name, f"mcp_call_failed: {error}")

    return {
        "name": tool_name,
        "ok": True,
        "data": data,
    }


def parse_tool_call(tool_call: dict[str, Any]) -> tuple[str, dict[str, Any], str | None]:
    """tool_call의 function name과 JSON arguments를 읽기 쉬운 값으로 바꾼다."""
    function_payload = tool_call.get("function") if isinstance(tool_call.get("function"), dict) else None
    if function_payload is None:
        return "invalid_tool_call", {}, "tool_function_required"

    tool_name = function_payload.get("name")
    if not isinstance(tool_name, str) or not tool_name:
        return "invalid_tool_call", {}, "tool_name_required"

    raw_arguments = function_payload.get("arguments") or "{}"
    if isinstance(raw_arguments, dict):
        return tool_name, raw_arguments, None
    if not isinstance(raw_arguments, str):
        return tool_name, {}, "tool_arguments_invalid"

    try:
        arguments = json.loads(raw_arguments)
    except ValueError:
        return tool_name, {}, "tool_arguments_invalid_json"

    if not isinstance(arguments, dict):
        return tool_name, {}, "tool_arguments_object_required"

    return tool_name, arguments, None


def run_rag_search_tool(
    db: Session,
    post: Post,
    api_key: str,
    settings: Settings,
    arguments: dict[str, Any],
) -> dict[str, Any]:
    """Agent가 선택한 RAG 검색 도구를 LLM 생성 없이 벡터 검색만 실행한다."""
    title = read_text_argument(arguments, "title") or post.title
    items = rag.retrieve_related_posts_with_api_key(db, api_key, title, settings)
    return {
        "title": title,
        "items": [item.model_dump() for item in items],
    }


async def run_mcp_tool(settings: Settings, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """Agent MCP 도구 이름을 실제 Video Games MCP Server 도구 호출로 매핑한다."""
    client = await similar_games.get_video_games_client(settings)
    limit = read_limit_argument(arguments, default=AGENT_TOOL_RESULT_LIMIT)

    if tool_name == "mcp_list_genres":
        payload = await client.call_tool("list_genres", {})
        similar_games.raise_for_mcp_payload_error(payload)
        return {"items": compact_mcp_items(payload, limit=20)}

    if tool_name == "mcp_search_game_by_title":
        title = read_text_argument(arguments, "title")
        if title is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="tool_title_required")
        payload = await client.call_tool("search_game_by_title", {"title": title, "limit": limit})
        similar_games.raise_for_mcp_payload_error(payload)
        return {"items": normalize_game_payload(payload, limit)}

    if tool_name == "mcp_get_popular_games":
        popular_arguments: dict[str, Any] = {"limit": limit}
        genre = read_text_argument(arguments, "genre")
        if genre:
            popular_arguments["genre"] = genre
        payload = await client.call_tool("get_popular_games", popular_arguments)
        similar_games.raise_for_mcp_payload_error(payload)
        return {"items": normalize_game_payload(payload, limit)}

    if tool_name == "mcp_get_game_details":
        game_id = arguments.get("game_id")
        if not isinstance(game_id, int):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="tool_game_id_required")
        payload = await client.call_tool("get_game_details", {"game_id": game_id})
        similar_games.raise_for_mcp_payload_error(payload)
        return {"detail": compact_mcp_payload(payload)}

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unknown_mcp_tool")


def normalize_game_payload(payload: Any, limit: int) -> list[dict[str, Any]]:
    """MCP 게임 응답을 Agent 관찰에 필요한 화면용 필드로 줄인다."""
    return [item.model_dump() for item in similar_games.normalize_game_items(payload)[:limit]]


def compact_mcp_items(payload: Any, limit: int) -> list[Any]:
    """장르처럼 임의 구조의 MCP 목록을 너무 길지 않은 JSON 관찰값으로 줄인다."""
    return [compact_mcp_payload(item) for item in similar_games.normalize_sequence(payload)[:limit]]


def compact_mcp_payload(payload: Any) -> Any:
    """MCP 응답 중 LLM 관찰값으로 전달 가능한 JSON 값만 재귀적으로 남긴다."""
    if isinstance(payload, dict):
        compacted: dict[str, Any] = {}
        for key, value in payload.items():
            if key in {"description", "description_raw"}:
                continue
            compacted[str(key)] = compact_mcp_payload(value)
        return compacted

    if isinstance(payload, list):
        return [compact_mcp_payload(item) for item in payload[:AGENT_TOOL_RESULT_LIMIT]]

    if isinstance(payload, (str, int, float, bool)) or payload is None:
        return payload

    return str(payload)


def read_text_argument(arguments: dict[str, Any], name: str) -> str | None:
    """도구 인자에서 빈 문자열을 제외한 텍스트 값을 읽는다."""
    value = arguments.get(name)
    if not isinstance(value, str):
        return None

    cleaned_value = value.strip()
    return cleaned_value or None


def read_limit_argument(arguments: dict[str, Any], default: int) -> int:
    """LLM이 준 limit 값을 Agent가 허용하는 1~5 범위로 제한한다."""
    value = arguments.get("limit")
    if not isinstance(value, int):
        return default

    return max(1, min(value, AGENT_TOOL_RESULT_LIMIT))


def parse_final_review_or_none(
    assistant_message: dict[str, Any],
    steps: list[AgentStepResult],
) -> AgentReviewResponse | None:
    """도구 호출 없이 온 assistant 응답이 최종 리뷰 JSON이면 그대로 사용한다."""
    content = assistant_message.get("content")
    if not isinstance(content, str) or not content.strip():
        steps.append(AgentStepResult(name="final_review", ok=False, data={"detail": "empty_final_response"}))
        return None

    try:
        review = llm.parse_agent_review_response(content)
    except HTTPException as error:
        steps.append(AgentStepResult(name="final_review", ok=False, data={"detail": error.detail}))
        return None

    steps.append(AgentStepResult(name="final_review", ok=True, data={"source": "agent_turn"}))
    return review


def build_tool_error(tool_name: str, detail: str) -> dict[str, Any]:
    """실패한 도구 호출도 Agent가 관찰하고 다음 판단을 할 수 있게 JSON으로 만든다."""
    return {
        "name": tool_name,
        "ok": False,
        "data": {
            "detail": detail,
        },
    }


def save_agent_result(
    db: Session,
    post: Post,
    user: User,
    review: AgentReviewResponse,
    steps: list[AgentStepResult],
    model_name: str,
) -> None:
    """Agent 리뷰 성공 결과와 도구 실행 기록을 ai_analysis_results에 저장한다."""
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
