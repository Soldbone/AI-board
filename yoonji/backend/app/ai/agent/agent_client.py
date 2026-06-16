from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import json
import re
from typing import Any

from app.core.config import settings


class AgentClientError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        reason: str,
        cause: BaseException | None = None,
    ) -> None:
        super().__init__(message)
        self.reason = reason
        self.cause_summary = _safe_error_summary(cause) if cause else None


@dataclass
class AgentToolCall:
    call_id: str
    name: str
    arguments: dict[str, Any]
    raw_arguments: str

    def to_response_input(self) -> dict[str, Any]:
        return {
            "type": "function_call",
            "call_id": self.call_id,
            "name": self.name,
            "arguments": self.raw_arguments,
        }


@dataclass
class AgentModelResponse:
    content: str
    tool_calls: list[AgentToolCall]
    model_name: str


class OpenAIAgentClient:
    def __init__(
        self,
        *,
        api_key: str | None,
        model_name: str,
    ) -> None:
        self.api_key = api_key
        self.model_name = model_name
        self._client = None

    def create_response(
        self,
        *,
        input_messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> AgentModelResponse:
        try:
            response = self._get_client().responses.create(
                model=self.model_name,
                input=input_messages,
                tools=tools,
                tool_choice="auto",
            )
        except AgentClientError:
            raise
        except Exception as exc:
            raise AgentClientError(
                "OpenAI agent response call failed.",
                reason="api_call_failed",
                cause=exc,
            ) from exc

        return AgentModelResponse(
            content=_extract_response_text(response),
            tool_calls=_extract_tool_calls(response),
            model_name=self.model_name,
        )

    def _get_client(self):
        if self._client is not None:
            return self._client

        if not self.api_key:
            raise AgentClientError(
                "OPENAI_API_KEY is required to run the agent.",
                reason="missing_api_key",
            )

        try:
            from openai import OpenAI
        except Exception as exc:
            raise AgentClientError(
                "OpenAI Python SDK is not available.",
                reason="dependency_unavailable",
                cause=exc,
            ) from exc

        self._client = OpenAI(api_key=self.api_key)
        return self._client


@lru_cache
def get_agent_client() -> OpenAIAgentClient:
    return OpenAIAgentClient(
        api_key=settings.openai_api_key,
        model_name=settings.openai_chat_model,
    )


def _extract_response_text(response: Any) -> str:
    output_text = getattr(response, "output_text", None)
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    text_parts: list[str] = []
    for item in getattr(response, "output", []) or []:
        if getattr(item, "type", None) != "message":
            continue

        for content_item in getattr(item, "content", []) or []:
            text = getattr(content_item, "text", None)
            if isinstance(text, str) and text.strip():
                text_parts.append(text.strip())

    return "\n".join(text_parts).strip()


def _extract_tool_calls(response: Any) -> list[AgentToolCall]:
    tool_calls: list[AgentToolCall] = []

    for item in getattr(response, "output", []) or []:
        if getattr(item, "type", None) != "function_call":
            continue

        name = str(getattr(item, "name", "") or "")
        raw_arguments = getattr(item, "arguments", "{}")
        if not isinstance(raw_arguments, str):
            raw_arguments = json.dumps(raw_arguments or {}, ensure_ascii=False)

        try:
            arguments = json.loads(raw_arguments or "{}")
        except json.JSONDecodeError:
            arguments = {}

        if not isinstance(arguments, dict):
            arguments = {}

        call_id = str(
            getattr(item, "call_id", None)
            or getattr(item, "id", None)
            or f"call_{len(tool_calls) + 1}"
        )
        tool_calls.append(
            AgentToolCall(
                call_id=call_id,
                name=name,
                arguments=arguments,
                raw_arguments=raw_arguments,
            )
        )

    return tool_calls


def _safe_error_summary(exc: BaseException | None) -> dict[str, Any] | None:
    if exc is None:
        return None

    message = str(exc)
    message = re.sub(r"sk-[A-Za-z0-9_\-]+", "sk-***", message)

    return {
        "type": type(exc).__name__,
        "message": message[:500],
    }

