from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.models.enums import BoardCode, FigureTargetType, TagStatus
from app.models.post import Post
from app.models.post_figure_info import PostFigureInfo


BASE_AGENT_SYSTEM_PROMPT = """
You are a post-context agent for a figure collector community.
You may choose tools to gather evidence, then write the final answer in Korean.
Only answer inside the current post context.
Do not create a free-form site-wide Q&A flow.
Do not ask the user to paste URLs.
Do not present AI output as a user comment.
If evidence is insufficient, say that evidence is insufficient.
Use tool results as evidence; do not invent reviews, comments, product data, or prices.
""".strip()


BOARD_AGENT_GUIDANCE = {
    BoardCode.REVIEW: """
For REVIEW posts, use similar review retrieval when the user asks for related reviews.
Use MCP product search only for official product candidates.
Separate community review evidence from external product candidates.
""".strip(),
    BoardCode.QUESTION: """
For QUESTION posts, use past question/comment RAG context before answering.
Do not use product search for question reference answers.
""".strip(),
    BoardCode.PURCHASE_HELP: """
For PURCHASE_HELP posts, use REVIEW evidence before summarizing pros, cons, or recommendations.
You may use product search as supplemental candidate information, but do not pressure the user to buy.
""".strip(),
}


def build_system_prompt(board_code: BoardCode) -> str:
    board_guidance = BOARD_AGENT_GUIDANCE.get(board_code, "")
    return "\n\n".join(part for part in [BASE_AGENT_SYSTEM_PROMPT, board_guidance] if part)


def build_user_prompt(
    *,
    post: Post,
    user_message: str,
    top_k: int,
    include_mcp: bool,
) -> str:
    return "\n\n".join(
        [
            "Current post context:",
            _format_post_context(post),
            "User request:",
            user_message.strip(),
            "Runtime options:",
            f"- top_k: {top_k}",
            f"- include_mcp: {include_mcp}",
            "Instructions:",
            "- Choose only tools that are useful for this request.",
            "- If you use RAG chunks, cite the evidence in the answer text naturally.",
            "- If you use MCP product search, call the results product candidates.",
            "- If no useful evidence is returned, use the insufficient-evidence fallback.",
        ]
    )


def _format_post_context(post: Post) -> str:
    lines = [
        f"- post_id: {post.id}",
        f"- board_code: {post.board.code.value}",
        f"- board_name: {post.board.name}",
        f"- title: {post.title}",
        "- content:",
        post.content,
    ]

    figure_info = _primary_figure_info(post)
    if figure_info is not None:
        lines.extend(
            [
                "- figure_info:",
                f"  - figure_name: {figure_info.figure_name_text}",
                f"  - manufacturer: {figure_info.manufacturer_text or '-'}",
                f"  - figure_type: {_plain_value(figure_info.figure_type) or '-'}",
                f"  - price_amount: {_plain_value(figure_info.price_amount) or '-'}",
                f"  - price_range: {_plain_value(figure_info.price_range) or '-'}",
                f"  - satisfaction_score: {figure_info.satisfaction_score or '-'}",
            ]
        )

    tags = _active_tag_names(post)
    if tags:
        lines.append(f"- tags: {', '.join(tags)}")

    return "\n".join(lines)


def _primary_figure_info(post: Post) -> PostFigureInfo | None:
    for figure_info in post.figure_infos:
        if figure_info.target_type == FigureTargetType.REVIEW_TARGET:
            return figure_info

    return post.figure_infos[0] if post.figure_infos else None


def _active_tag_names(post: Post) -> list[str]:
    names: list[str] = []

    for tag_link in post.tag_links:
        tag = tag_link.tag
        if tag is not None and tag.status == TagStatus.ACTIVE:
            names.append(tag.name)

    return sorted(names)


def _plain_value(value: Any) -> Any:
    if value is None:
        return None

    if isinstance(value, Decimal):
        return str(value)

    enum_value = getattr(value, "value", None)
    if enum_value is not None:
        return enum_value

    return value

