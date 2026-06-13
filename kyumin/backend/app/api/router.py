from fastapi import APIRouter

from backend.app.api.routes.ai import router as ai_router
from backend.app.api.routes.auth import router as auth_router
from backend.app.api.routes.comments import router as comments_router
from backend.app.api.routes.health import router as health_router
from backend.app.api.routes.posts import router as posts_router
from backend.app.api.routes.tags import router as tags_router
from backend.app.api.routes.users import router as users_router

# 기능별 라우터를 이곳에 모아 FastAPI 앱에는 한 번만 연결한다.
api_router = APIRouter()
api_router.include_router(ai_router)
api_router.include_router(auth_router)
api_router.include_router(comments_router)
api_router.include_router(health_router)
api_router.include_router(posts_router)
api_router.include_router(tags_router)
api_router.include_router(users_router)
