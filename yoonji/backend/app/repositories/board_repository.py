from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.board import Board
from app.models.enums import BoardCode


def list_active_boards(db: Session) -> list[Board]:
    statement = (
        select(Board)
        .where(Board.is_active.is_(True))
        .order_by(Board.sort_order.asc(), Board.id.asc())
    )
    return list(db.scalars(statement).all())


def get_active_board_by_code(db: Session, code: BoardCode) -> Board | None:
    statement = select(Board).where(
        Board.code == code,
        Board.is_active.is_(True),
    )
    return db.scalar(statement)
