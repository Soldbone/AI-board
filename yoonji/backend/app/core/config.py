import os
from functools import lru_cache

from dotenv import load_dotenv


load_dotenv()


class Settings:
    def __init__(self) -> None:
        self.app_name = os.getenv("APP_NAME", "Figure Community API")
        self.api_prefix = os.getenv("API_PREFIX", "/api/v1")
        self.backend_cors_origins = self._parse_origins(
            os.getenv("BACKEND_CORS_ORIGINS", "http://localhost:5173")
        )

    @staticmethod
    def _parse_origins(value: str) -> list[str]:
        return [origin.strip() for origin in value.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
