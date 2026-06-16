from pathlib import Path
import sys


ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.db.database import SessionLocal
from app.db.init_db import init_db
from app.models.board import Board
from app.models.enums import BoardCode


BOARD_SEEDS = [
    {
        "code": BoardCode.REVIEW,
        "name": "피규어 후기",
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
        "description": "구매 전 가격, 품질, 만족도를 고민하는 게시판",
        "sort_order": 4,
        "is_active": True,
    },
]

EXCLUDED_BOARD_CODES = [BoardCode.NOTICE, BoardCode.FAQ]


def seed_boards() -> None:
    init_db()
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
                continue

            board.name = board_data["name"]
            board.description = board_data["description"]
            board.sort_order = board_data["sort_order"]
            board.is_active = board_data["is_active"]

        db.query(Board).filter(Board.code.in_(EXCLUDED_BOARD_CODES)).delete(
            synchronize_session=False
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_boards()
    print("Seeded boards: REVIEW, INFO, QUESTION, PURCHASE_HELP")
