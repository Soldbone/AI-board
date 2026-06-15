import asyncio
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
    search_places_with_mcp,
)


load_dotenv()

DEFAULT_AGENT_MODEL = "gpt-4o-mini"
DEFAULT_AGENT_TIMEOUT_SECONDS = 12.0
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


FALLBACK_KEYWORD_RULES = [
    ("중국집", ("중국집", "중식", "짜장", "짬뽕", "탕수육")),
    ("카페", ("카페", "커피", "디저트")),
    ("미용실", ("미용실", "머리", "염색", "펌")),
    ("치킨", ("치킨", "닭강정")),
    ("한식", ("한식", "백반", "국밥", "찌개")),
    ("일식", ("일식", "초밥", "스시", "돈까스", "라멘")),
    ("분식", ("분식", "떡볶이", "김밥", "순대")),
    ("고깃집", ("고깃집", "삼겹살", "갈비", "고기")),
    ("빵집", ("빵집", "베이커리", "빵")),
    ("술집", ("술집", "호프", "맥주", "이자카야")),
    ("옷가게", ("옷가게", "의류", "옷")),
]

CONDITION_KEYWORD_RULES = [
    ("조용한", ("조용", "조용한", "시끄럽지", "대화하기", "차분")),
    ("공부", ("공부", "작업", "노트북", "콘센트")),
    ("가성비", ("가성비", "저렴", "싼", "가격", "비싸지", "착한")),
    ("혼밥", ("혼밥", "혼자", "1인", "일인")),
    ("데이트", ("데이트", "분위기", "예쁜", "감성")),
    ("주차", ("주차", "주차장", "차 가져")),
    ("포장", ("포장", "테이크아웃", "가져가기")),
    ("배달", ("배달", "배달되는")),
    ("대기 적은", ("대기", "웨이팅", "줄 안", "안 기다")),
    ("아이랑", ("아이", "아기", "가족", "유아")),
    ("넓은", ("넓은", "자리 많은", "좌석")),
    ("늦게까지", ("늦게", "밤", "야식")),
]


def get_agent_model_name() -> str:
    return os.getenv("OPENAI_AGENT_MODEL", DEFAULT_AGENT_MODEL).strip()


def get_agent_timeout_seconds() -> float:
    raw_timeout = os.getenv("OPENAI_AGENT_TIMEOUT_SECONDS", "")
    if not raw_timeout:
        return DEFAULT_AGENT_TIMEOUT_SECONDS

    try:
        timeout = float(raw_timeout)
    except ValueError:
        return DEFAULT_AGENT_TIMEOUT_SECONDS

    return max(1.0, min(timeout, 30.0))


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
    keyword = build_fallback_keyword(request_data)

    return f"""
지역: {request_data.region}
제목: {request_data.title or "(없음)"}
내용: {request_data.content or "(없음)"}
검색 키워드 힌트: {keyword}
검색 결과 개수: {request_data.display}

위 정보를 바탕으로 사용자가 참고할 만한 장소를 추천해줘.
정확한 가게 후기를 묻는 요청이면 가게명 중심으로 검색해줘.
조건을 만족하는 가게 리스트 요청이면 검색 키워드를 '조건 + 업종' 형태로 만들어줘.
필요하면 search_local_places 도구를 사용해줘.
""".strip()


def _find_business_keyword(source_text: str) -> str:
    for keyword, aliases in FALLBACK_KEYWORD_RULES:
        if any(alias in source_text for alias in aliases):
            return keyword

    return ""


def _find_condition_keywords(source_text: str, limit: int = 1) -> list[str]:
    conditions: list[str] = []

    for keyword, aliases in CONDITION_KEYWORD_RULES:
        if keyword in conditions:
            continue
        if any(alias in source_text for alias in aliases):
            conditions.append(keyword)
        if len(conditions) >= limit:
            break

    return conditions


def build_fallback_keyword(request_data: AgentPlaceRecommendationRequest) -> str:
    source_text = f"{request_data.title} {request_data.content}".strip()
    hinted_keyword = (request_data.keyword or "").strip()
    business_keyword = _find_business_keyword(f"{source_text} {hinted_keyword}")
    condition_keywords = _find_condition_keywords(source_text)

    if business_keyword and condition_keywords:
        return " ".join([*condition_keywords, business_keyword])

    if hinted_keyword:
        return hinted_keyword

    if business_keyword:
        return business_keyword

    return source_text[:30].strip() or "맛집"


def build_tool_status(prefix: str, raw_status: Any) -> str:
    status = str(raw_status or "success").strip() or "success"
    return f"{prefix}_{status}"


async def recommend_places_with_mcp_fallback(
    request_data: AgentPlaceRecommendationRequest,
) -> AgentPlaceRecommendationResponse:
    keyword = build_fallback_keyword(request_data)
    try:
        tool_payload = await search_places_with_mcp(
            region=request_data.region,
            keyword=keyword,
            display=request_data.display,
        )
    except McpClientError as exc:
        raise AgentServiceError("Failed to run MCP fallback place search.") from exc

    return AgentPlaceRecommendationResponse(
        answer="MCP 장소 검색 결과를 표시합니다.",
        used_mcp=bool(tool_payload),
        query=tool_payload.get("query", ""),
        places=tool_payload.get("places", []),
        fallback_map_url=tool_payload.get("fallback_map_url", ""),
        reasoning_summary="Agent 응답이 비어 있거나 실패하여 MCP 직접 검색으로 대체했습니다.",
        tool_status=build_tool_status("fallback_direct_mcp", tool_payload.get("status")),
    )


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
        result = await asyncio.wait_for(
            agent.ainvoke(
                {
                    "messages": [
                        {
                            "role": "user",
                            "content": build_agent_user_message(request_data),
                        }
                    ]
                }
            ),
            timeout=get_agent_timeout_seconds(),
        )
    except Exception as exc:
        try:
            return await recommend_places_with_mcp_fallback(request_data)
        except AgentServiceError:
            raise AgentServiceError("Failed to run place recommendation Agent.") from exc

    tool_payload = _extract_tool_payload(result)
    answer = _extract_final_answer(result)
    places = tool_payload.get("places", [])
    used_mcp = bool(tool_payload)

    if not places:
        return await recommend_places_with_mcp_fallback(request_data)

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
        tool_status=build_tool_status("agent_mcp", tool_payload.get("status")),
    )
