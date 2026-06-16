from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from app.ai.rag.retriever import (
    RetrievedChunk,
    retrieve_purchase_summary_chunks,
    retrieve_question_reference_chunks,
)
from app.ai.usecases import similar_posts
from app.core.exceptions import AppException
from app.mcp.client import McpClientError, ProductMetadataMcpClient
from app.models.enums import BoardCode
from app.models.post import Post


FALLBACK_NO_EVIDENCE_ANSWER = "관련 게시글이나 댓글 근거가 부족해 답변을 생성할 수 없습니다."


@dataclass
class AgentToolResult:
    tool_name: str
    arguments: dict[str, Any]
    ok: bool
    output: dict[str, Any]
    source_values: list[dict[str, Any]] = field(default_factory=list)
    mcp_sources: list[dict[str, Any]] = field(default_factory=list)
    has_evidence: bool = False
    error_code: str | None = None
    error_message: str | None = None

    def to_trace_entry(self, *, step: int) -> dict[str, Any]:
        entry = {
            "step": step,
            "tool_name": self.tool_name,
            "arguments": self.arguments,
            "ok": self.ok,
            "result_summary": _summarize_output(self.output),
        }

        if self.error_code:
            entry["error_code"] = self.error_code

        if self.error_message:
            entry["error_message"] = self.error_message

        return entry


ALLOWED_TOOL_NAMES_BY_BOARD = {
    BoardCode.REVIEW: {"rag_similar_review_posts", "mcp_gsc_product_search"},
    BoardCode.QUESTION: {"rag_question_context"},
    BoardCode.PURCHASE_HELP: {
        "rag_purchase_review_context",
        "mcp_gsc_product_search",
    },
}


def execute_agent_tool(
    db: Session,
    *,
    post: Post,
    tool_name: str,
    arguments: dict[str, Any],
    top_k: int,
    include_mcp: bool,
) -> AgentToolResult:
    normalized_arguments = dict(arguments or {})

    if not _is_tool_allowed(
        board_code=post.board.code,
        tool_name=tool_name,
        include_mcp=include_mcp,
    ):
        return _error_result(
            tool_name=tool_name,
            arguments=normalized_arguments,
            code="TOOL_NOT_ALLOWED_FOR_BOARD",
            message=f"{tool_name} is not allowed for {post.board.code.value} posts.",
        )

    post_id_error = _validate_current_post_id(
        post=post,
        tool_name=tool_name,
        arguments=normalized_arguments,
    )
    if post_id_error is not None:
        return post_id_error

    try:
        if tool_name == "rag_question_context":
            return _rag_question_context(
                db,
                post=post,
                arguments=normalized_arguments,
                top_k=top_k,
            )

        if tool_name == "rag_purchase_review_context":
            return _rag_purchase_review_context(
                db,
                post=post,
                arguments=normalized_arguments,
                top_k=top_k,
            )

        if tool_name == "rag_similar_review_posts":
            return _rag_similar_review_posts(
                db,
                post=post,
                arguments=normalized_arguments,
            )

        if tool_name == "mcp_gsc_product_search":
            return _mcp_gsc_product_search(
                post=post,
                arguments=normalized_arguments,
            )
    except AppException as exc:
        return _error_result(
            tool_name=tool_name,
            arguments=normalized_arguments,
            code=exc.code,
            message=exc.message,
        )
    except McpClientError as exc:
        return _error_result(
            tool_name=tool_name,
            arguments=normalized_arguments,
            code=exc.code,
            message=exc.message,
            details=exc.details,
        )
    except Exception as exc:
        return _error_result(
            tool_name=tool_name,
            arguments=normalized_arguments,
            code="AGENT_TOOL_UNEXPECTED_ERROR",
            message=type(exc).__name__,
        )

    return _error_result(
        tool_name=tool_name,
        arguments=normalized_arguments,
        code="UNKNOWN_AGENT_TOOL",
        message=f"Unknown agent tool: {tool_name}",
    )


def _rag_question_context(
    db: Session,
    *,
    post: Post,
    arguments: dict[str, Any],
    top_k: int,
) -> AgentToolResult:
    requested_top_k = _clamp_int(arguments.get("top_k"), default=top_k, minimum=1, maximum=20)
    chunks = retrieve_question_reference_chunks(
        db,
        post=post,
        top_k=requested_top_k,
    )
    chunk_items = [_chunk_to_output(chunk) for chunk in chunks]

    return AgentToolResult(
        tool_name="rag_question_context",
        arguments={**arguments, "post_id": post.id, "top_k": requested_top_k},
        ok=True,
        output={
            "ok": True,
            "tool_name": "rag_question_context",
            "chunks": chunk_items,
        },
        source_values=[
            _chunk_to_source_value(chunk, rank_order=index)
            for index, chunk in enumerate(chunks, start=1)
        ],
        has_evidence=bool(chunks),
    )


def _rag_purchase_review_context(
    db: Session,
    *,
    post: Post,
    arguments: dict[str, Any],
    top_k: int,
) -> AgentToolResult:
    requested_top_k = _clamp_int(arguments.get("top_k"), default=top_k, minimum=1, maximum=20)
    include_similar_price_range = bool(
        arguments.get("include_similar_price_range", True)
    )
    chunks = retrieve_purchase_summary_chunks(
        db,
        post=post,
        top_k=requested_top_k,
        include_similar_price_range=include_similar_price_range,
    )
    chunk_items = [_chunk_to_output(chunk) for chunk in chunks]

    return AgentToolResult(
        tool_name="rag_purchase_review_context",
        arguments={
            **arguments,
            "post_id": post.id,
            "top_k": requested_top_k,
            "include_similar_price_range": include_similar_price_range,
        },
        ok=True,
        output={
            "ok": True,
            "tool_name": "rag_purchase_review_context",
            "chunks": chunk_items,
        },
        source_values=[
            _chunk_to_source_value(chunk, rank_order=index)
            for index, chunk in enumerate(chunks, start=1)
        ],
        has_evidence=bool(chunks),
    )


def _rag_similar_review_posts(
    db: Session,
    *,
    post: Post,
    arguments: dict[str, Any],
) -> AgentToolResult:
    limit = _clamp_int(arguments.get("limit"), default=3, minimum=1, maximum=10)
    response = similar_posts.get_similar_review_posts(
        db,
        post_id=post.id,
        limit=limit,
    )
    items = [item.model_dump(mode="json") for item in response.items]

    return AgentToolResult(
        tool_name="rag_similar_review_posts",
        arguments={**arguments, "post_id": post.id, "limit": limit},
        ok=True,
        output={
            "ok": True,
            "tool_name": "rag_similar_review_posts",
            "items": items,
        },
        has_evidence=bool(items),
    )


def _mcp_gsc_product_search(
    *,
    post: Post,
    arguments: dict[str, Any],
) -> AgentToolResult:
    query = str(arguments.get("query") or "").strip() or _build_product_query(post)
    display = _clamp_int(arguments.get("display"), default=5, minimum=1, maximum=10)
    client = ProductMetadataMcpClient()
    search_result = client.search_gsc_smartstore_products(
        query=query,
        display=display,
        sort="sim",
    )

    candidates = _safe_candidate_list(search_result.get("candidates"))
    limited_candidates = candidates[:display]
    source_entry = {
        "tool_name": "mcp_gsc_product_search",
        "query": query,
        "candidates": limited_candidates,
        "returned_count": search_result.get("returned_count", len(limited_candidates)),
    }

    return AgentToolResult(
        tool_name="mcp_gsc_product_search",
        arguments={**arguments, "query": query, "display": display},
        ok=bool(search_result.get("ok", False)),
        output={
            "ok": bool(search_result.get("ok", False)),
            "tool_name": "mcp_gsc_product_search",
            "query": query,
            "candidates": limited_candidates,
            "error": search_result.get("error"),
        },
        mcp_sources=[source_entry] if limited_candidates else [],
        has_evidence=bool(limited_candidates),
        error_code=(
            None
            if search_result.get("ok", False)
            else str((search_result.get("error") or {}).get("code") or "MCP_TOOL_ERROR")
        ),
        error_message=(
            None
            if search_result.get("ok", False)
            else str(
                (search_result.get("error") or {}).get("message")
                or "MCP product search failed."
            )
        ),
    )


def _validate_current_post_id(
    *,
    post: Post,
    tool_name: str,
    arguments: dict[str, Any],
) -> AgentToolResult | None:
    requested_post_id = arguments.get("post_id", post.id)

    try:
        normalized_post_id = int(requested_post_id)
    except (TypeError, ValueError):
        return _error_result(
            tool_name=tool_name,
            arguments=arguments,
            code="INVALID_TOOL_POST_ID",
            message="Tool post_id must be the current post id.",
        )

    if normalized_post_id != post.id:
        return _error_result(
            tool_name=tool_name,
            arguments=arguments,
            code="TOOL_POST_ID_OUT_OF_SCOPE",
            message="Agent tools can only access the current post.",
        )

    return None


def _is_tool_allowed(
    *,
    board_code: BoardCode,
    tool_name: str,
    include_mcp: bool,
) -> bool:
    if tool_name.startswith("mcp_") and not include_mcp:
        return False

    return tool_name in ALLOWED_TOOL_NAMES_BY_BOARD.get(board_code, set())


def _chunk_to_output(chunk: RetrievedChunk) -> dict[str, Any]:
    return {
        "chunk_id": chunk.chunk_id,
        "post_id": chunk.post_id,
        "comment_id": chunk.comment_id,
        "score": round(chunk.score, 4),
        "metadata": chunk.metadata,
        "excerpt": _make_excerpt(chunk.chunk_text),
    }


def _chunk_to_source_value(
    chunk: RetrievedChunk,
    *,
    rank_order: int,
) -> dict[str, Any]:
    return {
        "content_chunk_id": chunk.chunk_id,
        "source_post_id": chunk.post_id,
        "source_comment_id": chunk.comment_id,
        "relevance_score": round(chunk.score, 4),
        "rank_order": rank_order,
        "excerpt": _make_excerpt(chunk.chunk_text),
    }


def _build_product_query(post: Post) -> str:
    parts: list[str] = []

    for figure_info in post.figure_infos:
        if figure_info.figure_name_text:
            parts.append(figure_info.figure_name_text)
        if figure_info.manufacturer_text:
            parts.append(figure_info.manufacturer_text)
        break

    parts.append(post.title)

    for tag_link in post.tag_links[:4]:
        tag = tag_link.tag
        if tag is not None:
            parts.append(tag.name)

    return " ".join(part.strip() for part in parts if part and part.strip())[:200]


def _safe_candidate_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []

    return [candidate for candidate in value if isinstance(candidate, dict)]


def _error_result(
    *,
    tool_name: str,
    arguments: dict[str, Any],
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> AgentToolResult:
    output = {
        "ok": False,
        "tool_name": tool_name,
        "error": {
            "code": code,
            "message": message,
        },
    }

    if details:
        output["error"]["details"] = details

    return AgentToolResult(
        tool_name=tool_name,
        arguments=arguments,
        ok=False,
        output=output,
        error_code=code,
        error_message=message,
    )


def _summarize_output(output: dict[str, Any]) -> str:
    if not output.get("ok", False):
        error = output.get("error") or {}
        return str(error.get("message") or "tool failed")

    if "chunks" in output:
        return f"{len(output.get('chunks') or [])} chunks returned"

    if "items" in output:
        return f"{len(output.get('items') or [])} similar posts returned"

    if "candidates" in output:
        return f"{len(output.get('candidates') or [])} product candidates returned"

    return "tool completed"


def _make_excerpt(text: str, *, max_length: int = 320) -> str:
    normalized = " ".join(text.split())

    if len(normalized) <= max_length:
        return normalized

    return f"{normalized[:max_length].rstrip()}..."


def _clamp_int(
    value: Any,
    *,
    default: int,
    minimum: int,
    maximum: int,
) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default

    return max(minimum, min(number, maximum))

