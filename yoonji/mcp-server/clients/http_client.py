from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import httpx


DEFAULT_TIMEOUT_SECONDS = 8.0
DEFAULT_USER_AGENT = "yoonji-mcp-server/0.1"


@dataclass
class HttpResponse:
    status_code: int
    url: str
    text: str
    headers: dict[str, str]


class ExternalHttpError(RuntimeError):
    def __init__(
        self,
        *,
        code: str,
        message: str,
        status_code: int | None = None,
        response_text: str | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.response_text = response_text


class AsyncHttpClient:
    """Small HTTP wrapper used by MCP tools.

    Keeping HTTP concerns here makes the Naver client and metadata tool easier
    to test: they can focus on API semantics instead of transport details.
    """

    def __init__(self, timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS) -> None:
        self.timeout_seconds = timeout_seconds

    async def get_json(
        self,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        response = await self._get(url, params=params, headers=headers)

        try:
            data = json.loads(response.text)
        except json.JSONDecodeError as exc:
            raise ExternalHttpError(
                code="INVALID_JSON_RESPONSE",
                message="External API returned a non-JSON response.",
                status_code=response.status_code,
                response_text=response.text[:500],
            ) from exc

        if not isinstance(data, dict):
            raise ExternalHttpError(
                code="UNEXPECTED_JSON_RESPONSE",
                message="External API returned JSON that is not an object.",
                status_code=response.status_code,
                response_text=response.text[:500],
            )

        return data

    async def get_text(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
    ) -> HttpResponse:
        return await self._get(url, headers=headers)

    async def _get(
        self,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> HttpResponse:
        request_headers = {"User-Agent": DEFAULT_USER_AGENT}
        if headers:
            request_headers.update(headers)

        try:
            async with httpx.AsyncClient(
                timeout=self.timeout_seconds,
                follow_redirects=True,
            ) as client:
                response = await client.get(url, params=params, headers=request_headers)
        except httpx.TimeoutException as exc:
            raise ExternalHttpError(
                code="HTTP_TIMEOUT",
                message="External HTTP request timed out.",
            ) from exc
        except httpx.HTTPError as exc:
            raise ExternalHttpError(
                code="HTTP_REQUEST_FAILED",
                message="External HTTP request failed before a response was received.",
            ) from exc

        if response.status_code >= 400:
            raise ExternalHttpError(
                code="HTTP_ERROR_RESPONSE",
                message="External HTTP request returned an error response.",
                status_code=response.status_code,
                response_text=response.text[:500],
            )

        return HttpResponse(
            status_code=response.status_code,
            url=str(response.url),
            text=response.text,
            headers=dict(response.headers),
        )
