from fastapi import APIRouter

from app.api.deps import DbSession
from app.models.enums import BoardCode
from app.schemas.board_schema import BoardListResponse, BoardResponse
from app.services import board_service


router = APIRouter(prefix="/boards", tags=["boards"])


@router.get("", response_model=BoardListResponse)
def list_boards(db: DbSession) -> BoardListResponse:
    return board_service.list_boards(db)


@router.get("/{board_code}", response_model=BoardResponse)
def get_board(board_code: BoardCode, db: DbSession) -> BoardResponse:
    return board_service.get_board(db, board_code=board_code)
