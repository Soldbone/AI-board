import asyncio
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.api.routes import ai as ai_routes
from backend.app.models.ai import AiAnalysisResult
from backend.app.models.post import Post
from backend.app.models.user import User
from backend.app.schemas.ai import (
    AgentReviewResponse,
    RagRecommendationItem,
    RagRecommendResponse,
    SimilarGameItem,
    SimilarGamesResponse,
)
from backend.app.services import idea_agent
from conftest import auth_headers, register_verified_user


def test_ai_routes_use_mocked_rag_mcp_and_agent(client, db_session: Session, monkeypatch) -> None:
    """외부 OpenAI/RAWG 호출 없이 AI 라우터 응답 형태를 검증한다."""
    token, _ = register_verified_user(client, db_session, "ai@example.com")
    headers = auth_headers(token)

    def fake_recommend_posts_by_title(db, user, title, settings):
        return RagRecommendResponse(
            items=[
                RagRecommendationItem(
                    id=1,
                    board_type="idea",
                    title=f"{title} 관련 글",
                    similarity=0.91,
                )
            ]
        )

    async def fake_find_similar_games_for_post(db, user, post_id, settings):
        return SimilarGamesResponse(
            items=[
                SimilarGameItem(
                    id=3498,
                    name="Grand Potato Adventure",
                    released="2026-01-01",
                    rating=4.5,
                    platforms=["PC", "Web"],
                    genres=["Adventure"],
                    image_url="https://example.com/potato.png",
                )
            ]
        )

    async def fake_review_idea_post(db, user, post_id, settings):
        return AgentReviewResponse(
            summary="감자 성장과 짧은 반복 플레이를 결합한 아이디어입니다.",
            difference="기존 농장 게임보다 빠른 한 판과 빌드 선택을 강조합니다.",
            difficulty="medium",
            suggestions=[
                "초반 목표를 한 문장으로 보여주세요.",
                "감자 변이는 5개 이하로 시작하세요.",
                "한 판 플레이 시간을 5분 안쪽으로 제한하세요.",
            ],
        )

    monkeypatch.setattr(ai_routes.rag_service, "recommend_posts_by_title", fake_recommend_posts_by_title)
    monkeypatch.setattr(ai_routes.similar_games, "find_similar_games_for_post", fake_find_similar_games_for_post)
    monkeypatch.setattr(ai_routes.idea_agent, "review_idea_post", fake_review_idea_post)

    rag_response = client.post(
        "/ai/rag/recommend-posts",
        json={"title": "감자 로그라이크"},
        headers=headers,
    )
    assert rag_response.status_code == 200
    assert rag_response.json()["items"][0]["similarity"] == 0.91

    mcp_response = client.post(
        "/ai/mcp/similar-games",
        json={"post_id": 1},
        headers=headers,
    )
    assert mcp_response.status_code == 200
    assert mcp_response.json()["items"][0]["name"] == "Grand Potato Adventure"

    agent_response = client.post(
        "/ai/agent/review-idea",
        json={"post_id": 1},
        headers=headers,
    )
    assert agent_response.status_code == 200
    assert len(agent_response.json()["suggestions"]) == 3


def test_agent_loop_lets_llm_choose_rag_and_mcp_tools(db_session: Session, test_settings, monkeypatch) -> None:
    """LLM tool_calls가 RAG와 MCP 도구 실행으로 이어지고 최종 결과가 저장된다."""
    user = User(
        email="agent@example.com",
        password_hash="hash",
        is_email_verified=True,
    )
    db_session.add(user)
    db_session.flush()

    post = Post(
        user_id=user.id,
        board_type="idea",
        title="감자 로그라이크",
        content="감자를 키우며 던전을 반복 탐험하는 게임",
        genre="Roguelike",
        core_fun="감자 변이와 짧은 반복",
        platform="Web",
        difficulty="medium",
    )
    db_session.add(post)
    db_session.commit()

    turns = [
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "id": "call-rag",
                    "type": "function",
                    "function": {
                        "name": "rag_search_posts",
                        "arguments": json.dumps({"title": "감자 로그라이크"}),
                    },
                }
            ],
        },
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "id": "call-mcp",
                    "type": "function",
                    "function": {
                        "name": "mcp_search_game_by_title",
                        "arguments": json.dumps({"title": "potato roguelike", "limit": 2}),
                    },
                }
            ],
        },
        {
            "role": "assistant",
            "content": json.dumps(
                {
                    "summary": "감자 성장과 로그라이크 반복을 결합한 아이디어입니다.",
                    "difference": "기존 농장 게임보다 짧은 전투 반복과 변이를 강조합니다.",
                    "difficulty": "medium",
                    "suggestions": [
                        "감자 변이 종류를 작게 시작하세요.",
                        "한 판 목표를 5분 안에 끝나게 잡으세요.",
                        "기존 게임과 다른 성장 규칙을 제목에 드러내세요.",
                    ],
                },
                ensure_ascii=False,
            ),
        },
    ]
    called_tools = []

    def fake_get_user_openai_api_key(db, current_user, settings, required):
        return "sk-agent"

    def fake_create_agent_turn_with_openai(api_key, settings, messages, tools):
        assert api_key == "sk-agent"
        assert any(tool["function"]["name"] == "rag_search_posts" for tool in tools)
        assert any(tool["function"]["name"] == "mcp_search_game_by_title" for tool in tools)
        return turns.pop(0)

    def fake_retrieve_related_posts_with_api_key(db, api_key, title, settings):
        called_tools.append(("rag", title))
        return [
            RagRecommendationItem(
                id=99,
                board_type="idea",
                title="채소 로그라이크",
                similarity=0.88,
            )
        ]

    class FakeMcpClient:
        async def call_tool(self, tool_name, arguments):
            called_tools.append((tool_name, arguments["title"]))
            return [
                {
                    "id": 100,
                    "name": "Potato Quest",
                    "released": "2025-01-01",
                    "rating": 4.2,
                    "platforms": ["PC"],
                    "genres": ["RPG"],
                    "background_image": "https://example.com/potato.png",
                }
            ]

    async def fake_get_video_games_client(settings):
        return FakeMcpClient()

    monkeypatch.setattr(idea_agent.rag, "get_user_openai_api_key", fake_get_user_openai_api_key)
    monkeypatch.setattr(
        idea_agent.rag,
        "retrieve_related_posts_with_api_key",
        fake_retrieve_related_posts_with_api_key,
    )
    monkeypatch.setattr(idea_agent.llm, "create_agent_turn_with_openai", fake_create_agent_turn_with_openai)
    monkeypatch.setattr(idea_agent.similar_games, "get_video_games_client", fake_get_video_games_client)

    result = asyncio.run(idea_agent.review_idea_post(db_session, user, post.id, test_settings))

    saved_result = db_session.execute(
        select(AiAnalysisResult).where(AiAnalysisResult.analysis_type == idea_agent.AGENT_ANALYSIS_TYPE)
    ).scalar_one()

    assert result.summary.startswith("감자 성장")
    assert called_tools == [("rag", "감자 로그라이크"), ("search_game_by_title", "potato roguelike")]
    assert [step["name"] for step in saved_result.result_json["steps"]] == [
        "rag_search_posts",
        "mcp_search_game_by_title",
        "final_review",
    ]
