from __future__ import annotations

import asyncio
import json
import os
from typing import Any


class McpClientError(RuntimeError):
    """MCP 서버 실행, JSON-RPC 통신, 도구 호출 실패를 서비스 계층에 전달한다."""


class StdioMcpClient:
    """MCP stdio transport로 로컬 MCP 서버 프로세스와 JSON-RPC를 주고받는다."""

    def __init__(
        self,
        command: str,
        args: list[str],
        cwd: str | None,
        env: dict[str, str],
        protocol_version: str,
        timeout_seconds: float,
    ) -> None:
        self.command = command
        self.args = args
        self.cwd = cwd
        self.env = env
        self.protocol_version = protocol_version
        self.timeout_seconds = timeout_seconds
        self.next_request_id = 1
        self.process: asyncio.subprocess.Process | None = None

    async def __aenter__(self) -> "StdioMcpClient":
        await self.start()
        return self

    async def __aexit__(self, exc_type: object, exc: object, traceback: object) -> None:
        await self.close()

    async def start(self) -> None:
        """MCP 서버 프로세스를 띄우고 initialize/initialized 순서로 세션을 준비한다."""
        process_env = os.environ.copy()
        process_env.update(self.env)
        try:
            self.process = await asyncio.create_subprocess_exec(
                self.command,
                *self.args,
                cwd=self.cwd or None,
                env=process_env,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
        except OSError as error:
            raise McpClientError(f"mcp_server_start_failed: {error}") from error

        await self.request(
            "initialize",
            {
                "protocolVersion": self.protocol_version,
                "capabilities": {},
                "clientInfo": {
                    "name": "potato-maker-backend",
                    "version": "0.1.0",
                },
            },
        )
        await self.notify("notifications/initialized")

    async def close(self) -> None:
        """요청이 끝난 뒤 stdin을 닫고 MCP 서버 프로세스를 정리한다."""
        if self.process is None:
            return

        if self.process.stdin is not None and not self.process.stdin.is_closing():
            self.process.stdin.close()

        try:
            await asyncio.wait_for(self.process.wait(), timeout=2)
        except asyncio.TimeoutError:
            self.process.terminate()
            try:
                await asyncio.wait_for(self.process.wait(), timeout=2)
            except asyncio.TimeoutError:
                self.process.kill()
                await self.process.wait()

    async def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> Any:
        """MCP `tools/call` 요청으로 특정 도구를 실행하고 구조화 결과를 꺼낸다."""
        result = await self.request(
            "tools/call",
            {
                "name": tool_name,
                "arguments": arguments,
            },
        )
        if result.get("isError"):
            raise McpClientError(extract_text_error(result) or "mcp_tool_call_failed")

        return extract_tool_payload(result)

    async def request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        """응답 ID가 있는 JSON-RPC 요청을 보내고 같은 ID의 응답을 기다린다."""
        request_id = self.next_request_id
        self.next_request_id += 1
        await self.write_message(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "method": method,
                "params": params,
            }
        )
        return await self.read_response(request_id)

    async def notify(self, method: str, params: dict[str, Any] | None = None) -> None:
        """응답을 기다리지 않는 MCP notification 메시지를 보낸다."""
        message: dict[str, Any] = {
            "jsonrpc": "2.0",
            "method": method,
        }
        if params is not None:
            message["params"] = params

        await self.write_message(message)

    async def write_message(self, message: dict[str, Any]) -> None:
        """stdio transport 규칙에 맞춰 한 줄 JSON 메시지를 stdin으로 보낸다."""
        if self.process is None or self.process.stdin is None:
            raise McpClientError("mcp_server_not_started")

        payload = json.dumps(message, ensure_ascii=False, separators=(",", ":")) + "\n"
        self.process.stdin.write(payload.encode("utf-8"))
        await self.process.stdin.drain()

    async def read_response(self, request_id: int) -> dict[str, Any]:
        """stdout에서 JSON-RPC 응답을 읽고 요청 ID가 맞는 결과만 반환한다."""
        if self.process is None or self.process.stdout is None:
            raise McpClientError("mcp_server_not_started")

        while True:
            try:
                raw_line = await asyncio.wait_for(
                    self.process.stdout.readline(),
                    timeout=self.timeout_seconds,
                )
            except asyncio.TimeoutError as error:
                raise McpClientError("mcp_request_timeout") from error

            if not raw_line:
                raise McpClientError("mcp_server_closed")

            message = parse_jsonrpc_line(raw_line)
            response = find_response_message(message, request_id)
            if response is None:
                continue

            if "error" in response:
                error_payload = response["error"]
                if isinstance(error_payload, dict):
                    raise McpClientError(error_payload.get("message") or "mcp_protocol_error")
                raise McpClientError("mcp_protocol_error")

            result = response.get("result")
            if isinstance(result, dict):
                return result
            return {"value": result}


def parse_jsonrpc_line(raw_line: bytes) -> Any:
    """MCP stdout 한 줄을 JSON-RPC 메시지로 파싱한다."""
    try:
        return json.loads(raw_line.decode("utf-8"))
    except json.JSONDecodeError as error:
        raise McpClientError("mcp_invalid_json_response") from error


def find_response_message(message: Any, request_id: int) -> dict[str, Any] | None:
    """배치/단일 JSON-RPC 메시지에서 원하는 요청 ID의 응답을 찾는다."""
    messages = message if isinstance(message, list) else [message]
    for item in messages:
        if isinstance(item, dict) and item.get("id") == request_id:
            return item

    return None


def extract_tool_payload(result: dict[str, Any]) -> Any:
    """MCP 도구 결과에서 structuredContent나 text JSON을 실제 데이터로 꺼낸다."""
    if "structuredContent" in result:
        return result["structuredContent"]

    content = result.get("content")
    if not isinstance(content, list):
        return result

    text_items: list[str] = []
    for item in content:
        if not isinstance(item, dict) or item.get("type") != "text":
            continue

        text = item.get("text")
        if not isinstance(text, str):
            continue

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            text_items.append(text)

    if len(text_items) == 1:
        return text_items[0]
    return text_items


def extract_text_error(result: dict[str, Any]) -> str | None:
    """도구 실행 오류 결과에서 화면에 보여줄 짧은 오류 문구를 찾는다."""
    content = result.get("content")
    if not isinstance(content, list):
        return None

    for item in content:
        if isinstance(item, dict) and item.get("type") == "text" and isinstance(item.get("text"), str):
            return item["text"]

    return None
