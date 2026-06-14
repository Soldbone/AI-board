from typing import Any

from mcp.server.fastmcp import FastMCP

from config import MissingConfigError
from naver_client import (
    NaverLocalSearchError,
    build_naver_map_url,
    build_search_query,
    search_local_places as fetch_local_places,
)


mcp = FastMCP("local-board-place-search")


def _fallback_query(region: str, keyword: str) -> str:
    parts = [region.strip(), keyword.strip()]
    return " ".join(part for part in parts if part)


def _error_response(
    code: str,
    message: str,
    region: str = "",
    keyword: str = "",
) -> dict[str, Any]:
    query = _fallback_query(region, keyword)
    fallback_map_url = build_naver_map_url(query) if query else ""

    return {
        "status": "error",
        "code": code,
        "message": message,
        "query": query,
        "places": [],
        "fallback_map_url": fallback_map_url,
    }


@mcp.tool()
async def health_check() -> dict[str, str]:
    """Check whether the local board MCP server is running."""
    return {
        "status": "ok",
        "service": "local-board-place-search",
    }


@mcp.tool()
async def make_map_search_url(region: str, keyword: str) -> dict[str, str]:
    """Create a Naver Map search URL from a region and keyword."""
    try:
        query = build_search_query(region, keyword)
    except ValueError as exc:
        return _error_response(
            code="INVALID_INPUT",
            message=str(exc),
            region=region,
            keyword=keyword,
        )

    return {
        "status": "ok",
        "query": query,
        "naver_map_url": build_naver_map_url(query),
    }


@mcp.tool()
async def search_local_places(
    region: str,
    keyword: str,
    display: int = 5,
) -> dict[str, Any]:
    """Search local places using Naver Local Search API."""
    try:
        result = await fetch_local_places(
            region=region,
            keyword=keyword,
            display=display,
        )
    except ValueError as exc:
        return _error_response(
            code="INVALID_INPUT",
            message=str(exc),
            region=region,
            keyword=keyword,
        )
    except MissingConfigError as exc:
        return _error_response(
            code="MISSING_CONFIG",
            message=str(exc),
            region=region,
            keyword=keyword,
        )
    except NaverLocalSearchError as exc:
        return _error_response(
            code="NAVER_API_ERROR",
            message=str(exc),
            region=region,
            keyword=keyword,
        )

    return {
        "status": "ok",
        **result,
    }


def main() -> None:
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
