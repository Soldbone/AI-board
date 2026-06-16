from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

from tools.shopping_metadata_tool import (
    fetch_gsc_product_metadata,
    search_gsc_smartstore_products,
    search_naver_shopping_products,
)


SERVER_NAME = "Yoonji GSC SmartStore MCP"
MCP_SERVER_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = MCP_SERVER_ROOT.parent


load_dotenv(MCP_SERVER_ROOT / ".env")
load_dotenv(PROJECT_ROOT / ".env")


def _parse_port(value: str | None, default: int = 8765) -> int:
    if value is None:
        return default

    try:
        return int(value)
    except ValueError:
        return default


def create_mcp_server() -> FastMCP:
    """Create the MCP server and register Phase 1 tools.

    The server exposes only official Good Smile Company SmartStore lookup
    tools. Backend matching and persistence are intentionally left to later
    MCP phases so the MCP server stays focused on external data access.
    """

    mcp = FastMCP(
        SERVER_NAME,
        instructions=(
            "Search and fetch metadata only for the Good Smile Company Korea "
            "official Naver SmartStore channel. Do not treat returned products "
            "as verified matches; the backend service must re-check candidates."
        ),
        host=os.getenv("MCP_HOST", "127.0.0.1"),
        port=_parse_port(os.getenv("MCP_PORT"), 8765),
        streamable_http_path="/mcp",
        json_response=True,
        stateless_http=True,
        log_level=os.getenv("MCP_LOG_LEVEL", "WARNING"),
    )

    mcp.tool(
        name="search_gsc_smartstore_products",
        title="Search GSC SmartStore Products",
        description=(
            "Search Naver Shopping and return only candidates whose URL belongs "
            "to the official Good Smile Company Korea SmartStore channel."
        ),
    )(search_gsc_smartstore_products)

    mcp.tool(
        name="search_naver_shopping_products",
        title="Search Naver Shopping Products",
        description=(
            "Search Naver Shopping and return general product candidates with "
            "title, image, URL, price, mall, maker, brand, and category fields. "
            "Returned products are search candidates, not verified official pages."
        ),
    )(search_naver_shopping_products)

    mcp.tool(
        name="fetch_gsc_product_metadata",
        title="Fetch GSC Product Metadata",
        description=(
            "Fetch lightweight metadata from a whitelisted Good Smile Company "
            "Korea SmartStore product URL."
        ),
    )(fetch_gsc_product_metadata)

    return mcp


mcp = create_mcp_server()


def run_server() -> None:
    mcp.run(transport="streamable-http")
