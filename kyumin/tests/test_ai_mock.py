from sqlalchemy.orm import Session

from backend.app.api.routes import ai as ai_routes
from backend.app.schemas.ai import (
    AgentReviewResponse,
    RagRecommendationItem,
    RagRecommendResponse,
    SimilarGameItem,
    SimilarGamesResponse,
)
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

    def fake_review_idea_post(db, user, post_id, settings):
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
