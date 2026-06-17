from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def read_health() -> dict[str, str]:
    """서버 프로세스가 정상 기동 중인지 확인하는 헬스 체크 API다."""
    return {"status": "ok"}
