from decimal import Decimal, InvalidOperation
from typing import Any

from app.models.enums import PriceRange


LEGACY_PRICE_RANGE_ALIASES = {
    PriceRange.UNDER_30000: PriceRange.PRICE_0_50000,
    PriceRange.PRICE_30000_50000: PriceRange.PRICE_0_50000,
    PriceRange.OVER_200000: PriceRange.PRICE_200000_500000,
}

PRICE_RANGE_ORDER = [
    PriceRange.PRICE_0_50000,
    PriceRange.PRICE_50000_100000,
    PriceRange.PRICE_100000_200000,
    PriceRange.PRICE_200000_500000,
    PriceRange.OVER_500000,
]


def amount_to_price_range(amount: Any) -> PriceRange:
    price_amount = _to_decimal(amount)

    if price_amount is None:
        return PriceRange.UNKNOWN

    if price_amount < 0:
        return PriceRange.UNKNOWN

    if price_amount < Decimal("50000"):
        return PriceRange.PRICE_0_50000

    if price_amount < Decimal("100000"):
        return PriceRange.PRICE_50000_100000

    if price_amount < Decimal("200000"):
        return PriceRange.PRICE_100000_200000

    if price_amount < Decimal("500000"):
        return PriceRange.PRICE_200000_500000

    return PriceRange.OVER_500000


def canonical_price_range(value: PriceRange | str | None) -> PriceRange | None:
    price_range = _price_range_value(value)

    if price_range is None:
        return None

    return LEGACY_PRICE_RANGE_ALIASES.get(price_range, price_range)


def price_ranges_are_same(
    left: PriceRange | str | None,
    right: PriceRange | str | None,
) -> bool:
    left_value = canonical_price_range(left)
    right_value = canonical_price_range(right)

    return (
        left_value is not None
        and right_value is not None
        and left_value != PriceRange.UNKNOWN
        and left_value == right_value
    )


def price_range_filter_values(value: PriceRange | str | None) -> list[PriceRange]:
    price_range = _price_range_value(value)
    canonical_value = canonical_price_range(price_range)

    if canonical_value is None:
        return []

    values = {canonical_value}

    for legacy_value, mapped_value in LEGACY_PRICE_RANGE_ALIASES.items():
        if mapped_value == canonical_value:
            values.add(legacy_value)

    return list(values)


def price_ranges_are_near(
    left: PriceRange | str | None,
    right: PriceRange | str | None,
) -> bool:
    left_value = canonical_price_range(left)
    right_value = canonical_price_range(right)

    if left_value is None or right_value is None:
        return False

    if PriceRange.UNKNOWN in {left_value, right_value}:
        return False

    return (
        abs(PRICE_RANGE_ORDER.index(left_value) - PRICE_RANGE_ORDER.index(right_value))
        <= 1
    )


def _to_decimal(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None

    try:
        return Decimal(str(value).replace(",", "").strip())
    except (InvalidOperation, ValueError):
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
