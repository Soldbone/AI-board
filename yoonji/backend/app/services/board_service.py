from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.models.enums import BoardCode
from app.repositories import board_repository
from app.schemas.board_schema import BoardListResponse, BoardResponse


def list_boards(db: Session) -> BoardListResponse:
    boards = board_repository.list_active_boards(db)
    return BoardListResponse(
        items=[BoardResponse.model_validate(board) for board in boards],
    )


def get_board(db: Session, *, board_code: BoardCode) -> BoardResponse:
    board = board_repository.get_active_board_by_code(db, board_code)

    if board is None:
        raise AppException(
            "게시판을 찾을 수 없습니다.",
            code="BOARD_NOT_FOUND",
            status_code=404,
        )

    return BoardResponse.model_validate(board)
