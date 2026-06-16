from sqlalchemy import text

from app.db.base import Base
from app.db.database import SessionLocal, engine
import app.models
from app.models.board import Board
from app.models.enums import BoardCode


BOARD_SEEDS = [
    {
        "code": BoardCode.REVIEW,
        "name": "후기",
        "description": "피규어 사진과 후기를 공유하는 게시판",
        "sort_order": 1,
        "is_active": True,
    },
    {
        "code": BoardCode.INFO,
        "name": "정보",
        "description": "피규어 관리, 예약, 발매 정보를 공유하는 게시판",
        "sort_order": 2,
        "is_active": True,
    },
    {
        "code": BoardCode.QUESTION,
        "name": "질문",
        "description": "피규어 구매, 관리, 전시와 관련된 질문 게시판",
        "sort_order": 3,
        "is_active": True,
    },
    {
        "code": BoardCode.PURCHASE_HELP,
        "name": "구매 고민",
        "description": "구매 전 가격, 만족도, 장단점을 고민하는 게시판",
        "sort_order": 4,
        "is_active": True,
    },
]


def seed_boards() -> None:
    db = SessionLocal()

    try:
        for board_data in BOARD_SEEDS:
            board = (
                db.query(Board)
                .filter(Board.code == board_data["code"])
                .one_or_none()
            )

            if board is None:
                db.add(Board(**board_data))
            else:
                board.name = board_data["name"]
                board.description = board_data["description"]
                board.sort_order = board_data["sort_order"]
                board.is_active = board_data["is_active"]

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    apply_legacy_schema_fixes()
    seed_boards()


def apply_legacy_schema_fixes() -> None:
    """Keep old local create_all databases compatible with the current model.

    create_all() creates missing tables, but it does not alter columns that
    already exist. Earlier phases used stricter user columns, while the current
    API allows signup without email/profile data.
    """
    if engine.dialect.name != "postgresql":
        return

    with engine.begin() as connection:
        connection.execute(
            text(
                """
                DO $$
                BEGIN
                    IF to_regclass('public.users') IS NOT NULL THEN
                        ALTER TABLE public.users
                            ALTER COLUMN email DROP NOT NULL,
                            ALTER COLUMN profile_image_url DROP NOT NULL,
                            ALTER COLUMN last_login_at DROP NOT NULL;
                    END IF;
                END
                $$;
                """
            )
        )
