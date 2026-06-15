from __future__ import annotations

from app.models.enums import BoardCode


RAG_QUESTION_CONTEXT_TOOL = {
    "type": "function",
    "name": "rag_question_context",
    "description": (
        "Find related past QUESTION posts and comments for the current "
        "question post. Use this before answering a question post."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "post_id": {
                "type": "integer",
                "description": "The current post id. The server only allows the current post.",
            },
            "top_k": {
                "type": "integer",
                "minimum": 1,
                "maximum": 20,
                "description": "Maximum number of chunks to retrieve.",
            },
        },
        "required": ["post_id"],
        "additionalProperties": False,
    },
}


RAG_PURCHASE_REVIEW_CONTEXT_TOOL = {
    "type": "function",
    "name": "rag_purchase_review_context",
    "description": (
        "Find REVIEW chunks that can support a PURCHASE_HELP answer. "
        "Use this before summarizing purchase pros, cons, or recommendations."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "post_id": {
                "type": "integer",
                "description": "The current post id. The server only allows the current post.",
            },
            "top_k": {
                "type": "integer",
                "minimum": 1,
                "maximum": 20,
                "description": "Maximum number of review chunks to retrieve.",
            },
            "include_similar_price_range": {
                "type": "boolean",
                "description": "Whether similar price range reviews may be used.",
            },
        },
        "required": ["post_id"],
        "additionalProperties": False,
    },
}


RAG_SIMILAR_REVIEW_POSTS_TOOL = {
    "type": "function",
    "name": "rag_similar_review_posts",
    "description": (
        "Find review posts similar to the current REVIEW post. "
        "Use this when the user asks for similar reviews."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "post_id": {
                "type": "integer",
                "description": "The current post id. The server only allows the current post.",
            },
            "limit": {
                "type": "integer",
                "minimum": 1,
                "maximum": 10,
                "description": "Maximum number of similar review posts.",
            },
        },
        "required": ["post_id"],
        "additionalProperties": False,
    },
}


MCP_GSC_PRODUCT_SEARCH_TOOL = {
    "type": "function",
    "name": "mcp_gsc_product_search",
    "description": (
        "Search official Good Smile Company Korea SmartStore product candidates. "
        "Treat results as candidates, not verified final truth."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200,
                "description": "Product search query derived from the current post context.",
            },
            "display": {
                "type": "integer",
                "minimum": 1,
                "maximum": 10,
                "description": "Maximum number of candidates to return.",
            },
        },
        "required": ["query"],
        "additionalProperties": False,
    },
}


TOOLS_BY_NAME = {
    "rag_question_context": RAG_QUESTION_CONTEXT_TOOL,
    "rag_purchase_review_context": RAG_PURCHASE_REVIEW_CONTEXT_TOOL,
    "rag_similar_review_posts": RAG_SIMILAR_REVIEW_POSTS_TOOL,
    "mcp_gsc_product_search": MCP_GSC_PRODUCT_SEARCH_TOOL,
}


ALLOWED_TOOL_NAMES_BY_BOARD = {
    BoardCode.REVIEW: ["rag_similar_review_posts", "mcp_gsc_product_search"],
    BoardCode.QUESTION: ["rag_question_context"],
    BoardCode.PURCHASE_HELP: [
        "rag_purchase_review_context",
        "mcp_gsc_product_search",
    ],
}


def tool_schemas_for_board(
    board_code: BoardCode,
    *,
    include_mcp: bool,
) -> list[dict]:
    tool_names = list(ALLOWED_TOOL_NAMES_BY_BOARD.get(board_code, []))

    if not include_mcp:
        tool_names = [
            tool_name
            for tool_name in tool_names
            if not tool_name.startswith("mcp_")
        ]

    return [TOOLS_BY_NAME[tool_name] for tool_name in tool_names]

