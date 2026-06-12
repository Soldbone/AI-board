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

        db.commit()
        print("Demo data is ready.")
        print(f"- Login: demo@example.com / {DEMO_PASSWORD}")
        print(f"- Reviewer: reviewer@example.com / {DEMO_PASSWORD}")
        print(f"- Idea post id: {idea_post.id}")
        print(f"- Review post id: {review_post.id}")
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
    ).scalar_one_or_none()
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
