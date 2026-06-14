from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from hashlib import sha256
from math import sqrt
from pathlib import Path
import shutil
import sys
from typing import Any

from sqlalchemy import or_

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.ai.rag import document_loader, text_splitter
from app.core.config import settings
from app.core.security import hash_password
from app.db.database import SessionLocal
from app.db.init_db import init_db
from app.models.ai_output import AiOutput
from app.models.ai_output_source import AiOutputSource
from app.models.auth_session import AuthSession
from app.models.board import Board
from app.models.comment import Comment
from app.models.content_chunk import ContentChunk
from app.models.enums import (
    AiOutputStatus,
    AiOutputType,
    BoardCode,
    CommentStatus,
    ContentChunkStatus,
    ContentSourceType,
    FigureTargetType,
    FigureType,
    GroundingStatus,
    ImageStatus,
    PostSourceType,
    PostStatus,
    PriceRange,
    TagStatus,
    TagType,
    UserRole,
    UserStatus,
)
from app.models.post import Post
from app.models.post_figure_info import PostFigureInfo
from app.models.post_image import PostImage
from app.models.post_tag import PostTag
from app.models.tag import Tag
from app.models.user import User
from app.utils.normalizer import normalize_tag_name


DEV_PASSWORD = "devpass1234!"
DEV_EMBEDDING_MODEL = "dev-deterministic-embedding-v1"
DEV_IMAGE_DIR_NAME = "dev-seed"

DEV_USERS = [
    {
        "email": "dev_yoonji@example.com",
        "login_id": "dev_yoonji",
        "nickname": "Yoonji Dev",
        "role": UserRole.USER,
    },
    {
        "email": "dev_miku@example.com",
        "login_id": "dev_miku",
        "nickname": "Miku Reviewer",
        "role": UserRole.USER,
    },
    {
        "email": "dev_collector@example.com",
        "login_id": "dev_collector",
        "nickname": "Collector Kim",
        "role": UserRole.USER,
    },
]

POST_SEEDS = [
    {
        "board_code": BoardCode.REVIEW,
        "author": "dev_miku",
        "title": "하츠네 미쿠 NT 넨도로이드 후기 - 표정 파츠가 좋아요",
        "content": (
            "하츠네 미쿠 NT 넨도로이드는 표정 파츠 구성이 풍부해서 전시 분위기를 바꾸기 좋았습니다. "
            "Good Smile Company 특유의 도색 마감은 깔끔했고, 머리카락 파츠의 그라데이션도 만족스러웠습니다. "
            "다만 트윈테일 조인트가 작아서 조립할 때 힘을 너무 주지 않는 편이 좋고, 작은 손 파츠는 분실 방지가 필요합니다. "
            "7만원 안팎 가격대에서는 입문자에게도 추천할 만한 구성이었습니다."
        ),
        "view_count": 128,
        "figure_info": {
            "figure_name_text": "하츠네 미쿠 NT 넨도로이드",
            "manufacturer_text": "Good Smile Company",
            "figure_type": FigureType.NENDOROID,
            "price_amount": Decimal("68000.00"),
            "price_range": PriceRange.PRICE_50000_100000,
            "purchase_date": date(2026, 4, 20),
            "satisfaction_score": 5,
        },
        "tags": [
            ("하츠네 미쿠", TagType.CHARACTER),
            ("넨도로이드", TagType.GENERAL),
            ("Good Smile Company", TagType.MANUFACTURER),
            ("입문추천", TagType.TOPIC),
        ],
        "image": {
            "filename": "miku-nt-nendoroid.svg",
            "label": "Miku NT",
            "color": "#38d2d2",
        },
        "comments": [
            {
                "author": "dev_collector",
                "content": "저도 트윈테일 조인트만 조심하면 만족도가 높았습니다. 표정 파츠가 정말 좋아요.",
            }
        ],
    },
    {
        "board_code": BoardCode.REVIEW,
        "author": "dev_collector",
        "title": "하츠네 미쿠 NT 넨도로이드 재판판 조립 후기",
        "content": (
            "재판판 기준으로 도색 튐은 거의 없었고 얼굴 프린팅도 선명했습니다. "
            "기본 스탠드가 단단해서 장식장 안에서 안정감이 있었지만, 헤어 파츠가 넓어 옆 공간은 조금 필요합니다. "
            "Good Smile Company 넨도로이드에 익숙하지 않다면 설명서를 천천히 보면서 조립하는 것을 추천합니다."
        ),
        "view_count": 76,
        "figure_info": {
            "figure_name_text": "하츠네 미쿠 NT 넨도로이드",
            "manufacturer_text": "Good Smile Company",
            "figure_type": FigureType.NENDOROID,
            "price_amount": Decimal("72000.00"),
            "price_range": PriceRange.PRICE_50000_100000,
            "purchase_date": date(2026, 5, 12),
            "satisfaction_score": 4,
        },
        "tags": [
            ("하츠네 미쿠", TagType.CHARACTER),
            ("넨도로이드", TagType.GENERAL),
            ("Good Smile Company", TagType.MANUFACTURER),
            ("조립주의", TagType.TOPIC),
        ],
        "image": {
            "filename": "miku-nt-reissue.svg",
            "label": "Miku Reissue",
            "color": "#2f5f63",
        },
        "comments": [],
    },
    {
        "board_code": BoardCode.REVIEW,
        "author": "dev_yoonji",
        "title": "카가미네 린 넨도로이드 후기 - 비슷한 가격대 만족",
        "content": (
            "카가미네 린 넨도로이드는 6만원대 후반 가격에서 파츠 구성이 알차고 표정 변화가 뚜렷했습니다. "
            "하츠네 미쿠 넨도로이드와 같이 전시하면 크기와 색감 균형이 좋아서 같은 장식장 라인업으로 잘 어울립니다. "
            "머리 장식 파츠는 작으니 보관 케이스를 따로 두는 편이 좋습니다."
        ),
        "view_count": 64,
        "figure_info": {
            "figure_name_text": "카가미네 린 넨도로이드",
            "manufacturer_text": "Good Smile Company",
            "figure_type": FigureType.NENDOROID,
            "price_amount": Decimal("66000.00"),
            "price_range": PriceRange.PRICE_50000_100000,
            "purchase_date": date(2026, 3, 9),
            "satisfaction_score": 5,
        },
        "tags": [
            ("카가미네 린", TagType.CHARACTER),
            ("넨도로이드", TagType.GENERAL),
            ("Good Smile Company", TagType.MANUFACTURER),
            ("입문추천", TagType.TOPIC),
        ],
        "image": {
            "filename": "rin-nendoroid.svg",
            "label": "Rin",
            "color": "#f7d154",
        },
        "comments": [],
    },
    {
        "board_code": BoardCode.REVIEW,
        "author": "dev_collector",
        "title": "라이자 1/7 스케일 피규어 첫 구매 후기",
        "content": (
            "첫 스케일 피규어로 라이자 1/7을 구매했는데, 넨도로이드보다 공간은 많이 차지하지만 존재감이 확실했습니다. "
            "도색은 피부 톤과 의상 경계가 깔끔했고 베이스가 넓어 장식장 높이와 깊이를 먼저 재는 것이 중요했습니다. "
            "15만원대 예산이라면 배송비와 장식 공간까지 함께 계산하는 편이 안전합니다."
        ),
        "view_count": 92,
        "figure_info": {
            "figure_name_text": "라이자 1/7 스케일 피규어",
            "manufacturer_text": "Good Smile Company",
            "figure_type": FigureType.SCALE,
            "price_amount": Decimal("158000.00"),
            "price_range": PriceRange.PRICE_100000_200000,
            "purchase_date": date(2026, 2, 3),
            "satisfaction_score": 4,
        },
        "tags": [
            ("라이자", TagType.CHARACTER),
            ("스케일", TagType.GENERAL),
            ("첫스케일", TagType.TOPIC),
            ("장식장", TagType.TOPIC),
        ],
        "image": {
            "filename": "ryza-scale.svg",
            "label": "Ryza",
            "color": "#d97706",
        },
        "comments": [
            {
                "author": "dev_yoonji",
                "content": "첫 스케일이면 장식장 깊이부터 확인하는 게 정말 중요하더라고요.",
            }
        ],
    },
    {
        "board_code": BoardCode.REVIEW,
        "author": "dev_miku",
        "title": "알베도 1/7 스케일 피규어 후기",
        "content": (
            "알베도 1/7 스케일은 조형 밀도가 높고 날개 파츠가 화려해서 만족도는 높았습니다. "
            "대신 20만원이 넘는 가격대라 예약 전 마감 사진과 실제 전시 공간을 꼭 확인하는 편이 좋습니다. "
            "먼지가 잘 보이는 어두운 파츠가 많아 케이스 전시가 더 어울렸습니다."
        ),
        "view_count": 111,
        "figure_info": {
            "figure_name_text": "알베도 1/7 스케일 피규어",
            "manufacturer_text": "Alter",
            "figure_type": FigureType.SCALE,
            "price_amount": Decimal("238000.00"),
            "price_range": PriceRange.OVER_200000,
            "purchase_date": date(2026, 1, 18),
            "satisfaction_score": 4,
        },
        "tags": [
            ("알베도", TagType.CHARACTER),
            ("스케일", TagType.GENERAL),
            ("Alter", TagType.MANUFACTURER),
            ("고가피규어", TagType.PRICE),
        ],
        "image": {
            "filename": "albedo-scale.svg",
            "label": "Albedo",
            "color": "#7c3aed",
        },
        "comments": [],
    },
    {
        "board_code": BoardCode.INFO,
        "author": "dev_yoonji",
        "title": "장식장 조명 색온도 기본 가이드",
        "content": (
            "피규어 장식장 조명은 4000K 전후의 중성광이 색 왜곡이 적어서 무난합니다. "
            "흰색과 파스텔톤 피규어가 많다면 너무 푸른 6500K보다 4000K에서 5000K 사이를 먼저 테스트해 보세요. "
            "CRI가 높은 LED를 쓰면 도색 색감이 더 자연스럽게 보입니다."
        ),
        "view_count": 55,
        "tags": [
            ("장식장", TagType.TOPIC),
            ("조명", TagType.TOPIC),
            ("관리", TagType.TOPIC),
        ],
        "comments": [],
    },
    {
        "board_code": BoardCode.INFO,
        "author": "dev_collector",
        "title": "피규어 먼지 관리 기본 루틴",
        "content": (
            "먼지는 부드러운 브러시로 먼저 털고, 끈적임이 있는 파츠는 마른 천으로 강하게 문지르지 않는 것이 좋습니다. "
            "직사광선과 높은 습도를 피하면 변색과 끈적임을 줄일 수 있습니다."
        ),
        "view_count": 43,
        "tags": [
            ("관리", TagType.TOPIC),
            ("먼지", TagType.TOPIC),
            ("장식장", TagType.TOPIC),
        ],
        "comments": [],
    },
    {
        "board_code": BoardCode.QUESTION,
        "author": "dev_yoonji",
        "title": "장식장 LED 조명 색온도 써보신 분?",
        "content": (
            "파스텔톤 피규어가 많은 장식장에 LED 바를 달려고 합니다. "
            "4000K와 6500K 중 어떤 쪽이 도색 색감을 덜 왜곡할까요?"
        ),
        "view_count": 37,
        "tags": [
            ("장식장", TagType.TOPIC),
            ("조명", TagType.TOPIC),
            ("질문", TagType.GENERAL),
        ],
        "comments": [
            {
                "author": "dev_collector",
                "content": "저는 4000K 중성광이 제일 무난했습니다. 6500K는 흰색 파츠가 차갑게 떠 보였어요.",
            },
            {
                "author": "dev_miku",
                "content": "CRI 90 이상 LED를 쓰면 색감이 덜 틀어집니다. 밝기는 디머로 낮출 수 있으면 더 좋아요.",
            },
        ],
    },
    {
        "board_code": BoardCode.QUESTION,
        "author": "dev_collector",
        "title": "장식장 조명을 어떤 색온도로 맞추면 좋을까요?",
        "content": (
            "흰색과 파스텔톤 피규어가 많은 장식장입니다. "
            "너무 노랗거나 파랗지 않은 조명을 쓰고 싶은데 추천 색온도가 궁금합니다."
        ),
        "view_count": 21,
        "tags": [
            ("장식장", TagType.TOPIC),
            ("조명", TagType.TOPIC),
            ("질문", TagType.GENERAL),
        ],
        "comments": [],
    },
    {
        "board_code": BoardCode.QUESTION,
        "author": "dev_miku",
        "title": "넨도로이드 작은 부품 보관 방법?",
        "content": (
            "손 파츠와 표정 파츠가 많아지니 어디에 보관해야 할지 모르겠습니다. "
            "분실 없이 정리하는 방법이 있을까요?"
        ),
        "view_count": 18,
        "tags": [
            ("넨도로이드", TagType.GENERAL),
            ("보관", TagType.TOPIC),
            ("질문", TagType.GENERAL),
        ],
        "comments": [
            {
                "author": "dev_yoonji",
                "content": "작은 지퍼백에 피규어 이름을 적고, 파츠 박스를 따로 두면 섞이지 않습니다.",
            }
        ],
    },
    {
        "board_code": BoardCode.QUESTION,
        "author": "dev_collector",
        "title": "첫 스케일 피규어 예약 전 확인할 점?",
        "content": (
            "첫 스케일 피규어를 예약하려는데 가격 말고 어떤 부분을 먼저 확인해야 할까요?"
        ),
        "view_count": 25,
        "tags": [
            ("스케일", TagType.GENERAL),
            ("첫스케일", TagType.TOPIC),
            ("질문", TagType.GENERAL),
        ],
        "comments": [
            {
                "author": "dev_miku",
                "content": "장식장 높이와 깊이, 배송비, 예약 취소 규정을 먼저 확인해 보세요.",
            },
            {
                "author": "dev_yoonji",
                "content": "제조사 샘플 사진뿐 아니라 실제 양산품 후기도 같이 보는 게 좋습니다.",
            },
        ],
    },
    {
        "board_code": BoardCode.PURCHASE_HELP,
        "author": "dev_yoonji",
        "title": "하츠네 미쿠 NT 넨도로이드 살까요?",
        "content": (
            "하츠네 미쿠 NT 넨도로이드를 7만원 정도에 살지 고민 중입니다. "
            "Good Smile Company 제품은 처음이고 표정 파츠와 조립 난이도, 전시 만족도가 궁금합니다."
        ),
        "view_count": 34,
        "tags": [
            ("하츠네 미쿠", TagType.CHARACTER),
            ("넨도로이드", TagType.GENERAL),
            ("구매고민", TagType.TOPIC),
        ],
        "comments": [],
    },
    {
        "board_code": BoardCode.PURCHASE_HELP,
        "author": "dev_collector",
        "title": "첫 스케일 피규어 예약 고민입니다",
        "content": (
            "15만원대 첫 스케일 피규어를 예약할지 고민입니다. "
            "공간, 관리 난이도, 만족도 기준으로 어떤 점을 먼저 보면 좋을까요?"
        ),
        "view_count": 29,
        "tags": [
            ("스케일", TagType.GENERAL),
            ("첫스케일", TagType.TOPIC),
            ("구매고민", TagType.TOPIC),
        ],
        "comments": [],
    },
    {
        "board_code": BoardCode.PURCHASE_HELP,
        "author": "dev_miku",
        "title": "고가 레진 킷 구매 고민",
        "content": (
            "30만원이 넘는 레진 킷을 살지 고민 중인데, 아직 같은 제품 후기가 거의 없어 보입니다. "
            "도색 의뢰와 파손 리스크도 걱정됩니다."
        ),
        "view_count": 12,
        "tags": [
            ("고가피규어", TagType.PRICE),
            ("구매고민", TagType.TOPIC),
            ("레진킷", TagType.GENERAL),
        ],
        "comments": [],
    },
]

AI_OUTPUT_SEEDS = [
    {
        "target_title": "장식장 조명을 어떤 색온도로 맞추면 좋을까요?",
        "requester": "dev_collector",
        "output_type": AiOutputType.QUESTION_REFERENCE_ANSWER,
        "title": "AI 참고 답변 예시",
        "content": (
            "과거 질문과 댓글 기준으로는 4000K 전후의 중성광이 가장 무난하다는 의견이 반복됩니다.\n"
            "6500K는 흰색 파츠가 차갑게 떠 보일 수 있다는 경험담이 있고, CRI 90 이상 LED를 쓰면 도색 색감 왜곡을 줄이는 데 도움이 됩니다.\n"
            "근거는 제한적이므로 실제 장식장에서는 밝기 조절이 되는 LED로 먼저 테스트해 보는 편이 좋습니다."
        ),
        "grounding_status": GroundingStatus.GROUNDED,
        "confidence_score": 0.86,
        "source_titles": ["장식장 LED 조명 색온도 써보신 분?"],
        "source_comment_contains": ["4000K 중성광", "CRI 90"],
    },
    {
        "target_title": "하츠네 미쿠 NT 넨도로이드 살까요?",
        "requester": "dev_yoonji",
        "output_type": AiOutputType.PURCHASE_SUMMARY,
        "title": "AI 구매 요약 예시",
        "content": (
            "동일 피규어 후기를 보면 하츠네 미쿠 NT 넨도로이드는 표정 파츠와 도색 만족도가 강점입니다.\n"
            "주의점은 트윈테일 조인트와 작은 손 파츠처럼 조립 중 분실하거나 힘을 과하게 줄 수 있는 부품입니다.\n"
            "7만원 안팎 가격대에서는 만족도가 높은 편이지만, 넨도로이드 조립이 처음이라면 설명서를 천천히 보면서 조립하는 쪽이 안전합니다."
        ),
        "grounding_status": GroundingStatus.GROUNDED,
        "confidence_score": 0.91,
        "source_titles": [
            "하츠네 미쿠 NT 넨도로이드 후기 - 표정 파츠가 좋아요",
            "하츠네 미쿠 NT 넨도로이드 재판판 조립 후기",
            "카가미네 린 넨도로이드 후기 - 비슷한 가격대 만족",
        ],
        "source_comment_contains": [],
    },
    {
        "target_title": "첫 스케일 피규어 예약 고민입니다",
        "requester": "dev_collector",
        "output_type": AiOutputType.PURCHASE_SUMMARY,
        "title": "AI 구매 요약 예시",
        "content": (
            "동일 제품 후기는 없지만, 비슷한 10만~20만원대 스케일 후기에서는 장식장 깊이와 배송비를 먼저 확인하라는 조언이 반복됩니다.\n"
            "장점은 스케일 피규어 특유의 존재감이고, 주의점은 넨도로이드보다 공간을 많이 차지한다는 점입니다.\n"
            "예약 전에는 실제 양산품 후기와 예약 취소 규정을 같이 확인하는 것이 좋습니다."
        ),
        "grounding_status": GroundingStatus.PARTIALLY_GROUNDED,
        "confidence_score": 0.78,
        "source_titles": [
            "라이자 1/7 스케일 피규어 첫 구매 후기",
            "알베도 1/7 스케일 피규어 후기",
        ],
        "source_comment_contains": [],
    },
    {
        "target_title": "고가 레진 킷 구매 고민",
        "requester": "dev_miku",
        "output_type": AiOutputType.PURCHASE_SUMMARY,
        "title": "AI 구매 요약 예시 - 근거 부족",
        "content": "관련 후기 근거가 부족해 구매 요약이나 추천을 생성할 수 없습니다.",
        "grounding_status": GroundingStatus.NO_EVIDENCE,
        "confidence_score": 0.0,
        "source_titles": [],
        "source_comment_contains": [],
    },
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed development data, including deterministic RAG chunks."
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete previously seeded development rows before inserting fresh data.",
    )
    parser.add_argument(
        "--reset-only",
        action="store_true",
        help="Delete development seed rows and exit without inserting new data.",
    )
    parser.add_argument(
        "--embedding-dim",
        type=int,
        default=1536,
        help="Deterministic vector length. Use 1536 to match text-embedding-3-small.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    init_db()
    db = SessionLocal()

    try:
        if args.reset or args.reset_only:
            reset_dev_data(db)
            db.commit()

        if args.reset_only:
            print("Deleted development seed data.")
            return

        result = seed_dev_data(db, embedding_dim=args.embedding_dim)
        db.commit()
        print_seed_summary(result)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def seed_dev_data(db, *, embedding_dim: int) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    users = upsert_users(db)
    boards = get_boards(db)
    tags = upsert_tags(db)
    posts = upsert_posts(db, users=users, boards=boards, tags=tags, now=now)
    chunks = rebuild_content_chunks(db, posts=posts, embedding_dim=embedding_dim, now=now)
    ai_outputs = rebuild_ai_outputs(db, users=users, posts=posts, chunks=chunks, now=now)
    refresh_comment_counts(db, posts)
    refresh_tag_usage_counts(db)
    write_placeholder_images()

    return {
        "users": users,
        "posts": posts,
        "chunks": chunks,
        "ai_outputs": ai_outputs,
    }


def upsert_users(db) -> dict[str, User]:
    users: dict[str, User] = {}

    for user_seed in DEV_USERS:
        user = (
            db.query(User)
            .filter(User.login_id == user_seed["login_id"])
            .one_or_none()
        )

        if user is None:
            user = User(
                email=user_seed["email"],
                login_id=user_seed["login_id"],
                password_hash=hash_password(DEV_PASSWORD),
                nickname=user_seed["nickname"],
                profile_image_url=None,
                role=user_seed["role"],
                status=UserStatus.ACTIVE,
            )
            db.add(user)
            db.flush()
        else:
            user.email = user_seed["email"]
            user.password_hash = hash_password(DEV_PASSWORD)
            user.nickname = user_seed["nickname"]
            user.profile_image_url = None
            user.role = user_seed["role"]
            user.status = UserStatus.ACTIVE

        users[user.login_id] = user

    return users


def get_boards(db) -> dict[BoardCode, Board]:
    boards = {
        board.code: board
        for board in db.query(Board).filter(Board.is_active.is_(True)).all()
    }
    missing = [
        board_code.value
        for board_code in [
            BoardCode.REVIEW,
            BoardCode.INFO,
            BoardCode.QUESTION,
            BoardCode.PURCHASE_HELP,
        ]
        if board_code not in boards
    ]

    if missing:
        raise RuntimeError(f"Missing boards after init_db: {', '.join(missing)}")

    return boards


def upsert_tags(db) -> dict[tuple[str, TagType], Tag]:
    tags: dict[tuple[str, TagType], Tag] = {}

    for tag_name, tag_type in sorted(_all_tag_specs(), key=lambda value: value[0]):
        normalized_name = normalize_tag_name(tag_name)
        key = (normalized_name, tag_type)
        tag = (
            db.query(Tag)
            .filter(Tag.normalized_name == normalized_name, Tag.tag_type == tag_type)
            .one_or_none()
        )

        if tag is None:
            tag = Tag(
                name=tag_name,
                normalized_name=normalized_name,
                tag_type=tag_type,
                usage_count=0,
                status=TagStatus.ACTIVE,
            )
            db.add(tag)
            db.flush()
        else:
            tag.name = tag_name
            tag.status = TagStatus.ACTIVE

        tags[key] = tag

    return tags


def upsert_posts(
    db,
    *,
    users: dict[str, User],
    boards: dict[BoardCode, Board],
    tags: dict[tuple[str, TagType], Tag],
    now: datetime,
) -> dict[str, Post]:
    posts: dict[str, Post] = {}

    for index, post_seed in enumerate(POST_SEEDS):
        author = users[post_seed["author"]]
        board = boards[post_seed["board_code"]]
        post = (
            db.query(Post)
            .filter(Post.author_id == author.id, Post.title == post_seed["title"])
            .one_or_none()
        )

        if post is None:
            post = Post(
                board_id=board.id,
                author_id=author.id,
                title=post_seed["title"],
                content=post_seed["content"],
                source_type=PostSourceType.USER,
                status=PostStatus.PUBLISHED,
                view_count=post_seed["view_count"],
                comment_count=0,
                published_at=now - timedelta(days=len(POST_SEEDS) - index),
                deleted_at=None,
            )
            db.add(post)
            db.flush()
        else:
            clear_post_children(db, post)
            post.board_id = board.id
            post.author_id = author.id
            post.title = post_seed["title"]
            post.content = post_seed["content"]
            post.source_type = PostSourceType.USER
            post.status = PostStatus.PUBLISHED
            post.view_count = post_seed["view_count"]
            post.comment_count = 0
            post.published_at = post.published_at or now - timedelta(
                days=len(POST_SEEDS) - index
            )
            post.deleted_at = None

        figure_info = post_seed.get("figure_info")
        if figure_info is not None:
            db.add(
                PostFigureInfo(
                    post_id=post.id,
                    target_type=FigureTargetType.REVIEW_TARGET,
                    **figure_info,
                )
            )

        for tag_name, tag_type in post_seed["tags"]:
            normalized_name = normalize_tag_name(tag_name)
            db.add(PostTag(post_id=post.id, tag_id=tags[(normalized_name, tag_type)].id))

        if image_seed := post_seed.get("image"):
            db.add(
                PostImage(
                    post_id=post.id,
                    uploader_id=author.id,
                    file_url=f"/uploads/{DEV_IMAGE_DIR_NAME}/{image_seed['filename']}",
                    thumbnail_url=f"/uploads/{DEV_IMAGE_DIR_NAME}/{image_seed['filename']}",
                    original_name=image_seed["filename"],
                    mime_type="image/svg+xml",
                    size_bytes=2048,
                    width=960,
                    height=720,
                    sort_order=0,
                    status=ImageStatus.ATTACHED,
                )
            )

        db.flush()

        for comment_seed in post_seed["comments"]:
            db.add(
                Comment(
                    post_id=post.id,
                    author_id=users[comment_seed["author"]].id,
                    content=comment_seed["content"],
                    status=CommentStatus.PUBLISHED,
                    deleted_at=None,
                )
            )

        post.comment_count = len(post_seed["comments"])
        posts[post.title] = post

    db.flush()
    return posts


def rebuild_content_chunks(
    db,
    *,
    posts: dict[str, Post],
    embedding_dim: int,
    now: datetime,
) -> dict[str, list[ContentChunk]]:
    chunks_by_key: dict[str, list[ContentChunk]] = {}

    for post in posts.values():
        document = document_loader.build_post_document(post)
        if document is not None:
            chunks_by_key[f"post:{post.title}"] = create_chunks_for_document(
                db,
                document=document,
                source_type=ContentSourceType.POST,
                post_id=post.id,
                comment_id=None,
                board_code=post.board.code,
                embedding_dim=embedding_dim,
                now=now,
            )

        comments = (
            db.query(Comment)
            .filter(
                Comment.post_id == post.id,
                Comment.status == CommentStatus.PUBLISHED,
                Comment.deleted_at.is_(None),
            )
            .order_by(Comment.id.asc())
            .all()
        )

        for comment in comments:
            document = document_loader.build_comment_document(comment)
            if document is None:
                continue

            chunks_by_key[f"comment:{comment.id}"] = create_chunks_for_document(
                db,
                document=document,
                source_type=ContentSourceType.COMMENT,
                post_id=post.id,
                comment_id=comment.id,
                board_code=post.board.code,
                embedding_dim=embedding_dim,
                now=now,
            )

    db.flush()
    return chunks_by_key


def create_chunks_for_document(
    db,
    *,
    document,
    source_type: ContentSourceType,
    post_id: int | None,
    comment_id: int | None,
    board_code: BoardCode,
    embedding_dim: int,
    now: datetime,
) -> list[ContentChunk]:
    created_chunks: list[ContentChunk] = []

    for chunk in text_splitter.split_document(document, chunk_size=700, chunk_overlap=100):
        chunk_index = int(chunk.metadata.get("chunk_index", 0))
        content_chunk = ContentChunk(
            source_type=source_type,
            post_id=post_id,
            comment_id=comment_id,
            board_code=board_code,
            chunk_index=chunk_index,
            chunk_text=chunk.page_content,
            embedding_model=DEV_EMBEDDING_MODEL,
            embedding_vector=deterministic_embedding(
                chunk.page_content,
                dimension=embedding_dim,
            ),
            token_count=text_splitter.estimate_token_count(chunk.page_content),
            index_status=ContentChunkStatus.INDEXED,
            metadata_json={
                **chunk.metadata,
                "seed": "dev",
                "embedding_note": "deterministic mock vector; no OpenAI API call",
            },
            indexed_at=now,
        )
        db.add(content_chunk)
        created_chunks.append(content_chunk)

    return created_chunks


def rebuild_ai_outputs(
    db,
    *,
    users: dict[str, User],
    posts: dict[str, Post],
    chunks: dict[str, list[ContentChunk]],
    now: datetime,
) -> list[AiOutput]:
    outputs: list[AiOutput] = []

    for output_seed in AI_OUTPUT_SEEDS:
        target_post = posts[output_seed["target_title"]]
        requester = users[output_seed["requester"]]
        ai_output = AiOutput(
            output_type=output_seed["output_type"],
            requester_id=requester.id,
            target_post_id=target_post.id,
            query_text=f"{target_post.title}\n\n{target_post.content}",
            title=output_seed["title"],
            content=output_seed["content"],
            status=AiOutputStatus.GENERATED,
            grounding_status=output_seed["grounding_status"],
            confidence_score=output_seed["confidence_score"],
            model_name="dev-seed-static-output",
            metadata_json={
                "seed": "dev",
                "generated_by": "scripts/seed_dev_data.py",
                "uses_openai_api": False,
            },
            error_message=None,
            completed_at=now,
        )
        db.add(ai_output)
        db.flush()

        source_chunks = resolve_source_chunks(output_seed, chunks)
        for rank_order, source_chunk in enumerate(source_chunks, start=1):
            db.add(
                AiOutputSource(
                    ai_output_id=ai_output.id,
                    content_chunk_id=source_chunk.id,
                    source_post_id=source_chunk.post_id,
                    source_comment_id=source_chunk.comment_id,
                    relevance_score=max(0.5, 0.96 - (rank_order * 0.05)),
                    rank_order=rank_order,
                    excerpt=make_excerpt(source_chunk.chunk_text),
                )
            )

        outputs.append(ai_output)

    return outputs


def resolve_source_chunks(
    output_seed: dict[str, Any],
    chunks: dict[str, list[ContentChunk]],
) -> list[ContentChunk]:
    selected: list[ContentChunk] = []

    for title in output_seed["source_titles"]:
        selected.extend(chunks.get(f"post:{title}", [])[:1])

    comment_needles = output_seed.get("source_comment_contains", [])
    if comment_needles:
        for key, chunk_list in chunks.items():
            if not key.startswith("comment:"):
                continue

            for chunk in chunk_list:
                if any(needle in chunk.chunk_text for needle in comment_needles):
                    selected.append(chunk)
                    break

    deduped: list[ContentChunk] = []
    seen_ids: set[int] = set()

    for chunk in selected:
        if chunk.id in seen_ids:
            continue
        seen_ids.add(chunk.id)
        deduped.append(chunk)

    return deduped


def clear_post_children(db, post: Post) -> None:
    comment_ids = [comment.id for comment in post.comments]

    db.query(AiOutputSource).filter(
        AiOutputSource.ai_output.has(AiOutput.target_post_id == post.id)
    ).delete(synchronize_session=False)
    db.query(AiOutput).filter(AiOutput.target_post_id == post.id).delete(
        synchronize_session=False
    )

    if comment_ids:
        db.query(AiOutputSource).filter(
            AiOutputSource.source_comment_id.in_(comment_ids)
        ).delete(synchronize_session=False)
        db.query(ContentChunk).filter(ContentChunk.comment_id.in_(comment_ids)).delete(
            synchronize_session=False
        )

    db.query(AiOutputSource).filter(AiOutputSource.source_post_id == post.id).delete(
        synchronize_session=False
    )
    db.query(ContentChunk).filter(ContentChunk.post_id == post.id).delete(
        synchronize_session=False
    )
    db.query(Comment).filter(Comment.post_id == post.id).delete(
        synchronize_session=False
    )
    db.query(PostImage).filter(PostImage.post_id == post.id).delete(
        synchronize_session=False
    )
    db.query(PostTag).filter(PostTag.post_id == post.id).delete(
        synchronize_session=False
    )
    db.query(PostFigureInfo).filter(PostFigureInfo.post_id == post.id).delete(
        synchronize_session=False
    )
    db.flush()


def reset_dev_data(db) -> None:
    dev_login_ids = [user_seed["login_id"] for user_seed in DEV_USERS]
    dev_user_ids = [
        user_id
        for (user_id,) in db.query(User.id).filter(User.login_id.in_(dev_login_ids)).all()
    ]
    dev_titles = [post_seed["title"] for post_seed in POST_SEEDS]
    post_filters = [Post.title.in_(dev_titles)]

    if dev_user_ids:
        post_filters.append(Post.author_id.in_(dev_user_ids))

    dev_post_ids = [
        post_id
        for (post_id,) in db.query(Post.id).filter(or_(*post_filters)).all()
    ]
    comment_filters = [Comment.post_id.in_(dev_post_ids)]

    if dev_user_ids:
        comment_filters.append(Comment.author_id.in_(dev_user_ids))

    dev_comment_ids = [
        comment_id
        for (comment_id,) in db.query(Comment.id)
        .filter(or_(*comment_filters))
        .all()
    ]
    affected_comment_post_ids = [
        post_id
        for (post_id,) in db.query(Comment.post_id)
        .filter(Comment.id.in_(dev_comment_ids))
        .distinct()
        .all()
    ] if dev_comment_ids else []

    if dev_post_ids or dev_user_ids:
        filters = []
        if dev_post_ids:
            filters.append(AiOutput.target_post_id.in_(dev_post_ids))
        if dev_user_ids:
            filters.append(AiOutput.requester_id.in_(dev_user_ids))

        ai_output_ids = [
            output_id
            for (output_id,) in db.query(AiOutput.id).filter(or_(*filters)).all()
        ] if filters else []

        if ai_output_ids:
            db.query(AiOutputSource).filter(
                AiOutputSource.ai_output_id.in_(ai_output_ids)
            ).delete(synchronize_session=False)
            db.query(AiOutput).filter(AiOutput.id.in_(ai_output_ids)).delete(
                synchronize_session=False
            )

    if dev_comment_ids:
        db.query(AiOutputSource).filter(
            AiOutputSource.source_comment_id.in_(dev_comment_ids)
        ).delete(synchronize_session=False)
        db.query(ContentChunk).filter(ContentChunk.comment_id.in_(dev_comment_ids)).delete(
            synchronize_session=False
        )
        db.query(Comment).filter(Comment.id.in_(dev_comment_ids)).delete(
            synchronize_session=False
        )

    if dev_post_ids:
        db.query(AiOutputSource).filter(
            AiOutputSource.source_post_id.in_(dev_post_ids)
        ).delete(synchronize_session=False)
        db.query(ContentChunk).filter(ContentChunk.post_id.in_(dev_post_ids)).delete(
            synchronize_session=False
        )
        db.query(PostImage).filter(PostImage.post_id.in_(dev_post_ids)).delete(
            synchronize_session=False
        )
        db.query(PostTag).filter(PostTag.post_id.in_(dev_post_ids)).delete(
            synchronize_session=False
        )
        db.query(PostFigureInfo).filter(PostFigureInfo.post_id.in_(dev_post_ids)).delete(
            synchronize_session=False
        )
        db.query(Post).filter(Post.id.in_(dev_post_ids)).delete(
            synchronize_session=False
        )

    if dev_user_ids:
        db.query(AuthSession).filter(AuthSession.user_id.in_(dev_user_ids)).delete(
            synchronize_session=False
        )
        db.query(PostImage).filter(PostImage.uploader_id.in_(dev_user_ids)).delete(
            synchronize_session=False
        )
        db.query(User).filter(User.id.in_(dev_user_ids)).delete(
            synchronize_session=False
        )

    for post_id in affected_comment_post_ids:
        if post_id in dev_post_ids:
            continue

        post = db.get(Post, post_id)
        if post is None:
            continue

        post.comment_count = (
            db.query(Comment)
            .filter(
                Comment.post_id == post.id,
                Comment.status == CommentStatus.PUBLISHED,
                Comment.deleted_at.is_(None),
            )
            .count()
        )

    normalized_names = [normalize_tag_name(name) for name, _ in _all_tag_specs()]
    unused_tags = (
        db.query(Tag)
        .filter(Tag.normalized_name.in_(normalized_names))
        .all()
    )

    for tag in unused_tags:
        link_count = db.query(PostTag).filter(PostTag.tag_id == tag.id).count()

        if link_count == 0:
            db.delete(tag)

    remove_placeholder_images()
    db.flush()


def refresh_comment_counts(db, posts: dict[str, Post]) -> None:
    for post in posts.values():
        post.comment_count = (
            db.query(Comment)
            .filter(
                Comment.post_id == post.id,
                Comment.status == CommentStatus.PUBLISHED,
                Comment.deleted_at.is_(None),
            )
            .count()
        )


def refresh_tag_usage_counts(db) -> None:
    for tag in db.query(Tag).all():
        tag.usage_count = (
            db.query(PostTag)
            .join(Post)
            .filter(
                PostTag.tag_id == tag.id,
                Post.status == PostStatus.PUBLISHED,
                Post.deleted_at.is_(None),
            )
            .count()
        )


def deterministic_embedding(text: str, *, dimension: int) -> list[float]:
    values: list[float] = []

    for index in range(dimension):
        digest = sha256(f"{text}|{index}".encode("utf-8")).digest()
        raw_value = int.from_bytes(digest[:4], "big") / 0xFFFFFFFF
        values.append((raw_value * 2.0) - 1.0)

    norm = sqrt(sum(value * value for value in values))

    if norm == 0:
        return values

    return [round(value / norm, 8) for value in values]


def write_placeholder_images() -> None:
    image_root = Path(settings.upload_root) / DEV_IMAGE_DIR_NAME
    image_root.mkdir(parents=True, exist_ok=True)

    for post_seed in POST_SEEDS:
        image_seed = post_seed.get("image")
        if image_seed is None:
            continue

        image_path = image_root / image_seed["filename"]
        image_path.write_text(
            build_svg_placeholder(
                label=image_seed["label"],
                color=image_seed["color"],
            ),
            encoding="utf-8",
        )


def remove_placeholder_images() -> None:
    image_root = Path(settings.upload_root) / DEV_IMAGE_DIR_NAME

    if image_root.exists():
        shutil.rmtree(image_root)


def build_svg_placeholder(*, label: str, color: str) -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720">
  <rect width="960" height="720" fill="#f8fafc"/>
  <rect x="90" y="80" width="780" height="560" rx="24" fill="{color}" opacity="0.88"/>
  <circle cx="480" cy="300" r="130" fill="#ffffff" opacity="0.82"/>
  <rect x="300" y="470" width="360" height="48" rx="24" fill="#101828" opacity="0.72"/>
  <text x="480" y="504" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#ffffff">{label}</text>
</svg>
"""


def make_excerpt(text: str, *, max_length: int = 260) -> str:
    normalized = " ".join(text.split())

    if len(normalized) <= max_length:
        return normalized

    return f"{normalized[:max_length].rstrip()}..."


def _all_tag_specs() -> set[tuple[str, TagType]]:
    tag_specs: set[tuple[str, TagType]] = set()

    for post_seed in POST_SEEDS:
        tag_specs.update(post_seed["tags"])

    return tag_specs


def print_seed_summary(result: dict[str, Any]) -> None:
    users: dict[str, User] = result["users"]
    posts: dict[str, Post] = result["posts"]
    chunks: dict[str, list[ContentChunk]] = result["chunks"]
    ai_outputs: list[AiOutput] = result["ai_outputs"]

    print("Seeded development data.")
    print(f"Login password for all dev users: {DEV_PASSWORD}")
    print("Users:")

    for login_id, user in users.items():
        print(f"- {login_id} ({user.email})")

    print("Posts:")

    for title, post in posts.items():
        print(f"- [{post.board.code.value}] id={post.id} {title}")

    print(f"Content chunks: {sum(len(values) for values in chunks.values())}")
    print("AI outputs:")

    for ai_output in ai_outputs:
        print(
            f"- id={ai_output.id} type={ai_output.output_type.value} "
            f"target_post_id={ai_output.target_post_id}"
        )


if __name__ == "__main__":
    main()
