import asyncio
import json
import os
from typing import Any

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_openai import ChatOpenAI
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.comment import Comment
from app.schemas.agent import (
    AgentPlaceRecommendationRequest,
    AgentPlaceRecommendationResponse,
)
from app.services.mcp_client_service import (
    McpClientError,
    get_mcp_stdio_server_config,
    search_places_with_mcp,
)
from app.services.rag_service import find_similar_posts


load_dotenv()

DEFAULT_AGENT_MODEL = "gpt-4o-mini"
DEFAULT_AGENT_TIMEOUT_SECONDS = 12.0
RAG_CONTEXT_LIMIT = 3
SYSTEM_PROMPT = """
너는 동네 가게 추천 게시판의 AI Agent다.
사용자의 지역과 요청 의도를 바탕으로 필요한 경우 MCP 도구를 호출해 장소 후보를 찾는다.
지역 정보는 사용자가 제공한 region을 최우선으로 사용한다.
게시판 내부 RAG 참고 글이 제공되면 실제 사용자 후기/질문 맥락으로 우선 참고한다.
사용자가 맛집, 카페, 미용실, 옷가게 등 실제 장소 추천을 원하면 search_local_places 도구를 사용한다.
도구 호출은 한 요청에서 최대 1번만 사용한다.
응답은 한국어로 짧고 실용적으로 작성한다.
추천 장소 목록은 별도 데이터로 화면에 표시되므로 최종 답변에는 장소 목록을 길게 반복하지 않는다.
최종 답변에는 게시판 내부 RAG 참고 글과 댓글을 바탕으로 한 평가를 먼저 작성한다.
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
    return build_agent_user_message_with_context(request_data=request_data)


def build_agent_user_message_with_context(
    request_data: AgentPlaceRecommendationRequest,
    rag_context: str = "",
    local_review_summary: str = "",
) -> str:
    keyword = build_fallback_keyword(request_data)
    rag_section = rag_context or "게시판 내부 RAG 참고 글: 없음"
    local_review_section = local_review_summary or "DB 기반 사전 평가: 관련 후기 부족"

    return f"""
지역: {request_data.region}
제목: {request_data.title or "(없음)"}
내용: {request_data.content or "(없음)"}
검색 키워드 힌트: {keyword}
검색 결과 개수: {request_data.display}

{local_review_section}

{rag_section}

위 정보를 바탕으로 사용자가 참고할 만한 장소를 추천해줘.
게시판 내부 RAG 참고 글이 있으면 실제 동네 이용자 맥락으로 먼저 반영해줘.
최종 답변에는 DB에 쌓인 게시글과 댓글을 근거로 한 평가를 2~4문장으로 작성해줘.
장소 리스트는 화면에서 따로 표시하므로 최종 답변에 장소를 번호 목록으로 반복하지 마.
정확한 가게 후기를 묻는 요청이면 가게명 중심으로 검색해줘.
조건을 만족하는 가게 리스트 요청이면 검색 키워드를 '조건 + 업종' 형태로 만들어줘.
필요하면 search_local_places 도구를 사용해줘.
""".strip()


def find_agent_related_posts(
    db: Session | None,
    request_data: AgentPlaceRecommendationRequest,
) -> list[dict[str, Any]]:
    if db is None:
        return []

    tag_names = [request_data.keyword] if request_data.keyword else []

    try:
        return find_similar_posts(
            db=db,
            title=request_data.title,
            content=request_data.content,
            tag_names=tag_names,
            limit=RAG_CONTEXT_LIMIT,
        )
    except Exception:
        return []


def get_comment_counts_by_post_id(
    db: Session | None,
    post_ids: list[int],
) -> dict[int, int]:
    if db is None or not post_ids:
        return {}

    rows = (
        db.query(Comment.post_id, func.count(Comment.id))
        .filter(
            Comment.post_id.in_(post_ids),
            Comment.deleted_at.is_(None),
        )
        .group_by(Comment.post_id)
        .all()
    )

    return {post_id: count for post_id, count in rows}


def get_comment_samples_by_post_id(
    db: Session | None,
    post_ids: list[int],
    per_post_limit: int = 2,
) -> dict[int, list[str]]:
    if db is None or not post_ids:
        return {}

    samples: dict[int, list[str]] = {post_id: [] for post_id in post_ids}
    rows = (
        db.query(Comment.post_id, Comment.content)
        .filter(
            Comment.post_id.in_(post_ids),
            Comment.deleted_at.is_(None),
        )
        .order_by(Comment.created_at.desc())
        .all()
    )

    for post_id, content in rows:
        if len(samples[post_id]) >= per_post_limit:
            continue
        cleaned_content = " ".join(content.split())
        samples[post_id].append(cleaned_content[:80])

    return samples


def build_local_review_summary(
    similar_posts: list[dict[str, Any]],
    comment_counts: dict[int, int],
) -> str:
    if not similar_posts:
        return (
            "DB 기반 평가: 아직 우리 게시판에 관련 후기가 충분히 쌓이지 않았습니다. "
            "아래 장소 추천은 외부 장소 검색 결과를 참고해 확인해주세요."
        )

    post_count = len(similar_posts)
    total_comment_count = sum(comment_counts.get(post["id"], 0) for post in similar_posts)
    store_names = [
        post.get("store_name")
        for post in similar_posts
        if post.get("store_name")
    ]
    categories = [
        post.get("category")
        for post in similar_posts
        if post.get("category")
    ]
    matched_keywords = []

    for post in similar_posts:
        for keyword in post.get("matched_keywords", []):
            if keyword not in matched_keywords:
                matched_keywords.append(keyword)

    store_text = ", ".join(dict.fromkeys(store_names[:3])) or "특정 가게명 정보 부족"
    category_text = ", ".join(dict.fromkeys(categories[:2])) or "분류 정보 부족"
    keyword_text = ", ".join(matched_keywords[:5]) or "명확한 공통 키워드 부족"

    if total_comment_count >= 5:
        confidence_text = "댓글 반응도 어느 정도 있어 참고 가치가 있습니다."
    elif total_comment_count > 0:
        confidence_text = "댓글은 아직 많지 않아 보조 근거로만 보는 편이 좋습니다."
    else:
        confidence_text = "댓글 데이터는 거의 없어 게시글 내용 중심으로만 판단해야 합니다."

    return (
        f"DB 기반 평가: 관련 게시글 {post_count}개와 댓글 {total_comment_count}개를 찾았습니다. "
        f"주요 가게/분류는 {store_text} / {category_text}이고, "
        f"반복해서 잡힌 키워드는 {keyword_text}입니다. {confidence_text}"
    )


def build_agent_rag_context(
    db: Session | None,
    similar_posts: list[dict[str, Any]],
) -> str:

    if not similar_posts:
        return ""

    post_ids = [post["id"] for post in similar_posts]
    comment_samples = get_comment_samples_by_post_id(db=db, post_ids=post_ids)
    lines = ["게시판 내부 RAG 참고 글:"]

    for index, post in enumerate(similar_posts, start=1):
        meta_parts = [
            value
            for value in (
                post.get("region"),
                post.get("store_name"),
                post.get("category"),
            )
            if value
        ]
        meta_text = " / ".join(meta_parts) if meta_parts else "추가 정보 없음"
        matched_keywords = ", ".join(post.get("matched_keywords", [])[:5]) or "없음"
        comment_text = " | ".join(comment_samples.get(post["id"], [])) or "댓글 없음"

        lines.append(
            f"{index}. {post.get('title', '')} | {meta_text} | "
            f"매칭 키워드: {matched_keywords} | "
            f"내용: {post.get('content_preview', '')} | "
            f"댓글 예시: {comment_text}"
        )

    return "\n".join(lines)


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
    local_review_summary: str = "",
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
        answer=local_review_summary or "MCP 장소 검색 결과를 표시합니다.",
        used_mcp=bool(tool_payload),
        query=tool_payload.get("query", ""),
        places=tool_payload.get("places", []),
        local_review_summary=local_review_summary,
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
    db: Session | None = None,
) -> AgentPlaceRecommendationResponse:
    similar_posts = find_agent_related_posts(db=db, request_data=request_data)
    post_ids = [post["id"] for post in similar_posts]
    comment_counts = get_comment_counts_by_post_id(db=db, post_ids=post_ids)
    local_review_summary = build_local_review_summary(
        similar_posts=similar_posts,
        comment_counts=comment_counts,
    )
    rag_context = build_agent_rag_context(db=db, similar_posts=similar_posts)

    try:
        agent = await create_place_recommendation_agent()
        result = await asyncio.wait_for(
            agent.ainvoke(
                {
                    "messages": [
                        {
                            "role": "user",
                            "content": build_agent_user_message_with_context(
                                request_data=request_data,
                                rag_context=rag_context,
                                local_review_summary=local_review_summary,
                            ),
                        }
                    ]
                }
            ),
            timeout=get_agent_timeout_seconds(),
        )
    except Exception as exc:
        try:
            return await recommend_places_with_mcp_fallback(
                request_data=request_data,
                local_review_summary=local_review_summary,
            )
        except AgentServiceError:
            raise AgentServiceError("Failed to run place recommendation Agent.") from exc

    tool_payload = _extract_tool_payload(result)
    answer = _extract_final_answer(result)
    places = tool_payload.get("places", [])
    used_mcp = bool(tool_payload)

    if not places:
        return await recommend_places_with_mcp_fallback(
            request_data=request_data,
            local_review_summary=local_review_summary,
        )

    if not answer:
        answer = local_review_summary or "추천 결과를 생성하지 못했습니다."

    return AgentPlaceRecommendationResponse(
        answer=answer,
        used_mcp=used_mcp,
        query=tool_payload.get("query", ""),
        places=places,
        local_review_summary=local_review_summary,
        fallback_map_url=tool_payload.get("fallback_map_url", ""),
        reasoning_summary=(
            "LangChain Agent가 RAG 참고 글과 MCP 장소 검색 도구를 함께 사용했습니다."
            if used_mcp and rag_context
            else "LangChain Agent가 MCP 장소 검색 도구를 사용했습니다."
            if used_mcp
            else "LangChain Agent가 RAG 참고 글을 바탕으로 응답했습니다."
            if rag_context
            else "LangChain Agent가 MCP 도구 없이 응답했습니다."
        ),
        tool_status=build_tool_status("agent_mcp", tool_payload.get("status")),
    )
