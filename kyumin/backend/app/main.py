from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.router import api_router
from backend.app.core.config import Settings, get_settings


@asynccontextmanager
async def app_lifespan(app: FastAPI) -> AsyncIterator[None]:
    """앱 시작/종료 시 유지해야 하는 외부 연결을 관리한다."""
    from backend.app.services.similar_games import (
        close_video_games_client,
        start_video_games_client_if_configured,
    )

    settings_provider = app.dependency_overrides.get(get_settings, get_settings)
    settings = settings_provider()
    await start_video_games_client_if_configured(settings)
    try:
        yield
    finally:
        await close_video_games_client()


def create_app() -> FastAPI:
    """FastAPI 앱을 만들고 공통 라우터를 등록한다."""
    settings = get_settings()
    app = FastAPI(title=settings.app_name, lifespan=app_lifespan)

    configure_cors(app, settings)

    # 모든 API 라우터는 backend.app.api.router에서 모아 등록한다.
    app.include_router(api_router)

    return app


def configure_cors(app: FastAPI, settings: Settings) -> None:
    """분리 실행한 로컬 React 화면이 FastAPI API를 호출할 수 있게 허용한다."""
    origins = [
        origin.strip()
        for origin in settings.cors_allowed_origins.split(",")
        if origin.strip()
    ]
    if not origins:
        return

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


# ASGI 서버가 import해서 실행하는 애플리케이션 인스턴스다.
app = create_app()
