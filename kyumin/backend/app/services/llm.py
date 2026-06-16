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

RAG_PREVIEW_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "duplicate_risk": {"type": "string"},
        "suggestion": {"type": "string"},
    },
    "required": ["summary", "duplicate_risk", "suggestion"],
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


def create_rag_preview_with_openai(
    api_key: str,
    settings: Settings,
    context: dict[str, Any],
) -> dict[str, str]:
    """RAG 검색 결과를 바탕으로 중복 가능성과 개선 방향을 짧은 JSON으로 생성한다."""
    model_name = settings.openai_model.strip()
    if not model_name:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="openai_model_not_configured")

    payload = {
        "model": model_name,
        "messages": [
            {
                "role": "system",
                "content": (
                    "너는 게임 게시판 글쓰기 전에 비슷한 게시글을 확인해 주는 AI다. "
                    "반드시 JSON으로만 답하고, summary, duplicate_risk, suggestion 필드를 채운다. "
                    "각 필드는 짧은 한국어 한 문장으로 작성한다."
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
                "name": "rag_preview",
                "schema": RAG_PREVIEW_RESPONSE_SCHEMA,
                "strict": True,
            },
        },
    }

    data = post_openai_chat_completion(api_key, payload)
    content = extract_message_content(data)
    return parse_rag_preview_response(content)


def create_agent_turn_with_openai(
    api_key: str,
    settings: Settings,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
) -> dict[str, Any]:
    """Agent 루프에서 LLM이 다음 도구 호출 또는 최종 응답을 선택하게 한다."""
    model_name = settings.openai_model.strip()
    if not model_name:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="openai_model_not_configured")

    payload = {
        "model": model_name,
        "messages": messages,
        "tools": tools,
        "tool_choice": "auto",
    }
    data = post_openai_chat_completion(api_key, payload)
    return extract_assistant_message(data)


def create_agent_final_review_with_openai(
    api_key: str,
    settings: Settings,
    messages: list[dict[str, Any]],
) -> AgentReviewResponse:
    """도구 선택이 끝난 Agent 상태를 최종 아이디어 리뷰 JSON으로 정리한다."""
    model_name = settings.openai_model.strip()
    if not model_name:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="openai_model_not_configured")

    payload = {
        "model": model_name,
        "messages": [
            *messages,
            {
                "role": "user",
                "content": (
                    "지금까지의 도구 관찰 결과를 종합해 최종 리뷰 JSON만 작성해 주세요. "
                    "summary, difference, difficulty, suggestions 필드를 사용하고 suggestions는 정확히 3개입니다."
                ),
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
    message = extract_assistant_message(data)
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="openai_llm_response_invalid")

    return content


def extract_assistant_message(data: dict[str, Any]) -> dict[str, Any]:
    """Chat Completions 응답에서 assistant message 객체를 검증해 꺼낸다."""
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="openai_llm_response_invalid")

    first_choice = choices[0]
    message = first_choice.get("message") if isinstance(first_choice, dict) else None
    if not isinstance(message, dict):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="openai_llm_response_invalid")

    return message


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


def parse_rag_preview_response(content: str) -> dict[str, str]:
    """모델이 반환한 RAG 미리확인 JSON을 화면 응답에 맞는 dict로 검증한다."""
    try:
        raw_result = json.loads(content)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="openai_llm_response_invalid") from error

    if not isinstance(raw_result, dict):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="openai_llm_response_invalid")

    result: dict[str, str] = {}
    for field_name in ("summary", "duplicate_risk", "suggestion"):
        field_value = raw_result.get(field_name)
        if not isinstance(field_value, str) or not field_value.strip():
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="openai_llm_response_invalid")
        result[field_name] = field_value.strip()

    return result
