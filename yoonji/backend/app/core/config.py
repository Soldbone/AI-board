import os
from functools import lru_cache

from dotenv import load_dotenv


load_dotenv()


class Settings:
    def __init__(self) -> None:
        self.app_name = os.getenv("APP_NAME", "Figure Community API")
        self.api_prefix = os.getenv("API_PREFIX", "/api/v1")
        self.database_url = os.getenv(
            "DATABASE_URL",
            "postgresql://figure_user:figure_password@localhost:5432/figure_community",
        )
        self.jwt_secret_key = os.getenv("JWT_SECRET_KEY", "change-this-secret")
        self.jwt_algorithm = os.getenv("JWT_ALGORITHM", "HS256")
        self.access_token_expire_minutes = self._parse_int(
            os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES"),
            30,
        )
        self.refresh_token_expire_days = self._parse_int(
            os.getenv("REFRESH_TOKEN_EXPIRE_DAYS"),
            14,
        )
        self.backend_cors_origins = self._parse_origins(
            os.getenv("BACKEND_CORS_ORIGINS", "http://localhost:5173")
        )

    @staticmethod
    def _parse_origins(value: str) -> list[str]:
        return [origin.strip() for origin in value.split(",") if origin.strip()]

    @staticmethod
    def _parse_int(value: str | None, default: int) -> int:
        if value is None:
            return default

        try:
            return int(value)
        except ValueError:
            return default


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
