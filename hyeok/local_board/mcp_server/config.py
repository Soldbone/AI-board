from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
import os

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"

load_dotenv(ENV_PATH)


class MissingConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class Settings:
    naver_client_id: str
    naver_client_secret: str
    naver_local_search_url: str
    naver_image_search_url: str


def _get_required_env(name: str) -> str:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        raise MissingConfigError(
            f"{name} is required. Add it to mcp_server/.env."
        )
    return value.strip()


@lru_cache
def get_settings() -> Settings:
    return Settings(
        naver_client_id=_get_required_env("NAVER_CLIENT_ID"),
        naver_client_secret=_get_required_env("NAVER_CLIENT_SECRET"),
        naver_local_search_url=os.getenv(
            "NAVER_LOCAL_SEARCH_URL",
            "https://openapi.naver.com/v1/search/local.json",
        ).strip(),
        naver_image_search_url=os.getenv(
            "NAVER_IMAGE_SEARCH_URL",
            "https://openapi.naver.com/v1/search/image",
        ).strip(),
    )
