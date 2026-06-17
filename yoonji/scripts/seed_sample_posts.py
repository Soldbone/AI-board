from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
import sys


ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.security import hash_password
from app.db.database import SessionLocal
from app.db.init_db import init_db
from app.models.board import Board
from app.models.enums import (
    BoardCode,
    FigureTargetType,
    FigureType,
    PostSourceType,
    PostStatus,
    PriceRange,
    UserStatus,
)
from app.models.post import Post
from app.models.post_figure_info import PostFigureInfo
from app.models.user import User


SAMPLE_USER = {
    "email": "phase4-reader@example.com",
    "login_id": "phase4_reader",
    "password": "password1234!",
    "nickname": "Phase4 Reader",
}

SAMPLE_POSTS = [
    {
        "board_code": BoardCode.REVIEW,
        "title": "넨도로이드 미쿠 NT 후기",
        "content": (
            "전체 도색은 깔끔하고 표정 파츠 구성이 좋아서 전시 만족도가 높았습니다. "
            "작은 부품이 많아서 조립할 때는 분실하지 않도록 트레이를 두고 작업하는 편이 좋습니다."
        ),
        "view_count": 14,
        "comment_count": 0,
        "figure_info": {
            "figure_name_text": "하츠네 미쿠 NT 넨도로이드",
            "manufacturer_text": "Good Smile Company",
            "figure_type": FigureType.NENDOROID,
            "price_amount": Decimal("68000.00"),
            "price_range": PriceRange.PRICE_50000_100000,
            "satisfaction_score": 5,
            "target_type": FigureTargetType.REVIEW_TARGET,
        },
    },
    {
        "board_code": BoardCode.INFO,
        "title": "피규어 먼지 관리 기본 루틴",
        "content": (
            "먼지는 부드러운 브러시로 먼저 털어내고, 끈적임이 있는 부분은 마른 천으로 강하게 문지르지 않는 것이 좋습니다. "
            "직사광선과 높은 습도를 피하면 변색과 끈적임을 줄일 수 있습니다."
        ),
        "view_count": 31,
        "comment_count": 0,
    },
    {
        "board_code": BoardCode.QUESTION,
        "title": "장식장 조명을 어떤 색온도로 맞추면 좋을까요?",
        "content": (
            "흰색과 파스텔톤 피규어가 많은 장식장입니다. "
            "너무 노랗거나 파랗지 않은 조명을 쓰고 싶은데 추천 색온도가 궁금합니다."
        ),
        "view_count": 8,
        "comment_count": 0,
    },
    {
        "board_code": BoardCode.PURCHASE_HELP,
        "title": "첫 스케일 피규어 구매 전에 고민 중입니다",
        "content": (
            "가격대가 높은 첫 스케일 피규어라 예약을 넣을지 고민 중입니다. "
            "공간, 관리 난이도, 만족도를 기준으로 어떤 점을 먼저 보면 좋을까요?"
        ),
        "view_count": 19,
        "comment_count": 0,
    },
]


def seed_sample_posts() -> None:
    init_db()
    db = SessionLocal()

    try:
        boards = {
            board.code: board
            for board in db.query(Board).filter(Board.is_active.is_(True)).all()
        }

        missing_codes = [
            code.value
            for code in [
                BoardCode.REVIEW,
                BoardCode.INFO,
                BoardCode.QUESTION,
                BoardCode.PURCHASE_HELP,
            ]
            if code not in boards
        ]

        if missing_codes:
            raise RuntimeError(
                "먼저 python scripts/seed_boards.py 를 실행해 주세요. "
                f"없는 게시판: {', '.join(missing_codes)}"
            )

        user = _get_or_create_sample_user(db)
        now = datetime.now(timezone.utc)

        for post_data in SAMPLE_POSTS:
            board = boards[post_data["board_code"]]
            post = _get_or_create_post(
                db,
                board=board,
                user=user,
                title=post_data["title"],
                now=now,
            )
            post.content = post_data["content"]
            post.source_type = PostSourceType.USER
            post.status = PostStatus.PUBLISHED
            post.view_count = post_data["view_count"]
            post.comment_count = post_data["comment_count"]
            post.published_at = post.published_at or now
            post.deleted_at = None

            figure_info_data = post_data.get("figure_info")
            if figure_info_data:
                _upsert_figure_info(db, post=post, data=figure_info_data)

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _get_or_create_sample_user(db) -> User:
    user = db.query(User).filter(User.login_id == SAMPLE_USER["login_id"]).one_or_none()

    if user is None:
        user = User(
            email=SAMPLE_USER["email"],
            login_id=SAMPLE_USER["login_id"],
            password_hash=hash_password(SAMPLE_USER["password"]),
            nickname=SAMPLE_USER["nickname"],
            status=UserStatus.ACTIVE,
        )
        db.add(user)
        db.flush()
        return user

    user.email = SAMPLE_USER["email"]
    user.nickname = SAMPLE_USER["nickname"]
    user.status = UserStatus.ACTIVE
    return user


def _get_or_create_post(db, *, board: Board, user: User, title: str, now: datetime) -> Post:
    post = (
        db.query(Post)
        .filter(Post.author_id == user.id, Post.title == title)
        .one_or_none()
    )

    if post is None:
        post = Post(
            board_id=board.id,
            author_id=user.id,
            title=title,
            content="",
            published_at=now,
        )
        db.add(post)
        db.flush()
        return post

    post.board_id = board.id
    post.author_id = user.id
    return post


def _upsert_figure_info(db, *, post: Post, data: dict) -> None:
    figure_info = (
        db.query(PostFigureInfo)
        .filter(PostFigureInfo.post_id == post.id)
        .one_or_none()
    )

    if figure_info is None:
        figure_info = PostFigureInfo(post_id=post.id, **data)
        db.add(figure_info)
        return

    for field_name, value in data.items():
        setattr(figure_info, field_name, value)


if __name__ == "__main__":
    seed_sample_posts()
    print("Seeded sample posts for Phase 4")
