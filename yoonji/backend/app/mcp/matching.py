from __future__ import annotations

import os
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from app.mcp.normalizer import (
    DEFAULT_GSC_SMARTSTORE_CHANNEL,
    amount_to_price_range,
    candidate_price_amount,
    candidate_text,
    core_figure_tokens,
    detect_product_line,
    is_official_gsc_smartstore_url,
    normalize_figure_type,
    normalize_text,
    price_ranges_are_near,
)
from app.models.enums import PriceRange, ProductMatchStatus


AUTO_VERIFY_MIN_SCORE = 0.82
AUTO_VERIFY_MIN_SCORE_GAP = 0.10
AUTO_VERIFY_MIN_IDENTITY_EVIDENCE = 2


@dataclass
class ProductMatchContext:
    post_title: str
    figure_name: str | None
    manufacturer: str | None
    figure_type: str | None
    price_amount: Decimal | None
    price_range: PriceRange | str | None
    tag_names: list[str] = field(default_factory=list)


@dataclass
class CandidateEvaluation:
    candidate: dict[str, Any]
    score: float
    identity_evidence_count: int
    reasons: list[dict[str, Any]]


@dataclass
class ProductMatchResult:
    match_status: ProductMatchStatus
    confidence_score: float | None
    matched_product: dict[str, Any] | None
    candidates: list[dict[str, Any]]
    match_reasons: list[dict[str, Any]]
    source_url: str | None


def match_product_candidates(
    *,
    context: ProductMatchContext,
    raw_candidates: list[dict[str, Any]],
    smartstore_channel: str | None = None,
) -> ProductMatchResult:
    channel = smartstore_channel or os.getenv(
        "GSC_SMARTSTORE_CHANNEL",
        DEFAULT_GSC_SMARTSTORE_CHANNEL,
    )

    evaluations = [
        _evaluate_candidate(context=context, candidate=candidate, channel=channel)
        for candidate in raw_candidates
    ]
    evaluations = [evaluation for evaluation in evaluations if evaluation is not None]
    evaluations.sort(key=lambda evaluation: evaluation.score, reverse=True)

    if not evaluations:
        return ProductMatchResult(
            match_status=ProductMatchStatus.NO_MATCH,
            confidence_score=None,
            matched_product=None,
            candidates=[],
            match_reasons=[
                {
                    "code": "NO_OFFICIAL_STORE_CANDIDATES",
                    "message": "공식 스마트스토어 URL을 통과한 후보가 없습니다.",
                }
            ],
            source_url=None,
        )

    top = evaluations[0]
    runner_up = evaluations[1] if len(evaluations) > 1 else None
    score_gap = top.score - runner_up.score if runner_up is not None else 1.0
    is_verified = (
        top.score >= AUTO_VERIFY_MIN_SCORE
        and top.identity_evidence_count >= AUTO_VERIFY_MIN_IDENTITY_EVIDENCE
        and score_gap >= AUTO_VERIFY_MIN_SCORE_GAP
    )

    candidates = [_candidate_with_score(evaluation) for evaluation in evaluations]

    if is_verified:
        matched_product = _candidate_with_score(top)
        return ProductMatchResult(
            match_status=ProductMatchStatus.VERIFIED,
            confidence_score=top.score,
            matched_product=matched_product,
            candidates=candidates,
            match_reasons=[
                *top.reasons,
                {
                    "code": "AUTO_VERIFIED",
                    "message": "자동 확정 조건을 모두 통과했습니다.",
                    "score_gap": round(score_gap, 4),
                },
            ],
            source_url=top.candidate.get("link"),
        )

    return ProductMatchResult(
        match_status=ProductMatchStatus.CANDIDATES_ONLY,
        confidence_score=top.score,
        matched_product=None,
        candidates=candidates,
        match_reasons=[
            *top.reasons,
            {
                "code": "AUTO_VERIFY_CONDITIONS_NOT_MET",
                "message": (
                    "공식 후보는 있지만 점수, 근거 수, 1위와 2위 점수 차이 중 "
                    "하나 이상이 자동 확정 조건에 미달했습니다."
                ),
                "score": round(top.score, 4),
                "identity_evidence_count": top.identity_evidence_count,
                "score_gap": round(score_gap, 4),
            },
        ],
        source_url=top.candidate.get("link"),
    )


def _evaluate_candidate(
    *,
    context: ProductMatchContext,
    candidate: dict[str, Any],
    channel: str,
) -> CandidateEvaluation | None:
    link = str(candidate.get("link") or "")
    if not is_official_gsc_smartstore_url(link, channel=channel):
        return None

    score = 0.20
    identity_evidence_count = 0
    reasons: list[dict[str, Any]] = [
        {
            "code": "OFFICIAL_SMARTSTORE_URL",
            "message": "굿스마일 공식 스마트스토어 URL whitelist를 통과했습니다.",
            "score_delta": 0.20,
        }
    ]

    candidate_body = candidate_text(candidate)
    score_delta, reason = _score_figure_name(context, candidate_body)
    if reason is not None:
        score += score_delta
        reasons.append(reason)
        if reason.get("identity_evidence"):
            identity_evidence_count += 1

    score_delta, reason = _score_product_line(context, candidate_body)
    if reason is not None:
        score += score_delta
        reasons.append(reason)
        if reason.get("identity_evidence"):
            identity_evidence_count += 1

    score_delta, reason = _score_series_tags(context, candidate_body)
    if reason is not None:
        score += score_delta
        reasons.append(reason)
        if reason.get("identity_evidence"):
            identity_evidence_count += 1

    score_delta, reason = _score_manufacturer(context, candidate)
    if reason is not None:
        score += score_delta
        reasons.append(reason)
        if reason.get("identity_evidence"):
            identity_evidence_count += 1

    score_delta, reason = _score_price_range(context, candidate)
    if reason is not None:
        score += score_delta
        reasons.append(reason)

    return CandidateEvaluation(
        candidate=candidate,
        score=round(max(min(score, 1.0), 0.0), 4),
        identity_evidence_count=identity_evidence_count,
        reasons=reasons,
    )


def _score_figure_name(
    context: ProductMatchContext,
    candidate_body: str,
) -> tuple[float, dict[str, Any] | None]:
    tokens = core_figure_tokens(context.figure_name)
    if not tokens:
        return 0.0, None

    matched_tokens = [token for token in tokens if token in candidate_body]
    if not matched_tokens:
        return 0.0, None

    ratio = len(matched_tokens) / len(tokens)
    score_delta = 0.12
    identity_evidence = False

    if ratio >= 0.75:
        score_delta = 0.34
        identity_evidence = True
    elif ratio >= 0.50 or len(matched_tokens) >= 2:
        score_delta = 0.24
        identity_evidence = True

    figure_name = normalize_text(context.figure_name)
    if figure_name and figure_name in candidate_body:
        score_delta += 0.08
        identity_evidence = True

    return score_delta, {
        "code": "FIGURE_NAME_TOKEN_MATCH",
        "message": "피규어명 핵심 토큰이 상품명과 일치합니다.",
        "matched_tokens": matched_tokens,
        "token_match_ratio": round(ratio, 4),
        "score_delta": round(score_delta, 4),
        "identity_evidence": identity_evidence,
    }


def _score_product_line(
    context: ProductMatchContext,
    candidate_body: str,
) -> tuple[float, dict[str, Any] | None]:
    expected_line = normalize_figure_type(context.figure_type)
    detected_line = detect_product_line(candidate_body)

    if expected_line is None or detected_line is None:
        return 0.0, None

    if expected_line == detected_line:
        return 0.22, {
            "code": "PRODUCT_LINE_MATCH",
            "message": "상품 라인이 후기의 피규어 타입과 일치합니다.",
            "expected_line": expected_line,
            "detected_line": detected_line,
            "score_delta": 0.22,
            "identity_evidence": True,
        }

    # 라인이 다르면 같은 캐릭터여도 다른 상품일 가능성이 높아 감점한다.
    return -0.18, {
        "code": "PRODUCT_LINE_MISMATCH",
        "message": "상품 라인이 후기의 피규어 타입과 다릅니다.",
        "expected_line": expected_line,
        "detected_line": detected_line,
        "score_delta": -0.18,
        "identity_evidence": False,
    }


def _score_series_tags(
    context: ProductMatchContext,
    candidate_body: str,
) -> tuple[float, dict[str, Any] | None]:
    matched_tags = [
        tag_name
        for tag_name in context.tag_names
        if normalize_text(tag_name) and normalize_text(tag_name) in candidate_body
    ]

    if not matched_tags:
        return 0.0, None

    return 0.16, {
        "code": "SERIES_TAG_MATCH",
        "message": "작품/시리즈 태그가 상품 정보와 일치합니다.",
        "matched_tags": matched_tags,
        "score_delta": 0.16,
        "identity_evidence": True,
    }


def _score_manufacturer(
    context: ProductMatchContext,
    candidate: dict[str, Any],
) -> tuple[float, dict[str, Any] | None]:
    expected = normalize_text(context.manufacturer)
    if not expected:
        return 0.0, None

    maker_brand_text = normalize_text(
        " ".join(
            str(value)
            for value in [
                candidate.get("maker"),
                candidate.get("brand"),
                candidate.get("mall_name"),
                candidate.get("title"),
            ]
            if value
        )
    )

    if expected not in maker_brand_text and "good smile" not in maker_brand_text:
        return 0.0, None

    return 0.10, {
        "code": "MANUFACTURER_MATCH",
        "message": "제조사/브랜드 정보가 보조 근거로 일치합니다.",
        "manufacturer": context.manufacturer,
        "score_delta": 0.10,
        "identity_evidence": True,
    }


def _score_price_range(
    context: ProductMatchContext,
    candidate: dict[str, Any],
) -> tuple[float, dict[str, Any] | None]:
    candidate_amount = candidate_price_amount(candidate)
    candidate_range = amount_to_price_range(candidate_amount)

    if not price_ranges_are_near(context.price_range, candidate_range):
        return 0.0, None

    return 0.05, {
        "code": "PRICE_RANGE_NEAR",
        "message": "후기 가격대와 상품 후보 가격대가 가깝습니다.",
        "review_price_range": str(context.price_range) if context.price_range else None,
        "candidate_price_range": candidate_range.value,
        "score_delta": 0.05,
        "identity_evidence": False,
    }


def _candidate_with_score(evaluation: CandidateEvaluation) -> dict[str, Any]:
    return {
        **evaluation.candidate,
        "match_score": evaluation.score,
        "identity_evidence_count": evaluation.identity_evidence_count,
        "match_reasons": evaluation.reasons,
    }
