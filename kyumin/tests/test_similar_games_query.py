import asyncio

import pytest

from backend.app.core.config import Settings
from backend.app.models.post import Post, PostTag, Tag
from backend.app.services import similar_games
from backend.app.services.mcp_client import McpClientError
from backend.app.services.similar_games import (
    SimilarGameQuery,
    build_similar_game_query,
    close_video_games_client,
    collect_similar_games,
    get_video_games_client,
)


def test_korean_idea_terms_are_kept_without_manual_translation() -> None:
    """한국어 아이디어 제목/장르/태그는 수동 영어 사전 없이 원문 중심으로 검색한다."""
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

    assert query.genre == "로그라이크"
    assert query.search_titles == ["감자를 키우는 로그라이크"]


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


def test_video_games_mcp_client_is_reused_for_same_settings() -> None:
    """요청마다 새 MCP 클라이언트를 만들지 않고 같은 설정의 클라이언트를 유지한다."""

    async def run_check() -> None:
        settings = Settings(
            rawg_api_key="test-rawg-key",
            video_games_mcp_command="python",
            video_games_mcp_args="-m videogames_mcp_server",
            mcp_request_timeout_seconds=1.0,
        )

        await close_video_games_client()
        first_client = await get_video_games_client(settings)
        second_client = await get_video_games_client(settings)

        assert first_client is second_client
        await close_video_games_client()

    asyncio.run(run_check())


def test_video_games_mcp_client_starts_on_startup_when_configured(monkeypatch) -> None:
    """MCP 설정이 모두 있으면 백엔드 startup 단계에서 서버 프로세스를 미리 시작한다."""
    started_clients = []

    class FakeMcpClient:
        def __init__(self, command, args, cwd, env, protocol_version, timeout_seconds):
            self.command = command
            self.args = args
            self.cwd = cwd
            self.env = env
            self.protocol_version = protocol_version
            self.timeout_seconds = timeout_seconds

        async def ensure_started(self):
            started_clients.append(self)

        async def close(self):
            return None

    async def run_check() -> None:
        settings = Settings(
            rawg_api_key="test-rawg-key",
            video_games_mcp_command="python",
            video_games_mcp_args="-m videogames_mcp_server",
            mcp_request_timeout_seconds=1.0,
        )

        monkeypatch.setattr(similar_games, "StdioMcpClient", FakeMcpClient)

        await close_video_games_client()
        did_start = await similar_games.start_video_games_client_if_configured(settings)

        assert did_start is True
        assert len(started_clients) == 1
        assert started_clients[0].command == "python"
        assert started_clients[0].args == ["-m", "videogames_mcp_server"]
        await close_video_games_client()

    asyncio.run(run_check())


def test_video_games_mcp_client_startup_skips_when_settings_are_missing() -> None:
    """MCP 환경변수가 비어 있으면 다른 백엔드 기능을 위해 startup을 막지 않는다."""

    async def run_check() -> None:
        await close_video_games_client()
        settings = Settings(
            rawg_api_key="",
            video_games_mcp_command="",
            video_games_mcp_args="",
        )
        did_start = await similar_games.start_video_games_client_if_configured(settings)

        assert did_start is False
        await close_video_games_client()

    asyncio.run(run_check())
