from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import sys
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import backend.app.models  # noqa: F401
from backend.app.core.security import hash_password
from backend.app.db.session import SessionLocal
from backend.app.models.ai import AiAnalysisResult
from backend.app.models.comment import Comment
from backend.app.models.post import Post, PostMedia, PostTag, Tag
from backend.app.models.user import User
from backend.app.services.idea_agent import AGENT_ANALYSIS_TYPE
from backend.app.services.similar_games import MCP_ANALYSIS_TYPE, MCP_MODEL_NAME

DEMO_PASSWORD = "password123"
BULK_EXAMPLE_COUNT = 200
IDEA_EXAMPLE_COUNT = BULK_EXAMPLE_COUNT // 2
REVIEW_EXAMPLE_COUNT = BULK_EXAMPLE_COUNT - IDEA_EXAMPLE_COUNT

IDEA_GENRES = ["Roguelike", "Puzzle", "Simulation", "Action", "Strategy", "Rhythm", "Platformer", "Card"]
REVIEW_GENRES = ["Arcade", "Puzzle", "Action", "Simulation", "Racing", "Rhythm", "Adventure", "Sports"]
PLATFORMS = ["Web", "PC", "Mobile", "Web/PC"]
DIFFICULTIES = ["easy", "medium", "hard"]
IDEA_TAG_GROUPS = [
    ["prototype", "game-jam", "student"],
    ["coop", "casual", "web"],
    ["single-player", "pixel", "mvp"],
    ["physics", "score-attack", "fast-loop"],
    ["strategy", "deck", "replay"],
]
REVIEW_TAG_GROUPS = [
    ["playtest", "feedback", "web"],
    ["student-game", "prototype", "review"],
    ["arcade", "short-run", "score"],
    ["ui", "balance", "polish"],
    ["mobile", "casual", "iteration"],
]


def main() -> None:
    """로컬 발표와 수동 테스트에 쓸 최소 데모 데이터를 넣는다."""
    db = SessionLocal()
    try:
        writer = upsert_demo_user(db, "demo@example.com", "감자 학생")
        reviewer = upsert_demo_user(db, "reviewer@example.com", "리뷰 친구")

        idea_post = ensure_post(
            db,
            user=writer,
            board_type="idea",
            title="감자를 키우는 로그라이크",
            content="감자를 키우며 짧은 던전을 반복해서 탐험하는 웹 게임 아이디어입니다.",
            genre="Roguelike",
            core_fun="매번 다른 감자 변이와 장비 조합을 고르는 재미",
            platform="Web",
            difficulty="medium",
            source_url="https://example.com/potato-idea",
            tags=["roguelike", "farming", "web"],
        )
        review_post = ensure_post(
            db,
            user=writer,
            board_type="review",
            title="점프 감자 플레이 리뷰",
            content="장애물을 피하며 점수를 올리는 1분짜리 웹 미니게임입니다.",
            genre="Arcade",
            core_fun=None,
            platform="Web",
            difficulty=None,
            source_url="https://example.com/potato-jump",
            tags=["arcade", "web"],
            media=[
                {"media_type": "game_url", "url": "https://example.com/potato-jump"},
                {"media_type": "video_url", "url": "https://example.com/potato-jump-video"},
                {
                    "media_type": "image_url",
                    "url": "https://images.unsplash.com/photo-1518977676601-b53f82aba655",
                    "thumbnail_url": "https://images.unsplash.com/photo-1518977676601-b53f82aba655",
                },
            ],
        )

        ensure_comment(db, idea_post, reviewer, "핵심 재미가 명확해서 MVP로 만들기 좋아 보여요.")
        ensure_comment(
            db,
            review_post,
            reviewer,
            "짧은 플레이 루프가 좋아요.",
            rating=5,
            good_point="조작이 단순하고 다시 하기가 편함",
            bad_point="초반 목표 설명이 조금 부족함",
            suggestion="첫 화면에 목표와 점수 조건을 한 줄로 보여주면 좋겠음",
        )
        ensure_ai_sample_results(db, idea_post, writer)
        seed_bulk_example_posts(db, writer, reviewer)

        db.commit()
        print("Demo data is ready.")
        print(f"- Login: demo@example.com / {DEMO_PASSWORD}")
        print(f"- Reviewer: reviewer@example.com / {DEMO_PASSWORD}")
        print(f"- Idea post id: {idea_post.id}")
        print(f"- Review post id: {review_post.id}")
        print(f"- Bulk example posts: {BULK_EXAMPLE_COUNT}")
    finally:
        db.close()


def upsert_demo_user(db: Session, email: str, nickname: str) -> User:
    """데모 계정은 이메일 인증 완료 상태로 만들고 비밀번호를 고정한다."""
    normalized_email = email.strip().lower()
    user = db.execute(select(User).where(User.email == normalized_email)).scalar_one_or_none()
    if user is None:
        user = User(email=normalized_email, password_hash="", is_email_verified=True)
        db.add(user)

    user.password_hash = hash_password(DEMO_PASSWORD)
    user.nickname = nickname
    user.is_email_verified = True
    user.email_verified_at = user.email_verified_at or datetime.now(timezone.utc)
    db.flush()
    return user


def ensure_post(
    db: Session,
    user: User,
    board_type: str,
    title: str,
    content: str,
    genre: str | None,
    core_fun: str | None,
    platform: str | None,
    difficulty: str | None,
    source_url: str | None,
    tags: list[str],
    media: list[dict[str, str]] | None = None,
) -> Post:
    """같은 데모 글이 이미 있으면 재사용하고 없으면 태그/미디어와 함께 만든다."""
    post = db.execute(
        select(Post).where(
            Post.user_id == user.id,
            Post.board_type == board_type,
            Post.title == title,
            Post.deleted_at.is_(None),
        )
    ).scalar_one_or_none()
    if post is not None:
        return post

    post = Post(
        user_id=user.id,
        board_type=board_type,
        title=title,
        content=content,
        genre=genre,
        core_fun=core_fun,
        platform=platform,
        difficulty=difficulty,
        source_url=source_url,
    )
    db.add(post)
    db.flush()

    for tag_name in tags:
        tag = get_or_create_tag(db, tag_name)
        db.add(PostTag(post_id=post.id, tag_id=tag.id))

    for media_item in media or []:
        db.add(
            PostMedia(
                post_id=post.id,
                media_type=media_item["media_type"],
                url=media_item["url"],
                thumbnail_url=media_item.get("thumbnail_url"),
            )
        )

    db.flush()
    return post


def get_or_create_tag(db: Session, name: str) -> Tag:
    """데모 글 태그를 중복 생성하지 않고 재사용한다."""
    cleaned_name = name.strip().lower()
    tag = db.execute(select(Tag).where(Tag.name == cleaned_name)).scalar_one_or_none()
    if tag is not None:
        return tag

    tag = Tag(name=cleaned_name)
    db.add(tag)
    db.flush()
    return tag


def ensure_comment(
    db: Session,
    post: Post,
    user: User,
    content: str,
    rating: int | None = None,
    good_point: str | None = None,
    bad_point: str | None = None,
    suggestion: str | None = None,
) -> None:
    """데모 댓글이 이미 있으면 추가로 만들지 않는다."""
    exists = db.execute(
        select(Comment).where(
            Comment.post_id == post.id,
            Comment.user_id == user.id,
            Comment.content == content,
            Comment.deleted_at.is_(None),
        )
    ).scalar_one_or_none()
    if exists is not None:
        return

    db.add(
        Comment(
            post_id=post.id,
            user_id=user.id,
            content=content,
            rating=rating,
            good_point=good_point,
            bad_point=bad_point,
            suggestion=suggestion,
        )
    )


def seed_bulk_example_posts(db: Session, writer: User, reviewer: User) -> None:
    """게시판 목록, 검색, 페이징을 확인할 수 있도록 대량 샘플 글을 만든다."""
    for index in range(1, IDEA_EXAMPLE_COUNT + 1):
        post = ensure_post(
            db,
            user=writer,
            board_type="idea",
            title=f"샘플 아이디어 {index:03d} - {build_idea_title(index)}",
            content=build_idea_content(index),
            genre=IDEA_GENRES[(index - 1) % len(IDEA_GENRES)],
            core_fun=build_idea_core_fun(index),
            platform=PLATFORMS[(index - 1) % len(PLATFORMS)],
            difficulty=DIFFICULTIES[(index - 1) % len(DIFFICULTIES)],
            source_url=f"https://example.com/ideas/{index:03d}",
            tags=build_tag_list(IDEA_TAG_GROUPS, index),
        )
        if index % 4 == 0:
            ensure_comment(db, post, reviewer, f"{index:03d}번 아이디어는 첫 화면 목표가 잘 보이면 더 좋아질 것 같아요.")

    for index in range(1, REVIEW_EXAMPLE_COUNT + 1):
        post = ensure_post(
            db,
            user=writer,
            board_type="review",
            title=f"샘플 리뷰 {index:03d} - {build_review_title(index)}",
            content=build_review_content(index),
            genre=REVIEW_GENRES[(index - 1) % len(REVIEW_GENRES)],
            core_fun=None,
            platform=PLATFORMS[(index - 1) % len(PLATFORMS)],
            difficulty=None,
            source_url=f"https://example.com/games/{index:03d}",
            tags=build_tag_list(REVIEW_TAG_GROUPS, index),
            media=[
                {"media_type": "game_url", "url": f"https://example.com/games/{index:03d}"},
                {"media_type": "video_url", "url": f"https://example.com/games/{index:03d}/play"},
                {
                    "media_type": "image_url",
                    "url": f"https://picsum.photos/seed/potato-review-{index:03d}/960/540",
                    "thumbnail_url": f"https://picsum.photos/seed/potato-review-{index:03d}/960/540",
                },
            ],
        )
        ensure_comment(
            db,
            post,
            reviewer,
            f"{index:03d}번 게임은 반복 플레이가 짧아서 테스트하기 좋았어요.",
            rating=(index % 5) + 1,
            good_point="핵심 조작을 바로 이해할 수 있음",
            bad_point="후반 난이도 변화가 조금 단조로움",
            suggestion="두 번째 스테이지부터 장애물 패턴을 하나씩 추가하면 좋겠음",
        )


def build_idea_title(index: int) -> str:
    """번호마다 다른 게임 아이디어 제목 조각을 만든다."""
    subjects = ["감자 기사단", "달빛 창고", "우주 정원", "픽셀 항구", "시간 우체국", "구름 연구소", "리듬 광산", "카드 주방"]
    actions = ["탈출 작전", "퍼즐 원정", "방어전", "협동 실험", "점수 사냥", "성장 루프", "보스 러시", "탐험 기록"]
    return f"{subjects[(index - 1) % len(subjects)]} {actions[(index * 2 - 1) % len(actions)]}"


def build_review_title(index: int) -> str:
    """번호마다 다른 플레이 리뷰 제목 조각을 만든다."""
    subjects = ["점프 감자", "네온 던전", "버튼 마을", "스피드 창고", "별빛 택배", "미니 레이서", "블록 사냥꾼", "코인 연구실"]
    reactions = ["플레이 기록", "첫인상 리뷰", "밸런스 체크", "UI 피드백", "난이도 메모", "재도전 후기", "조작감 노트", "개선 제안"]
    return f"{subjects[(index - 1) % len(subjects)]} {reactions[(index * 3 - 1) % len(reactions)]}"


def build_idea_content(index: int) -> str:
    """아이디어 게시글 본문을 검색과 상세 화면에서 읽기 좋게 만든다."""
    return (
        f"{index:03d}번 샘플 게임 아이디어입니다. "
        "짧은 플레이 루프, 분명한 목표, 한 화면에서 이해되는 규칙을 기준으로 작성했습니다. "
        "처음 구현할 때는 핵심 조작 하나와 실패 조건 하나만 넣고, 이후 태그와 장르에 맞춰 확장하는 흐름을 가정합니다."
    )


def build_idea_core_fun(index: int) -> str:
    """목록에서 보이는 핵심 재미 문장을 만든다."""
    hooks = [
        "매 판 다른 선택지를 고르는 재미",
        "짧은 시간 안에 기록을 갱신하는 재미",
        "친구와 역할을 나눠 목표를 달성하는 재미",
        "작은 실수를 바로 회복하며 다시 도전하는 재미",
        "간단한 규칙이 점점 복잡해지는 재미",
    ]
    return hooks[(index - 1) % len(hooks)]


def build_review_content(index: int) -> str:
    """리뷰 게시글 본문을 플레이 테스트 느낌으로 만든다."""
    return (
        f"{index:03d}번 샘플 게임 리뷰입니다. "
        "실제 플레이 링크를 검토한다는 상황을 가정해 조작감, 목표 전달, 반복 플레이 동기를 중심으로 적었습니다. "
        "목록 페이징과 검색, 상세 화면의 리뷰 댓글 표시를 확인하기 위한 데이터입니다."
    )


def build_tag_list(tag_groups: list[list[str]], index: int) -> list[str]:
    """공통 태그 묶음에 번호 태그를 섞어 검색 후보를 다양하게 만든다."""
    base_tags = tag_groups[(index - 1) % len(tag_groups)]
    return [*base_tags, f"sample-{index % 10}"]


def ensure_ai_sample_results(db: Session, post: Post, user: User) -> None:
    """Agent가 참고할 수 있는 MCP 샘플 결과와 발표용 Agent 샘플 결과를 저장한다."""
    ensure_analysis_result(
        db,
        post,
        user,
        MCP_ANALYSIS_TYPE,
        MCP_MODEL_NAME,
        {
            "query": {
                "title": "Roguelike farming potato",
                "genre": "Roguelike",
                "tags": ["roguelike", "farming", "web"],
            },
            "items": [
                {
                    "id": 413150,
                    "name": "Stardew Valley",
                    "released": "2016-02-26",
                    "rating": 4.4,
                    "metacritic": 89,
                    "platforms": ["PC", "Nintendo Switch"],
                    "genres": ["RPG", "Simulation"],
                    "image_url": None,
                },
                {
                    "id": 10533,
                    "name": "Enter the Gungeon",
                    "released": "2016-04-05",
                    "rating": 4.2,
                    "metacritic": 84,
                    "platforms": ["PC", "PlayStation"],
                    "genres": ["Action", "Roguelike"],
                    "image_url": None,
                },
            ],
        },
    )
    ensure_analysis_result(
        db,
        post,
        user,
        AGENT_ANALYSIS_TYPE,
        "gpt-5-nano",
        {
            "summary": "감자 성장과 로그라이크 선택을 결합한 아이디어입니다.",
            "difference": "농장 게임보다 짧은 반복 플레이와 빌드 선택을 강조합니다.",
            "difficulty": "medium",
            "suggestions": [
                "감자 변이 종류를 5개 이하로 시작하세요.",
                "첫 3분 안에 목표를 보여주세요.",
                "한 판 플레이 시간을 5분 안쪽으로 제한하세요.",
            ],
        },
    )


def ensure_analysis_result(
    db: Session,
    post: Post,
    user: User,
    analysis_type: str,
    model_name: str,
    result_json: dict[str, Any],
) -> None:
    """같은 종류의 데모 AI 결과가 이미 있으면 중복 저장하지 않는다."""
    exists = db.execute(
        select(AiAnalysisResult).where(
            AiAnalysisResult.post_id == post.id,
            AiAnalysisResult.user_id == user.id,
            AiAnalysisResult.analysis_type == analysis_type,
        )
    ).scalars().first()
    if exists is not None:
        return

    db.add(
        AiAnalysisResult(
            post_id=post.id,
            user_id=user.id,
            analysis_type=analysis_type,
            model_name=model_name,
            result_json=result_json,
        )
    )


if __name__ == "__main__":
    main()
