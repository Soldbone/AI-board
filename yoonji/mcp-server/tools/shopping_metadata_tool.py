from __future__ import annotations

import html
import os
import re
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urlparse

from pydantic import ValidationError

from clients.http_client import AsyncHttpClient, ExternalHttpError
from clients.naver_shopping_client import (
    NaverShoppingClient,
    NaverShoppingClientError,
)
from schemas.tool_schema import (
    ProductCandidate,
    ProductMetadata,
    ProductMetadataRequest,
    ProductMetadataResponse,
    SearchProductsRequest,
    SearchProductsResponse,
    ToolError,
)


OFFICIAL_SMARTSTORE_HOST = "smartstore.naver.com"
DEFAULT_GSC_SMARTSTORE_CHANNEL = "gsc_korea_dt_bh"


def get_gsc_smartstore_channel() -> str:
    channel = os.getenv("GSC_SMARTSTORE_CHANNEL", DEFAULT_GSC_SMARTSTORE_CHANNEL)
    return channel.strip().strip("/") or DEFAULT_GSC_SMARTSTORE_CHANNEL


def is_gsc_smartstore_url(product_url: str) -> bool:
    parsed_url = urlparse(product_url.strip())
    channel_path = f"/{get_gsc_smartstore_channel()}"

    return (
        parsed_url.scheme == "https"
        and parsed_url.netloc.lower() == OFFICIAL_SMARTSTORE_HOST
        and (
            parsed_url.path == channel_path
            or parsed_url.path.startswith(f"{channel_path}/")
        )
    )


def strip_html_tags(value: str | None) -> str:
    if not value:
        return ""

    without_tags = re.sub(r"<[^>]+>", " ", value)
    return html.unescape(" ".join(without_tags.split()))


def normalize_product_title(value: str | None) -> str:
    cleaned = strip_html_tags(value)
    return re.sub(r"\s+", " ", cleaned).strip()


def _to_optional_int(value: Any) -> int | None:
    if value in (None, ""):
        return None

    try:
        parsed = int(str(value).replace(",", "").strip())
    except ValueError:
        return None

    return parsed if parsed > 0 else None


def _tool_error(code: str, message: str, details: dict | None = None) -> ToolError:
    return ToolError(code=code, message=message, details=details)


def _validation_error(exc: ValidationError) -> ToolError:
    return _tool_error(
        "INVALID_TOOL_INPUT",
        "Tool input validation failed.",
        {"errors": exc.errors(include_url=False)},
    )


def _candidate_from_naver_item(item: dict[str, Any]) -> ProductCandidate | None:
    link = str(item.get("link") or "").strip()
    if not is_gsc_smartstore_url(link):
        return None

    title = strip_html_tags(str(item.get("title") or ""))
    return ProductCandidate(
        title=title,
        normalized_title=normalize_product_title(title),
        link=link,
        image=item.get("image") or None,
        lprice=_to_optional_int(item.get("lprice")),
        hprice=_to_optional_int(item.get("hprice")),
        mall_name=item.get("mallName") or None,
        product_id=str(item.get("productId") or "") or None,
        product_type=str(item.get("productType") or "") or None,
        maker=item.get("maker") or None,
        brand=item.get("brand") or None,
        category1=item.get("category1") or None,
        category2=item.get("category2") or None,
        category3=item.get("category3") or None,
        category4=item.get("category4") or None,
    )


async def search_gsc_smartstore_products(
    query: str,
    display: int = 10,
    sort: str = "sim",
) -> SearchProductsResponse:
    """Search Naver Shopping and keep only official GSC SmartStore URLs."""

    try:
        request = SearchProductsRequest(query=query, display=display, sort=sort)
    except ValidationError as exc:
        return SearchProductsResponse(
            ok=False,
            query=query,
            error=_validation_error(exc),
        )

    client = NaverShoppingClient()

    try:
        result = await client.search_products(
            query=request.query,
            display=request.display,
            sort=request.sort,
        )
    except NaverShoppingClientError as exc:
        return SearchProductsResponse(
            ok=False,
            query=request.query,
            display=request.display,
            error=_tool_error(exc.code, exc.message, exc.details),
        )

    raw_items = result.get("items", [])
    if not isinstance(raw_items, list):
        raw_items = []

    candidates: list[ProductCandidate] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue

        candidate = _candidate_from_naver_item(item)
        if candidate is not None:
            candidates.append(candidate)

    return SearchProductsResponse(
        ok=True,
        query=request.query,
        total=int(result.get("total") or 0),
        display=int(result.get("display") or request.display),
        returned_count=len(candidates),
        discarded_count=max(len(raw_items) - len(candidates), 0),
        candidates=candidates,
    )


class _MetadataHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._in_title = False
        self.title_parts: list[str] = []
        self.meta_values: dict[str, str] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "title":
            self._in_title = True
            return

        if tag.lower() != "meta":
            return

        attr_map = {name.lower(): value for name, value in attrs if value is not None}
        key = (attr_map.get("property") or attr_map.get("name") or "").lower()
        content = attr_map.get("content")

        if key and content and key not in self.meta_values:
            self.meta_values[key] = html.unescape(content.strip())

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            cleaned = data.strip()
            if cleaned:
                self.title_parts.append(cleaned)

    @property
    def title(self) -> str | None:
        title = " ".join(self.title_parts).strip()
        return html.unescape(title) if title else None


def _pick_first(meta_values: dict[str, str], keys: list[str]) -> str | None:
    for key in keys:
        value = meta_values.get(key)
        if value:
            return value
    return None


def _parse_metadata(
    *,
    product_url: str,
    final_url: str | None,
    html_text: str,
) -> ProductMetadata:
    parser = _MetadataHTMLParser()
    parser.feed(html_text)

    meta_values = parser.meta_values
    title = _pick_first(meta_values, ["og:title", "twitter:title"]) or parser.title
    description = _pick_first(
        meta_values,
        ["og:description", "description", "twitter:description"],
    )
    image = _pick_first(meta_values, ["og:image", "twitter:image"])
    price_text = _pick_first(
        meta_values,
        ["product:price:amount", "og:price:amount", "twitter:data1"],
    )
    availability = _pick_first(
        meta_values,
        ["product:availability", "og:availability", "availability"],
    )

    return ProductMetadata(
        product_url=product_url,
        final_url=final_url,
        title=normalize_product_title(title),
        description=description,
        image=image,
        price=_to_optional_int(price_text),
        availability=availability,
    )


async def fetch_gsc_product_metadata(product_url: str) -> ProductMetadataResponse:
    """Fetch best-effort metadata from an official GSC SmartStore product URL."""

    try:
        request = ProductMetadataRequest(product_url=product_url)
    except ValidationError as exc:
        return ProductMetadataResponse(ok=False, error=_validation_error(exc))

    if not is_gsc_smartstore_url(request.product_url):
        return ProductMetadataResponse(
            ok=False,
            error=_tool_error(
                "WHITELIST_MISMATCH",
                (
                    "Only official Good Smile Company Korea SmartStore URLs are "
                    "allowed."
                ),
                {
                    "allowed_host": OFFICIAL_SMARTSTORE_HOST,
                    "allowed_channel": get_gsc_smartstore_channel(),
                },
            ),
        )

    http_client = AsyncHttpClient()

    try:
        response = await http_client.get_text(
            request.product_url,
            headers={"Accept": "text/html,application/xhtml+xml"},
        )
    except ExternalHttpError as exc:
        return ProductMetadataResponse(
            ok=False,
            error=_tool_error(
                "METADATA_FETCH_FAILED",
                "Could not fetch product metadata from the official SmartStore URL.",
                {
                    "http_error_code": exc.code,
                    "status_code": exc.status_code,
                    "response_text": exc.response_text,
                },
            ),
        )

    # A redirect outside the whitelist would make the metadata untrustworthy.
    if response.url and not is_gsc_smartstore_url(response.url):
        return ProductMetadataResponse(
            ok=False,
            error=_tool_error(
                "WHITELIST_MISMATCH_AFTER_REDIRECT",
                "The product URL redirected outside the official SmartStore channel.",
                {"final_url": response.url},
            ),
        )

    metadata = _parse_metadata(
        product_url=request.product_url,
        final_url=response.url,
        html_text=response.text,
    )
    return ProductMetadataResponse(ok=True, metadata=metadata)
