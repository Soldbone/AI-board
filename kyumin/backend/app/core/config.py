from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """백엔드가 사용하는 환경변수와 기본 설정값을 한 곳에서 관리한다."""

    app_name: str = "Potato maker"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/potato_maker"
    jwt_secret: str = ""
    api_key_encryption_secret: str = ""
    openai_model: str = "gpt-5-nano"
    embedding_model: str = "text-embedding-3-small"
    rawg_api_key: str = ""
    video_games_mcp_command: str = ""
    video_games_mcp_args: str = ""
    video_games_mcp_cwd: str = ""
    mcp_protocol_version: str = "2025-03-26"
    mcp_request_timeout_seconds: float = 20.0
    cors_allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """설정 객체를 재사용해서 매 요청마다 .env를 다시 읽지 않게 한다."""
    return Settings()
