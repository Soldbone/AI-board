from __future__ import annotations

from functools import lru_cache
import re
from typing import Any

from app.core.config import settings


class EmbeddingClientError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        reason: str,
        hint: str | None = None,
        cause: BaseException | None = None,
    ) -> None:
        super().__init__(message)
        self.reason = reason
        self.hint = hint
        self.cause_summary = _safe_error_summary(cause) if cause else None


class OpenAIEmbeddingClient:
    def __init__(
        self,
        *,
        api_key: str | None,
        model_name: str,
    ) -> None:
        self.api_key = api_key
        self.model_name = model_name
        self._client = None

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        try:
            return self._get_client().embed_documents(texts)
        except EmbeddingClientError:
            raise
        except Exception as exc:
            raise EmbeddingClientError(
                "OpenAI embedding API call failed.",
                reason="api_call_failed",
                hint="Check OPENAI_API_KEY validity, project billing/quota, network access, and OPENAI_EMBEDDING_MODEL.",
                cause=exc,
            ) from exc

    def embed_query(self, text: str) -> list[float]:
        try:
            return self._get_client().embed_query(text)
        except EmbeddingClientError:
            raise
        except Exception as exc:
            raise EmbeddingClientError(
                "OpenAI embedding API call failed.",
                reason="api_call_failed",
                hint="Check OPENAI_API_KEY validity, project billing/quota, network access, and OPENAI_EMBEDDING_MODEL.",
                cause=exc,
            ) from exc

    def _get_client(self):
        if self._client is not None:
            return self._client

        if not self.api_key:
            raise EmbeddingClientError(
                "OPENAI_API_KEY is required to create embeddings.",
                reason="missing_api_key",
                hint="Set OPENAI_API_KEY in backend/.env, then restart the FastAPI server.",
            )

        try:
            from langchain_openai import OpenAIEmbeddings
        except Exception as exc:
            raise EmbeddingClientError(
                "langchain_openai is not available or could not be imported.",
                reason="dependency_unavailable",
                hint="Install backend requirements in the Python environment that runs FastAPI.",
                cause=exc,
            ) from exc

        try:
            self._client = OpenAIEmbeddings(
                model=self.model_name,
                api_key=self.api_key,
            )
        except Exception as exc:
            raise EmbeddingClientError(
                "Failed to initialize OpenAI embeddings.",
                reason="client_initialization_failed",
                hint="Check OPENAI_EMBEDDING_MODEL and OpenAI client package versions.",
                cause=exc,
            ) from exc

        return self._client


@lru_cache
def get_embedding_client() -> OpenAIEmbeddingClient:
    return OpenAIEmbeddingClient(
        api_key=settings.openai_api_key,
        model_name=settings.openai_embedding_model,
    )


def build_embedding_error_details(error: EmbeddingClientError) -> dict[str, Any]:
    details: dict[str, Any] = {
        "model": settings.openai_embedding_model,
        "reason": error.reason,
    }

    if error.hint:
        details["hint"] = error.hint

    if error.cause_summary:
        details["cause"] = error.cause_summary

    return details


def _safe_error_summary(exc: BaseException | None) -> dict[str, Any] | None:
    if exc is None:
        return None

    message = str(exc)
    message = re.sub(r"sk-[A-Za-z0-9_\-]+", "sk-***", message)

    return {
        "type": type(exc).__name__,
        "message": message[:500],
    }
