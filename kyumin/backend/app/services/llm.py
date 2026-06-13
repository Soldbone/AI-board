from __future__ import annotations

import json
from typing import Any

import httpx
from fastapi import HTTPException, status

from backend.app.core.config import Settings
from backend.app.schemas.ai import AgentReviewResponse

OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"

IDEA_REVIEW_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "difference": {"type": "string"},
        "difficulty": {"type": "string"},
        "suggestions": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["summary", "difference", "difficulty", "suggestions"],
    "additionalProperties": False,
}


def review_game_idea_with_openai(
    api_key: str,
    settings: Settings,
    context: dict[str, Any],
) -> AgentReviewResponse:
    """OpenAI 텍스트 모델을 호출해 아이디어 리뷰 결과 JSON을 만든다."""
    model_name = settings.openai_model.strip()
    if not model_name:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="openai_model_not_configured")

    payload = {
        "model": model_name,
        "messages": [
            {
                "role": "system",
                "content": (
                    "너는 게임랩 학생의 게임 아이디어를 짧고 실용적으로 리뷰하는 AI다. "
                    "반드시 JSON으로만 답하고, summary, difference, difficulty, suggestions 필드를 채운다. "
                    "suggestions는 정확히 3개의 짧은 한국어 문장으로 작성한다."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(context, ensure_ascii=False),
            },
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "idea_review",
                "schema": IDEA_REVIEW_RESPONSE_SCHEMA,
                "strict": True,
            },
        },
    }

    data = post_openai_chat_completion(api_key, payload)
    content = extract_message_content(data)
    return parse_agent_review_response(content)


def post_openai_chat_completion(api_key: str, payload: dict[str, Any]) -> dict[str, Any]:
    """OpenAI Chat Completions API 요청과 기본 에러 처리를 담당한다."""
    try:
        response = httpx.post(
            OPENAI_CHAT_COMPLETIONS_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
            timeout=45.0,
        )
    except httpx.HTTPError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="openai_llm_request_failed") from error

    if response.status_code >= 400:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="openai_llm_request_failed")

    try:
        return response.json()
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="openai_llm_response_invalid") from error


def extract_message_content(data: dict[str, Any]) -> str:
    """Chat Completions 응답에서 assistant 메시지 문자열을 꺼낸다."""
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="openai_llm_response_invalid")

    first_choice = choices[0]
    message = first_choice.get("message") if isinstance(first_choice, dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str) or not content.strip():
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="openai_llm_response_invalid")

    return content


def parse_agent_review_response(content: str) -> AgentReviewResponse:
    """모델이 반환한 JSON을 API 응답 스키마로 검증한다."""
    try:
        raw_result = json.loads(content)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="openai_llm_response_invalid") from error

    try:
        result = AgentReviewResponse.model_validate(raw_result)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="openai_llm_response_invalid") from error

    if len(result.suggestions) != 3:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="openai_llm_response_invalid")

    return result
