from __future__ import annotations

from dataclasses import dataclass, field
import json
from typing import Any

from sqlalchemy.orm import Session

from app.ai.agent.agent_client import (
    AgentClientError,
    AgentToolCall,
    get_agent_client,
)
from app.ai.agent.prompts import build_system_prompt, build_user_prompt
from app.ai.agent.tool_schemas import tool_schemas_for_board
from app.ai.agent.tools import (
    FALLBACK_NO_EVIDENCE_ANSWER,
    AgentToolResult,
    execute_agent_tool,
)
from app.models.enums import GroundingStatus
from app.models.post import Post


MAX_AGENT_STEPS = 4


class AgentRunError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        trace: list[dict[str, Any]] | None = None,
        mcp_sources: list[dict[str, Any]] | None = None,
        cause: BaseException | None = None,
    ) -> None:
        super().__init__(message)
        self.trace = trace or []
        self.mcp_sources = mcp_sources or []
        self.cause = cause


@dataclass
class AgentRunResult:
    content: str
    grounding_status: GroundingStatus
    confidence_score: float | None
    model_name: str
    source_values: list[dict[str, Any]] = field(default_factory=list)
    agent_trace: list[dict[str, Any]] = field(default_factory=list)
    mcp_sources: list[dict[str, Any]] = field(default_factory=list)


def run_post_context_agent(
    db: Session,
    *,
    post: Post,
    user_message: str,
    top_k: int,
    include_mcp: bool,
) -> AgentRunResult:
    input_messages: list[dict[str, Any]] = [
        {
            "role": "system",
            "content": build_system_prompt(post.board.code),
        },
        {
            "role": "user",
            "content": build_user_prompt(
                post=post,
                user_message=user_message,
                top_k=top_k,
                include_mcp=include_mcp,
            ),
        },
    ]
    tools = tool_schemas_for_board(post.board.code, include_mcp=include_mcp)
    source_values: list[dict[str, Any]] = []
    agent_trace: list[dict[str, Any]] = []
    mcp_sources: list[dict[str, Any]] = []
    saw_successful_tool = False
    saw_tool_error = False
    last_model_name = ""

    for step in range(1, MAX_AGENT_STEPS + 1):
        try:
            model_response = get_agent_client().create_response(
                input_messages=input_messages,
                tools=tools,
            )
        except AgentClientError as exc:
            raise AgentRunError(
                str(exc),
                trace=agent_trace,
                mcp_sources=mcp_sources,
                cause=exc,
            ) from exc

        last_model_name = model_response.model_name

        if not model_response.tool_calls:
            if saw_tool_error and not saw_successful_tool:
                raise AgentRunError(
                    "All agent tool calls failed before a final answer was produced.",
                    trace=agent_trace,
                    mcp_sources=mcp_sources,
                )

            content = model_response.content.strip()
            if not content:
                content = _fallback_content(
                    source_values=source_values,
                    saw_successful_tool=saw_successful_tool,
                )

            return AgentRunResult(
                content=content,
                grounding_status=_resolve_grounding_status(
                    source_values=source_values,
                    saw_successful_tool=saw_successful_tool,
                ),
                confidence_score=_estimate_confidence(source_values),
                model_name=model_response.model_name,
                source_values=_deduplicate_sources(source_values),
                agent_trace=agent_trace,
                mcp_sources=mcp_sources,
            )

        for tool_call in model_response.tool_calls:
            input_messages.append(tool_call.to_response_input())
            tool_result = execute_agent_tool(
                db,
                post=post,
                tool_name=tool_call.name,
                arguments=tool_call.arguments,
                top_k=top_k,
                include_mcp=include_mcp,
            )
            agent_trace.append(tool_result.to_trace_entry(step=step))

            if tool_result.ok:
                saw_successful_tool = saw_successful_tool or tool_result.has_evidence
            else:
                saw_tool_error = True

            source_values.extend(tool_result.source_values)
            mcp_sources.extend(tool_result.mcp_sources)
            input_messages.append(_tool_output_message(tool_call, tool_result))

    if not saw_successful_tool and saw_tool_error:
        raise AgentRunError(
            "All agent tool calls failed before a final answer was produced.",
            trace=agent_trace,
            mcp_sources=mcp_sources,
        )

    return AgentRunResult(
        content=_fallback_content(
            source_values=source_values,
            saw_successful_tool=saw_successful_tool,
        ),
        grounding_status=_resolve_grounding_status(
            source_values=source_values,
            saw_successful_tool=saw_successful_tool,
        ),
        confidence_score=_estimate_confidence(source_values),
        model_name=last_model_name,
        source_values=_deduplicate_sources(source_values),
        agent_trace=[
            *agent_trace,
            {
                "step": MAX_AGENT_STEPS,
                "event": "MAX_AGENT_STEPS_REACHED",
                "ok": False,
            },
        ],
        mcp_sources=mcp_sources,
    )


def _tool_output_message(
    tool_call: AgentToolCall,
    tool_result: AgentToolResult,
) -> dict[str, Any]:
    return {
        "type": "function_call_output",
        "call_id": tool_call.call_id,
        "output": json.dumps(tool_result.output, ensure_ascii=False),
    }


def _fallback_content(
    *,
    source_values: list[dict[str, Any]],
    saw_successful_tool: bool,
) -> str:
    if source_values or saw_successful_tool:
        return (
            "도구 실행 결과는 확인했지만 최종 답변 생성이 완료되지 않았습니다. "
            "아래 근거를 참고해 주세요."
        )

    return FALLBACK_NO_EVIDENCE_ANSWER


def _resolve_grounding_status(
    *,
    source_values: list[dict[str, Any]],
    saw_successful_tool: bool,
) -> GroundingStatus:
    if len(source_values) >= 3:
        return GroundingStatus.GROUNDED

    if source_values or saw_successful_tool:
        return GroundingStatus.PARTIALLY_GROUNDED

    return GroundingStatus.NO_EVIDENCE


def _estimate_confidence(source_values: list[dict[str, Any]]) -> float | None:
    scores = [
        float(source["relevance_score"])
        for source in source_values
        if isinstance(source.get("relevance_score"), int | float)
    ]

    if not scores:
        return None

    average = sum(scores) / len(scores)
    return round(max(0.0, min(average, 1.0)), 4)


def _deduplicate_sources(
    source_values: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    deduplicated: list[dict[str, Any]] = []
    seen_keys: set[tuple[Any, Any, Any]] = set()

    for source in source_values:
        key = (
            source.get("content_chunk_id"),
            source.get("source_post_id"),
            source.get("source_comment_id"),
        )
        if key in seen_keys:
            continue

        seen_keys.add(key)
        deduplicated.append(
            {
                **source,
                "rank_order": len(deduplicated) + 1,
            }
        )

    return deduplicated
