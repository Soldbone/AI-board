import asyncio

import pytest

from backend.app.models.post import Post, PostTag, Tag
from backend.app.services.mcp_client import McpClientError
from backend.app.services.similar_games import SimilarGameQuery, build_similar_game_query, collect_similar_games


def test_korean_idea_terms_become_english_mcp_search_hints() -> None:
    """한국어 아이디어 제목/장르/태그를 RAWG 검색용 영어 힌트로 바꾼다."""
    post = Post(
        board_type="idea",
        title="감자를 키우는 로그라이크",
        content="농사를 지으며 던전을 반복 탐험하는 덱빌딩 게임",
        genre="로그라이크",
        core_fun="감자 변이와 카드 조합",
        platform="웹",
        tag_links=[
            PostTag(tag=Tag(name="덱빌딩")),
            PostTag(tag=Tag(name="농장")),
        ],
    )

    query = build_similar_game_query(post)

    assert query.genre == "RPG"
    assert query.search_titles[0].startswith("roguelike")
    assert "potato" in query.search_titles[0]
    assert "deckbuilding" in query.search_titles[0]
    assert "farming" in query.search_titles[0]
    assert "감자를 키우는 로그라이크" in query.search_titles


def test_english_idea_terms_are_kept_for_mcp_search() -> None:
    """이미 영어로 입력한 장르/태그/제목은 MCP 검색어에 유지한다."""
    post = Post(
        board_type="idea",
        title="Cozy Farming Deckbuilder",
        content="A short farming game with card choices",
        genre="Simulation",
        core_fun="cozy card combos",
        platform="Web",
        tag_links=[PostTag(tag=Tag(name="farming"))],
    )

    query = build_similar_game_query(post)

    assert query.genre == "Simulation"
    assert "simulation" in query.search_titles[0]
    assert "farming" in query.search_titles[0]
    assert "deckbuilder" in query.search_titles[0]


def test_mcp_payload_error_is_not_hidden_as_empty_result() -> None:
    """MCP 서버가 RAWG 401 같은 오류를 주면 빈 목록이 아니라 예외로 보여준다."""

    class FakeMcpClient:
        async def call_tool(self, tool_name, arguments):
            return {"result": [{"error": "Failed to search games: API request failed: 401"}]}

    query = SimilarGameQuery(
        title="legend of zelda",
        genre=None,
        tags=[],
        search_titles=["legend of zelda"],
    )

    with pytest.raises(McpClientError, match="401"):
        asyncio.run(collect_similar_games(FakeMcpClient(), query))
