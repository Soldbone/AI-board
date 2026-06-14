import json
import os
from typing import Any

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_openai import ChatOpenAI

from app.schemas.agent import (
    AgentPlaceRecommendationRequest,
    AgentPlaceRecommendationResponse,
)
from app.services.mcp_client_service import (
    McpClientError,
    get_mcp_stdio_server_config,
)


load_dotenv()

DEFAULT_AGENT_MODEL = "gpt-4o-mini"
SYSTEM_PROMPT = """
너는 동네 가게 추천 게시판의 AI Agent다.
사용자의 지역과 요청 의도를 바탕으로 필요한 경우 MCP 도구를 호출해 장소 후보를 찾는다.
지역 정보는 사용자가 제공한 region을 최우선으로 사용한다.
사용자가 맛집, 카페, 미용실, 옷가게 등 실제 장소 추천을 원하면 search_local_places 도구를 사용한다.
도구 호출은 한 요청에서 최대 1번만 사용한다.
응답은 한국어로 짧고 실용적으로 작성한다.
추천 장소가 있으면 장소명, 분류, 주소, 지도 링크를 함께 언급한다.
확실하지 않은 정보는 단정하지 말고 검색 결과 기준이라고 설명한다.
""".strip()


class AgentServiceError(RuntimeError):
    pass


def get_agent_model_name() -> str:
    return os.getenv("OPENAI_AGENT_MODEL", DEFAULT_AGENT_MODEL).strip()


async def load_place_search_tools():
    try:
        client = MultiServerMCPClient(
            {
                "local_board_place_search": get_mcp_stdio_server_config(),
            }
        )
        return await client.get_tools()
    except McpClientError:
        raise
    except Exception as exc:
        raise AgentServiceError("Failed to load MCP tools for Agent.") from exc


async def create_place_recommendation_agent():
    tools = await load_place_search_tools()
    model = ChatOpenAI(
        model=get_agent_model_name(),
        temperature=0,
    )

    return create_agent(
        model=model,
        tools=tools,
        system_prompt=SYSTEM_PROMPT,
    )


def build_agent_user_message(request_data: AgentPlaceRecommendationRequest) -> str:
    keyword = request_data.keyword or "요청 내용에서 적절한 검색 키워드를 판단해줘"

    return f"""
지역: {request_data.region}
제목: {request_data.title or "(없음)"}
내용: {request_data.content or "(없음)"}
검색 키워드 힌트: {keyword}
검색 결과 개수: {request_data.display}

위 정보를 바탕으로 사용자가 참고할 만한 장소를 추천해줘.
필요하면 search_local_places 도구를 사용해줘.
""".strip()


def _extract_final_answer(result: dict[str, Any]) -> str:
    messages = result.get("messages", [])
    if not messages:
        return ""

    last_message = messages[-1]
    content = getattr(last_message, "content", "")

    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        text_parts = [
            item.get("text", "")
            for item in content
            if isinstance(item, dict) and item.get("type") == "text"
        ]
        return "\n".join(part for part in text_parts if part).strip()

    return str(content).strip()


def _parse_json_text(value: str) -> dict[str, Any] | None:
    try:
        payload = json.loads(value)
    except json.JSONDecodeError:
        return None

    return payload if isinstance(payload, dict) else None


def _extract_tool_payload(result: dict[str, Any]) -> dict[str, Any]:
    messages = result.get("messages", [])

    for message in reversed(messages):
        artifact = getattr(message, "artifact", None)
        if isinstance(artifact, dict):
            structured_content = (
                artifact.get("structured_content")
                or artifact.get("structuredContent")
                or artifact
            )
            if isinstance(structured_content, dict) and "places" in structured_content:
                return structured_content

        content = getattr(message, "content", None)
        if isinstance(content, str):
            payload = _parse_json_text(content)
            if isinstance(payload, dict) and "places" in payload:
                return payload

        if isinstance(content, list):
            for item in content:
                if not isinstance(item, dict):
                    continue
                text = item.get("text")
                if not isinstance(text, str):
                    continue
                payload = _parse_json_text(text)
                if isinstance(payload, dict) and "places" in payload:
                    return payload

    return {}


async def recommend_places_with_agent(
    request_data: AgentPlaceRecommendationRequest,
) -> AgentPlaceRecommendationResponse:
    try:
        agent = await create_place_recommendation_agent()
        result = await agent.ainvoke(
            {
                "messages": [
                    {
                        "role": "user",
                        "content": build_agent_user_message(request_data),
                    }
                ]
            }
        )
    except Exception as exc:
        raise AgentServiceError("Failed to run place recommendation Agent.") from exc

    tool_payload = _extract_tool_payload(result)
    answer = _extract_final_answer(result)
    places = tool_payload.get("places", [])
    used_mcp = bool(tool_payload)

    if not answer:
        answer = "추천 결과를 생성하지 못했습니다."

    return AgentPlaceRecommendationResponse(
        answer=answer,
        used_mcp=used_mcp,
        query=tool_payload.get("query", ""),
        places=places,
        fallback_map_url=tool_payload.get("fallback_map_url", ""),
        reasoning_summary=(
            "LangChain Agent가 MCP 장소 검색 도구를 사용했습니다."
            if used_mcp
            else "LangChain Agent가 MCP 도구 없이 응답했습니다."
        ),
        tool_status=tool_payload.get("status", ""),
    )
