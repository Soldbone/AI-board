from __future__ import annotations

import re
import shlex
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.app.core.config import Settings
from backend.app.models.ai import AiAnalysisResult
from backend.app.models.post import Post, PostTag
from backend.app.models.user import User
from backend.app.schemas.ai import SimilarGameItem, SimilarGamesResponse
from backend.app.services.mcp_client import McpClientError, StdioMcpClient

MCP_ANALYSIS_TYPE = "mcp_similar_games"
MCP_MODEL_NAME = "BaranDev/videogames-mcp-server"
SEARCH_TITLE_LIMIT = 3

KOREAN_KEYWORD_HINTS: list[tuple[str, list[str]]] = [
    ("로그라이크", ["roguelike", "rpg"]),
    ("로그라이트", ["roguelite", "action"]),
    ("덱빌딩", ["deckbuilding", "card"]),
    ("덱 빌딩", ["deckbuilding", "card"]),
    ("카드", ["card"]),
    ("농장", ["farming", "simulation"]),
    ("농사", ["farming", "simulation"]),
    ("재배", ["farming", "simulation"]),
    ("감자", ["potato", "farming"]),
    ("퍼즐", ["puzzle"]),
    ("플랫포머", ["platformer"]),
    ("플랫폼", ["platformer"]),
    ("액션", ["action"]),
    ("어드벤처", ["adventure"]),
    ("모험", ["adventure"]),
    ("공포", ["horror"]),
    ("호러", ["horror"]),
    ("생존", ["survival"]),
    ("서바이벌", ["survival"]),
    ("시뮬레이션", ["simulation"]),
    ("경영", ["management", "simulation"]),
    ("전략", ["strategy"]),
    ("슈팅", ["shooter"]),
    ("총", ["shooter"]),
    ("아케이드", ["arcade"]),
    ("리듬", ["rhythm"]),
    ("레이싱", ["racing"]),
    ("스포츠", ["sports"]),
    ("격투", ["fighting"]),
    ("보드게임", ["board games"]),
    ("보드 게임", ["board games"]),
    ("캐주얼", ["casual"]),
    ("멀티", ["multiplayer"]),
    ("협동", ["co-op", "multiplayer"]),
    ("힐링", ["cozy", "casual"]),
]

KOREAN_RAWG_GENRE_HINTS: list[tuple[str, str]] = [
    ("로그라이크", "RPG"),
    ("로그라이트", "Action"),
    ("덱빌딩", "Card"),
    ("덱 빌딩", "Card"),
    ("카드", "Card"),
    ("농장", "Simulation"),
    ("농사", "Simulation"),
    ("재배", "Simulation"),
    ("퍼즐", "Puzzle"),
    ("플랫포머", "Platformer"),
    ("플랫폼", "Platformer"),
    ("액션", "Action"),
    ("어드벤처", "Adventure"),
    ("모험", "Adventure"),
    ("공포", "Action"),
    ("호러", "Action"),
    ("생존", "Action"),
    ("서바이벌", "Action"),
    ("시뮬레이션", "Simulation"),
    ("경영", "Simulation"),
    ("전략", "Strategy"),
    ("슈팅", "Shooter"),
    ("아케이드", "Arcade"),
    ("레이싱", "Racing"),
    ("스포츠", "Sports"),
    ("격투", "Fighting"),
    ("보드게임", "Board Games"),
    ("보드 게임", "Board Games"),
    ("캐주얼", "Casual"),
]

SEARCH_STOP_WORDS = {
    "web",
    "pc",
    "ios",
    "android",
    "mobile",
    "switch",
    "playstation",
    "xbox",
    "game",
    "idea",
}


@dataclass
class SimilarGameQuery:
    """아이디어 게시글에서 MCP 검색에 사용할 제목/장르/태그 힌트를 모은다."""

    title: str
    genre: str | None
    tags: list[str]
    search_titles: list[str]


async def find_similar_games_for_post(
    db: Session,
    user: User,
    post_id: int,
    settings: Settings,
) -> SimilarGamesResponse:
    """아이디어 게시글을 기준으로 Video Games MCP Server에서 유사 게임 후보를 찾는다."""
    post = get_idea_post_or_404(db, post_id)
    query = build_similar_game_query(post)
    client = build_video_games_client(settings)

    try:
        async with client:
            items = await collect_similar_games(client, query)
    except McpClientError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"mcp_call_failed: {error}",
        ) from error

    response = SimilarGamesResponse(items=items[:5])
    save_mcp_result(db, post, user, query, response)
    return response


def get_idea_post_or_404(db: Session, post_id: int) -> Post:
    """MCP 유사 게임 조회가 가능한 아이디어 게시글만 가져온다."""
    post = db.execute(
        select(Post)
        .where(Post.id == post_id, Post.deleted_at.is_(None))
        .options(selectinload(Post.tag_links).selectinload(PostTag.tag))
    ).scalar_one_or_none()
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="post_not_found")
    if post.board_type != "idea":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="idea_post_required")

    return post


def build_video_games_client(settings: Settings) -> StdioMcpClient:
    """환경변수 설정으로 Video Games MCP Server stdio 클라이언트를 만든다."""
    command = settings.video_games_mcp_command.strip()
    args = shlex.split(settings.video_games_mcp_args)
    cwd = settings.video_games_mcp_cwd.strip() or None

    if not command:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="video_games_mcp_command_required",
        )
    if not args:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="video_games_mcp_args_required",
        )
    if not settings.rawg_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="rawg_api_key_required",
        )

    return StdioMcpClient(
        command=command,
        args=args,
        cwd=cwd,
        env={"RAWG_API_KEY": settings.rawg_api_key},
        protocol_version=settings.mcp_protocol_version,
        timeout_seconds=settings.mcp_request_timeout_seconds,
    )


def build_similar_game_query(post: Post) -> SimilarGameQuery:
    """한국어 아이디어를 RAWG 검색에 맞는 영어 힌트 중심 검색어로 정리한다."""
    tags = [tag_link.tag.name for tag_link in post.tag_links if tag_link.tag is not None]
    raw_texts = [post.genre, *tags, post.title, post.core_fun, post.content, post.platform]
    english_hints = build_english_search_hints(raw_texts)
    raw_ascii_terms = extract_ascii_terms(raw_texts)
    search_terms = unique_texts([*english_hints, *raw_ascii_terms])

    original_title = clean_optional_text(post.title) or ""
    primary_title = " ".join(search_terms[:8]) if search_terms else original_title
    search_titles = build_search_titles(primary_title, original_title, search_terms)
    genre = choose_rawg_genre_hint(raw_texts)
    return SimilarGameQuery(title=search_titles[0], genre=genre, tags=tags, search_titles=search_titles)


async def collect_similar_games(client: StdioMcpClient, query: SimilarGameQuery) -> list[SimilarGameItem]:
    """검색 결과와 장르 인기 게임을 합쳐 중복 없는 최대 5개 후보를 만든다."""
    games: list[SimilarGameItem] = []
    for search_title in query.search_titles:
        search_payload = await client.call_tool(
            "search_game_by_title",
            {
                "title": search_title,
                "limit": 5,
            },
        )
        raise_for_mcp_payload_error(search_payload)
        add_unique_games(games, normalize_game_items(search_payload))
        if len(games) >= 5:
            break

    if len(games) < 5:
        matched_genre = await find_matching_genre(client, query.genre)
        popular_arguments: dict[str, Any] = {"limit": 5}
        if matched_genre:
            popular_arguments["genre"] = matched_genre

        popular_payload = await client.call_tool("get_popular_games", popular_arguments)
        raise_for_mcp_payload_error(popular_payload)
        add_unique_games(games, normalize_game_items(popular_payload))

    return games[:5]


async def find_matching_genre(client: StdioMcpClient, genre: str | None) -> str | None:
    """사용자 입력 장르가 RAWG 장르 목록에 있으면 MCP 서버가 아는 이름으로 맞춘다."""
    if not genre:
        return None

    genres_payload = await client.call_tool("list_genres", {})
    raise_for_mcp_payload_error(genres_payload)
    for raw_genre in normalize_sequence(genres_payload):
        if not isinstance(raw_genre, dict):
            continue

        genre_name = clean_optional_text(raw_genre.get("name"))
        if genre_name is None:
            continue

        if genre_name.lower() == genre.lower() or genre.lower() in genre_name.lower():
            return genre_name

    return None


def normalize_game_items(payload: Any) -> list[SimilarGameItem]:
    """MCP 도구별 응답 모양 차이를 화면용 유사 게임 항목으로 통일한다."""
    games: list[SimilarGameItem] = []
    for raw_game in normalize_sequence(payload):
        if not isinstance(raw_game, dict) or raw_game.get("error"):
            continue

        name = clean_optional_text(raw_game.get("name"))
        if name is None:
            continue

        games.append(
            SimilarGameItem(
                id=raw_game.get("id") if isinstance(raw_game.get("id"), int) else None,
                name=name,
                released=clean_optional_text(raw_game.get("released")),
                rating=normalize_float(raw_game.get("rating")),
                metacritic=normalize_int(raw_game.get("metacritic")),
                platforms=normalize_string_list(raw_game.get("platforms")),
                genres=normalize_string_list(raw_game.get("genres")),
                image_url=clean_optional_text(raw_game.get("background_image") or raw_game.get("image_url")),
            )
        )

    return games


def normalize_sequence(payload: Any) -> list[Any]:
    """MCP 결과가 리스트, results/items 딕셔너리 중 무엇이든 순회 가능하게 맞춘다."""
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("result", "results", "items", "games", "value"):
            value = payload.get(key)
            if isinstance(value, list):
                return value

    return []


def raise_for_mcp_payload_error(payload: Any) -> None:
    """MCP 도구가 정상 JSON 안에 담아 보낸 오류를 빈 결과로 숨기지 않는다."""
    for item in normalize_sequence(payload):
        if isinstance(item, dict) and isinstance(item.get("error"), str):
            raise McpClientError(item["error"])


def add_unique_games(target: list[SimilarGameItem], incoming: list[SimilarGameItem]) -> None:
    """검색/인기 결과가 겹쳐도 같은 게임은 한 번만 남긴다."""
    seen_keys = {build_game_key(item) for item in target}
    for item in incoming:
        key = build_game_key(item)
        if key in seen_keys:
            continue

        target.append(item)
        seen_keys.add(key)


def build_game_key(item: SimilarGameItem) -> str:
    """RAWG ID가 있으면 ID를, 없으면 이름을 중복 판단 기준으로 쓴다."""
    if item.id is not None:
        return f"id:{item.id}"
    return f"name:{item.name.lower()}"


def save_mcp_result(
    db: Session,
    post: Post,
    user: User,
    query: SimilarGameQuery,
    response: SimilarGamesResponse,
) -> None:
    """MCP 조회 성공 결과를 ai_analysis_results에 저장해 상세 화면에서 재사용하게 한다."""
    db.add(
        AiAnalysisResult(
            post_id=post.id,
            user_id=user.id,
            analysis_type=MCP_ANALYSIS_TYPE,
            model_name=MCP_MODEL_NAME,
            result_json={
                "query": {
                    "title": query.title,
                    "genre": query.genre,
                    "tags": query.tags,
                    "search_titles": query.search_titles,
                },
                "items": [item.model_dump() for item in response.items],
            },
        )
    )
    db.commit()


def clean_optional_text(value: Any) -> str | None:
    """외부 API 문자열 값은 공백을 제거하고 빈 값은 None으로 통일한다."""
    if not isinstance(value, str):
        return None

    cleaned = value.strip()
    return cleaned or None


def build_english_search_hints(raw_texts: list[str | None]) -> list[str]:
    """한국어 장르/키워드를 RAWG 검색에 유리한 영어 단어로 바꾼다."""
    joined_text = " ".join(text.strip().lower() for text in raw_texts if isinstance(text, str) and text.strip())
    hints: list[str] = []
    for korean_keyword, english_words in KOREAN_KEYWORD_HINTS:
        if korean_keyword in joined_text:
            hints.extend(english_words)

    return unique_texts(hints)


def extract_ascii_terms(raw_texts: list[str | None]) -> list[str]:
    """이미 영어로 입력된 장르/태그는 MCP 검색어에 그대로 살린다."""
    terms: list[str] = []
    for text in raw_texts:
        if not isinstance(text, str):
            continue

        for term in re.findall(r"[A-Za-z][A-Za-z0-9+-]*", text):
            normalized_term = term.strip().lower()
            if len(normalized_term) < 2 or normalized_term in SEARCH_STOP_WORDS:
                continue
            terms.append(normalized_term)

    return unique_texts(terms)


def choose_rawg_genre_hint(raw_texts: list[str | None]) -> str | None:
    """한국어 장르를 RAWG 장르 목록과 매칭될 가능성이 높은 영어 장르로 바꾼다."""
    joined_text = " ".join(text.strip().lower() for text in raw_texts if isinstance(text, str) and text.strip())
    for korean_keyword, rawg_genre in KOREAN_RAWG_GENRE_HINTS:
        if korean_keyword in joined_text:
            return rawg_genre

    for text in raw_texts:
        cleaned_text = clean_optional_text(text)
        if cleaned_text and cleaned_text.lower() not in SEARCH_STOP_WORDS:
            return cleaned_text

    return None


def build_search_titles(primary_title: str, original_title: str, search_terms: list[str]) -> list[str]:
    """첫 검색 실패에 대비해 영어 힌트 중심의 대체 검색어를 3개까지 만든다."""
    candidates = [primary_title]
    if len(search_terms) > 2:
        candidates.append(" ".join(search_terms[:4]))
    if original_title:
        candidates.append(original_title)

    return [title[:120] for title in unique_texts(candidates) if title][:SEARCH_TITLE_LIMIT]


def unique_texts(values: list[str]) -> list[str]:
    """검색어 순서를 유지하면서 중복과 빈 문자열을 제거한다."""
    items: list[str] = []
    seen_items: set[str] = set()
    for value in values:
        cleaned_value = value.strip()
        key = cleaned_value.lower()
        if not cleaned_value or key in seen_items:
            continue

        items.append(cleaned_value)
        seen_items.add(key)

    return items


def normalize_string_list(value: Any) -> list[str]:
    """MCP 응답의 문자열 배열에서 빈 값과 비문자 값을 제거한다."""
    if not isinstance(value, list):
        return []

    items: list[str] = []
    for item in value:
        cleaned = clean_optional_text(item)
        if cleaned is not None:
            items.append(cleaned)

    return items


def normalize_float(value: Any) -> float | None:
    """RAWG 평점처럼 숫자일 수도 문자열일 수도 있는 값을 float로 맞춘다."""
    if value is None:
        return None

    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def normalize_int(value: Any) -> int | None:
    """메타크리틱 점수처럼 정수 응답이 필요한 값을 안전하게 변환한다."""
    if value is None:
        return None

    try:
        return int(value)
    except (TypeError, ValueError):
        return None
