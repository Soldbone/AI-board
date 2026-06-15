from __future__ import annotations

import html
import re
import unicodedata
from decimal import Decimal
from urllib.parse import urlparse

from app.models.enums import FigureType, PriceRange


OFFICIAL_SMARTSTORE_HOST = "smartstore.naver.com"
DEFAULT_GSC_SMARTSTORE_CHANNEL = "gsc_korea_dt_bh"

GENERIC_TOKENS = {
    "good",
    "smile",
    "company",
    "gsc",
    "굿스마일",
    "굿스마일컴퍼니",
    "피규어",
    "figure",
    "완성품",
    "예약",
    "특전",
    "공식",
    "정품",
    "재판",
    "초판",
}

PRODUCT_LINE_ALIASES = {
    "NENDOROID": {"nendoroid", "nendo", "넨도로이드", "넨도"},
    "FIGMA": {"figma", "피그마"},
    "SCALE": {"scale", "스케일", "1/4", "1/6", "1/7", "1/8"},
    "ACTION_FIGURE": {"action", "액션피규어", "액션"},
    "PRIZE": {"prize", "경품", "프라이즈"},
    "GARAGE_KIT": {"garage", "kit", "개러지", "레진"},
}


def normalize_text(value: str | None) -> str:
    if not value:
        return ""

    normalized = unicodedata.normalize("NFKC", html.unescape(value))
    normalized = re.sub(r"<[^>]+>", " ", normalized)
    normalized = normalized.lower()
    normalized = re.sub(r"[^0-9a-z가-힣ぁ-んァ-ン一-龥/]+", " ", normalized)
    return " ".join(normalized.split())


def tokenize(value: str | None) -> list[str]:
    tokens = normalize_text(value).split()
    return [token for token in tokens if _is_meaningful_token(token)]


def core_figure_tokens(value: str | None) -> list[str]:
    line_tokens = set().union(*PRODUCT_LINE_ALIASES.values())
    return [
        token
        for token in tokenize(value)
        if token not in GENERIC_TOKENS and token not in line_tokens
    ]


def detect_product_line(*values: str | None) -> str | None:
    combined = normalize_text(" ".join(value or "" for value in values))

    for line_name, aliases in PRODUCT_LINE_ALIASES.items():
        if any(alias in combined for alias in aliases):
            return line_name

    return None


def normalize_figure_type(figure_type: FigureType | str | None) -> str | None:
    if figure_type is None:
        return None

    value = figure_type.value if isinstance(figure_type, FigureType) else str(figure_type)
    return value if value in PRODUCT_LINE_ALIASES else None


def is_official_gsc_smartstore_url(product_url: str | None, *, channel: str) -> bool:
    if not product_url:
        return False

    parsed_url = urlparse(product_url.strip())
    channel_path = f"/{channel.strip().strip('/')}"

    return (
        parsed_url.scheme == "https"
        and parsed_url.netloc.lower() == OFFICIAL_SMARTSTORE_HOST
        and (
            parsed_url.path == channel_path
            or parsed_url.path.startswith(f"{channel_path}/")
        )
    )


def candidate_text(candidate: dict) -> str:
    values = [
        candidate.get("title"),
        candidate.get("normalized_title"),
        candidate.get("mall_name"),
        candidate.get("maker"),
        candidate.get("brand"),
        candidate.get("category1"),
        candidate.get("category2"),
        candidate.get("category3"),
        candidate.get("category4"),
    ]
    return normalize_text(" ".join(str(value) for value in values if value))


def candidate_price_amount(candidate: dict) -> Decimal | None:
    for key in ("lprice", "price", "hprice"):
        value = candidate.get(key)
        amount = _to_decimal(value)
        if amount is not None and amount > 0:
            return amount

    metadata = candidate.get("metadata")
    if isinstance(metadata, dict):
        return _to_decimal(metadata.get("price"))

    return None


def amount_to_price_range(amount: Decimal | None) -> PriceRange:
    if amount is None:
        return PriceRange.UNKNOWN

    if amount < Decimal("30000"):
        return PriceRange.UNDER_30000
    if amount < Decimal("50000"):
        return PriceRange.PRICE_30000_50000
    if amount < Decimal("100000"):
        return PriceRange.PRICE_50000_100000
    if amount < Decimal("200000"):
        return PriceRange.PRICE_100000_200000
    return PriceRange.OVER_200000


def price_ranges_are_near(left: PriceRange | str | None, right: PriceRange | str | None) -> bool:
    left_value = _price_range_value(left)
    right_value = _price_range_value(right)

    if left_value is None or right_value is None:
        return False

    if PriceRange.UNKNOWN in {left_value, right_value}:
        return False

    order = [
        PriceRange.UNDER_30000,
        PriceRange.PRICE_30000_50000,
        PriceRange.PRICE_50000_100000,
        PriceRange.PRICE_100000_200000,
        PriceRange.OVER_200000,
    ]
    return abs(order.index(left_value) - order.index(right_value)) <= 1


def _is_meaningful_token(token: str) -> bool:
    if not token or token in GENERIC_TOKENS:
        return False

    return len(token) >= 2 or token.isdigit()


def _to_decimal(value) -> Decimal | None:
    if value in (None, ""):
        return None

    try:
        return Decimal(str(value).replace(",", "").strip())
    except Exception:
        return None


def _price_range_value(value: PriceRange | str | None) -> PriceRange | None:
    if value is None:
        return None

    if isinstance(value, PriceRange):
        return value

    try:
        return PriceRange(str(value))
    except ValueError:
        return None
