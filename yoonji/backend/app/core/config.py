import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv


load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings:
    def __init__(self) -> None:
        self.app_name = os.getenv("APP_NAME", "Figure Community API")
        self.api_prefix = os.getenv("API_PREFIX", "/api/v1")
        self.upload_root = os.getenv(
            "UPLOAD_ROOT",
            str(PROJECT_ROOT / "uploads"),
        )
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
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        self.openai_embedding_model = os.getenv(
            "OPENAI_EMBEDDING_MODEL",
            "text-embedding-3-small",
        )
        self.openai_chat_model = os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini")
        self.vector_store_provider = os.getenv("VECTOR_STORE_PROVIDER", "pgvector")
        self.chroma_persist_dir = os.getenv(
            "CHROMA_PERSIST_DIR",
            str(PROJECT_ROOT / "chroma_db"),
        )
        self.rag_chunk_size = self._parse_int(os.getenv("RAG_CHUNK_SIZE"), 900)
        self.rag_chunk_overlap = self._parse_int(os.getenv("RAG_CHUNK_OVERLAP"), 120)
        self.auto_index_after_write = self._parse_bool(
            os.getenv("AUTO_INDEX_AFTER_WRITE"),
            False,
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

    @staticmethod
    def _parse_bool(value: str | None, default: bool) -> bool:
        if value is None:
            return default

        return value.strip().lower() in {"1", "true", "yes", "y", "on"}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
