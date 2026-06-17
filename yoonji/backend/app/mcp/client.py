from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

import httpx


DEFAULT_MCP_SERVER_URL = "http://127.0.0.1:8765/mcp"
MCP_PROTOCOL_VERSION = "2025-06-18"


class McpClientError(RuntimeError):
    def __init__(
        self,
        *,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}


@dataclass
class JsonRpcResponse:
    body: dict[str, Any] | None
    headers: dict[str, str]


class ProductMetadataMcpClient:
    """Small backend MCP client for the product enrichment tools.

    The MCP server owns external API access. This client only speaks MCP
    JSON-RPC and returns structured tool payloads to the backend service.
    """

    def __init__(
        self,
        *,
        server_url: str | None = None,
        timeout_seconds: float = 12.0,
    ) -> None:
        self.server_url = server_url or os.getenv("MCP_SERVER_URL", DEFAULT_MCP_SERVER_URL)
        self.timeout_seconds = timeout_seconds
        self._session_id: str | None = None
        self._initialized = False
        self._next_request_id = 1

    def search_gsc_smartstore_products(
        self,
        *,
        query: str,
        display: int = 10,
        sort: str = "sim",
    ) -> dict[str, Any]:
        return self._call_tool(
            "search_gsc_smartstore_products",
            {
                "query": query,
                "display": display,
                "sort": sort,
            },
        )

    def search_naver_shopping_products(
        self,
        *,
        query: str,
        display: int = 3,
        sort: str = "sim",
    ) -> dict[str, Any]:
        return self._call_tool(
            "search_naver_shopping_products",
            {
                "query": query,
                "display": display,
                "sort": sort,
            },
        )

    def fetch_gsc_product_metadata(self, *, product_url: str) -> dict[str, Any]:
        return self._call_tool(
            "fetch_gsc_product_metadata",
            {"product_url": product_url},
        )

    def _call_tool(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        self._ensure_initialized()
        response = self._post_json_rpc(
            method="tools/call",
            params={
                "name": tool_name,
                "arguments": arguments,
            },
        )

        if response.body is None:
            raise McpClientError(
                code="MCP_EMPTY_TOOL_RESPONSE",
                message="MCP tool call returned an empty response.",
                details={"tool_name": tool_name},
            )

        result = response.body.get("result")
        if not isinstance(result, dict):
            raise McpClientError(
                code="MCP_INVALID_TOOL_RESPONSE",
                message="MCP tool call response did not contain a result object.",
                details={"tool_name": tool_name, "response": response.body},
            )

        structured_content = result.get("structuredContent")
        if isinstance(structured_content, dict):
            return structured_content

        return self._parse_text_content_result(result, tool_name=tool_name)

    def _ensure_initialized(self) -> None:
        if self._initialized:
            return

        response = self._post_json_rpc(
            method="initialize",
            params={
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {
                    "name": "yoonji-backend",
                    "version": "0.1.0",
                },
            },
        )

        session_id = response.headers.get("mcp-session-id")
        if session_id:
            self._session_id = session_id

        # The initialized notification has no response. Some stateless test
        # servers ignore it, so tool calls below remain the source of truth.
        try:
            self._post_json_rpc(
                method="notifications/initialized",
                params={},
                expect_response=False,
                include_id=False,
            )
        except McpClientError:
            pass
        self._initialized = True

    def _post_json_rpc(
        self,
        *,
        method: str,
        params: dict[str, Any],
        expect_response: bool = True,
        include_id: bool = True,
    ) -> JsonRpcResponse:
        payload: dict[str, Any] = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        }

        if include_id:
            payload["id"] = self._allocate_request_id()

        headers = {
            "Accept": "application/json, text/event-stream",
            "Content-Type": "application/json",
        }
        if self._session_id:
            headers["Mcp-Session-Id"] = self._session_id

        try:
            with httpx.Client(timeout=self.timeout_seconds) as client:
                response = client.post(self.server_url, json=payload, headers=headers)
        except httpx.TimeoutException as exc:
            raise McpClientError(
                code="MCP_REQUEST_TIMEOUT",
                message="MCP server request timed out.",
                details={"method": method, "server_url": self.server_url},
            ) from exc
        except httpx.HTTPError as exc:
            raise McpClientError(
                code="MCP_REQUEST_FAILED",
                message="MCP server request failed before a response was received.",
                details={"method": method, "server_url": self.server_url},
            ) from exc

        if response.status_code >= 400:
            raise McpClientError(
                code="MCP_HTTP_ERROR",
                message="MCP server returned an HTTP error response.",
                details={
                    "method": method,
                    "status_code": response.status_code,
                    "response_text": response.text[:500],
                },
            )

        if not expect_response or not response.text.strip():
            return JsonRpcResponse(body=None, headers=dict(response.headers))

        body = self._parse_json_response(response, method=method)
        if "error" in body:
            raise McpClientError(
                code="MCP_JSON_RPC_ERROR",
                message="MCP server returned a JSON-RPC error.",
                details={"method": method, "error": body.get("error")},
            )

        return JsonRpcResponse(body=body, headers=dict(response.headers))

    def _allocate_request_id(self) -> int:
        request_id = self._next_request_id
        self._next_request_id += 1
        return request_id

    @staticmethod
    def _parse_json_response(response: httpx.Response, *, method: str) -> dict[str, Any]:
        content_type = response.headers.get("content-type", "")
        text = response.text.strip()

        if "text/event-stream" in content_type:
            text = _extract_sse_data(text)

        try:
            body = json.loads(text)
        except json.JSONDecodeError as exc:
            raise McpClientError(
                code="MCP_INVALID_JSON_RESPONSE",
                message="MCP server returned a response that is not JSON.",
                details={"method": method, "response_text": response.text[:500]},
            ) from exc

        if not isinstance(body, dict):
            raise McpClientError(
                code="MCP_UNEXPECTED_JSON_RESPONSE",
                message="MCP server returned JSON that is not an object.",
                details={"method": method, "response": body},
            )

        return body

    @staticmethod
    def _parse_text_content_result(
        result: dict[str, Any],
        *,
        tool_name: str,
    ) -> dict[str, Any]:
        content_items = result.get("content")
        if not isinstance(content_items, list):
            raise McpClientError(
                code="MCP_MISSING_STRUCTURED_CONTENT",
                message="MCP tool response did not include structured content.",
                details={"tool_name": tool_name, "result": result},
            )

        for item in content_items:
            if not isinstance(item, dict) or item.get("type") != "text":
                continue

            text = item.get("text")
            if not isinstance(text, str):
                continue

            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                continue

            if isinstance(parsed, dict):
                return parsed

        raise McpClientError(
            code="MCP_UNPARSEABLE_TOOL_CONTENT",
            message="MCP tool response text could not be parsed as JSON.",
            details={"tool_name": tool_name},
        )


def _extract_sse_data(text: str) -> str:
    data_lines = []

    for line in text.splitlines():
        if line.startswith("data:"):
            data_lines.append(line.removeprefix("data:").strip())

    return "\n".join(data_lines) if data_lines else text
