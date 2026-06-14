import json
import os
from pathlib import Path
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


LOCAL_BOARD_DIR = Path(__file__).resolve().parents[3]
MCP_SERVER_DIR = LOCAL_BOARD_DIR / "mcp_server"
MCP_SERVER_SCRIPT = MCP_SERVER_DIR / "server.py"


class McpClientError(RuntimeError):
    pass


def _get_mcp_python_path() -> str:
    env_python = os.getenv("MCP_SERVER_PYTHON")
    if env_python:
        return env_python

    candidates = [
        MCP_SERVER_DIR / ".venv" / "Scripts" / "python.exe",
        MCP_SERVER_DIR / ".venv" / "bin" / "python",
    ]

    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    raise McpClientError("MCP server python executable was not found.")


def get_mcp_stdio_server_config() -> dict[str, Any]:
    if not MCP_SERVER_SCRIPT.exists():
        raise McpClientError("MCP server.py was not found.")

    return {
        "transport": "stdio",
        "command": _get_mcp_python_path(),
        "args": [str(MCP_SERVER_SCRIPT)],
    }


def _extract_tool_payload(result: Any) -> dict[str, Any]:
    structured_content = getattr(result, "structuredContent", None)
    if structured_content is None:
        structured_content = getattr(result, "structured_content", None)

    if isinstance(structured_content, dict):
        return structured_content

    content_items = getattr(result, "content", [])
    if not content_items:
        raise McpClientError("MCP tool returned empty content.")

    first_item = content_items[0]
    text = getattr(first_item, "text", None)
    if not text:
        raise McpClientError("MCP tool returned unsupported content.")

    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise McpClientError("MCP tool returned invalid JSON.") from exc

    if not isinstance(payload, dict):
        raise McpClientError("MCP tool returned non-object JSON.")

    return payload


async def call_mcp_tool(tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    mcp_server_config = get_mcp_stdio_server_config()
    server_params = StdioServerParameters(
        command=mcp_server_config["command"],
        args=mcp_server_config["args"],
    )

    try:
        async with stdio_client(server_params) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                result = await session.call_tool(tool_name, arguments=arguments)
    except Exception as exc:
        raise McpClientError("Failed to call MCP tool.") from exc

    return _extract_tool_payload(result)


async def search_places_with_mcp(
    region: str,
    keyword: str,
    display: int = 5,
) -> dict[str, Any]:
    return await call_mcp_tool(
        "search_local_places",
        {
            "region": region,
            "keyword": keyword,
            "display": display,
        },
    )
