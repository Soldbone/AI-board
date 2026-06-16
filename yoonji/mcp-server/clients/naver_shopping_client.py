from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from clients.http_client import AsyncHttpClient, ExternalHttpError


NAVER_SHOPPING_SEARCH_URL = "https://openapi.naver.com/v1/search/shop.json"


@dataclass
class NaverShoppingSettings:
    client_id: str | None
    client_secret: str | None

    @classmethod
    def from_env(cls) -> "NaverShoppingSettings":
        return cls(
            client_id=os.getenv("NAVER_CLIENT_ID"),
            client_secret=os.getenv("NAVER_CLIENT_SECRET"),
        )

    def validate(self) -> None:
        if not self.client_id or not self.client_secret:
            raise NaverShoppingClientError(
                code="MISSING_NAVER_CREDENTIALS",
                message=(
                    "NAVER_CLIENT_ID and NAVER_CLIENT_SECRET must be set before "
                    "calling the Naver Shopping Search API."
                ),
            )


class NaverShoppingClientError(RuntimeError):
    def __init__(
        self,
        *,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}


class NaverShoppingClient:
    """Client for Naver Shopping Search API.

    This layer only knows how to call Naver. Official-store filtering and
    product matching are kept outside the API client so each responsibility is
    visible while learning the flow.
    """

    def __init__(
        self,
        *,
        settings: NaverShoppingSettings | None = None,
        http_client: AsyncHttpClient | None = None,
    ) -> None:
        self.settings = settings or NaverShoppingSettings.from_env()
        self.http_client = http_client or AsyncHttpClient()

    async def search_products(
        self,
        *,
        query: str,
        display: int,
        sort: str,
    ) -> dict[str, Any]:
        self.settings.validate()

        headers = {
            "X-Naver-Client-Id": self.settings.client_id or "",
            "X-Naver-Client-Secret": self.settings.client_secret or "",
        }
        params = {
            "query": query,
            "display": display,
            "start": 1,
            "sort": sort,
        }

        try:
            return await self.http_client.get_json(
                NAVER_SHOPPING_SEARCH_URL,
                params=params,
                headers=headers,
            )
        except ExternalHttpError as exc:
            raise NaverShoppingClientError(
                code="NAVER_API_REQUEST_FAILED",
                message="Naver Shopping Search API request failed.",
                details={
                    "http_error_code": exc.code,
                    "status_code": exc.status_code,
                    "response_text": exc.response_text,
                },
            ) from exc
