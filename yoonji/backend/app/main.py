from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from app.db.init_db import init_db

from app.api.routes.auth import router as auth_router
from app.api.routes.ai import router as ai_router
from app.api.routes.boards import router as boards_router
from app.api.routes.comments import router as comments_router
from app.api.routes.images import router as images_router
from app.api.routes.internal import router as internal_router
from app.api.routes.posts import router as posts_router
from app.api.routes.search import router as search_router
from app.api.routes.tags import router as tags_router
from app.api.routes.users import router as users_router
from app.core.config import settings
from app.core.cors import configure_cors
from app.core.exceptions import (
    AppException,
    app_exception_handler,
    http_exception_handler,
    validation_exception_handler,
)
from app.storage.local_storage import ensure_upload_root


app = FastAPI(title=settings.app_name)
configure_cors(app, settings.backend_cors_origins)
app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.mount("/uploads", StaticFiles(directory=str(ensure_upload_root())), name="uploads")
app.include_router(ai_router, prefix=settings.api_prefix)
app.include_router(auth_router, prefix=settings.api_prefix)
app.include_router(boards_router, prefix=settings.api_prefix)
app.include_router(comments_router, prefix=settings.api_prefix)
app.include_router(images_router, prefix=settings.api_prefix)
app.include_router(internal_router, prefix=settings.api_prefix)
app.include_router(posts_router, prefix=settings.api_prefix)
app.include_router(search_router, prefix=settings.api_prefix)
app.include_router(tags_router, prefix=settings.api_prefix)
app.include_router(users_router, prefix=settings.api_prefix)

@app.on_event("startup")
def startup() -> None:
    init_db()

    
@app.get(f"{settings.api_prefix}/health")
def health_check():
    return {"status": "ok", "service": "figure-community-api"}
