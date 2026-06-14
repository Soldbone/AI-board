from html import unescape
import re
from urllib.parse import quote

import httpx

from config import get_settings


MAX_DISPLAY = 5


class NaverLocalSearchError(RuntimeError):
    pass


def build_search_query(region: str, keyword: str) -> str:
    region = region.strip()
    keyword = keyword.strip()

    if not region:
        raise ValueError("region is required.")
    if not keyword:
        raise ValueError("keyword is required.")

    return f"{region} {keyword}"


def build_naver_map_url(query: str) -> str:
    encoded_query = quote(query)
    return f"https://map.naver.com/p/search/{encoded_query}"


def _clean_html(value: str | None) -> str:
    if not value:
        return ""
    without_tags = re.sub(r"<[^>]+>", "", value)
    return unescape(without_tags).strip()


def _normalize_display(display: int) -> int:
    return min(max(display, 1), MAX_DISPLAY)


def _format_place(item: dict, fallback_query: str) -> dict:
    title = _clean_html(item.get("title"))
    road_address = _clean_html(item.get("roadAddress"))
    address = _clean_html(item.get("address"))
    category = _clean_html(item.get("category"))
    link = _clean_html(item.get("link"))

    map_query = " ".join(part for part in [road_address or address, title] if part)
    if not map_query:
        map_query = fallback_query

    return {
        "title": title,
        "category": category,
        "road_address": road_address,
        "address": address,
        "link": link,
        "naver_map_url": build_naver_map_url(map_query),
    }


async def search_local_places(
    region: str,
    keyword: str,
    display: int = MAX_DISPLAY,
) -> dict:
    query = build_search_query(region, keyword)
    settings = get_settings()
    normalized_display = _normalize_display(display)

    headers = {
        "X-Naver-Client-Id": settings.naver_client_id,
        "X-Naver-Client-Secret": settings.naver_client_secret,
    }
    params = {
        "query": query,
        "display": normalized_display,
        "start": 1,
        "sort": "comment",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                settings.naver_local_search_url,
                headers=headers,
                params=params,
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise NaverLocalSearchError(
            f"Naver local search failed: {exc.response.status_code}"
        ) from exc
    except httpx.HTTPError as exc:
        raise NaverLocalSearchError("Naver local search request failed.") from exc

    data = response.json()
    items = data.get("items", [])
    places = [_format_place(item, query) for item in items]

    return {
        "query": query,
        "display": normalized_display,
        "total": data.get("total", 0),
        "places": places,
        "fallback_map_url": build_naver_map_url(query),
    }
