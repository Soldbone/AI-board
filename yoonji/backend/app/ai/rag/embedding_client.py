from __future__ import annotations

from functools import lru_cache

from app.core.config import settings


class EmbeddingClientError(RuntimeError):
    pass


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

        return self._get_client().embed_documents(texts)

    def embed_query(self, text: str) -> list[float]:
        return self._get_client().embed_query(text)

    def _get_client(self):
        if self._client is not None:
            return self._client

        if not self.api_key:
            raise EmbeddingClientError(
                "OPENAI_API_KEY is required to create embeddings."
            )

        try:
            from langchain_openai import OpenAIEmbeddings
        except Exception as exc:
            raise EmbeddingClientError(
                "langchain_openai is not available or could not be imported."
            ) from exc

        try:
            self._client = OpenAIEmbeddings(
                model=self.model_name,
                api_key=self.api_key,
            )
        except Exception as exc:
            raise EmbeddingClientError("Failed to initialize OpenAI embeddings.") from exc

        return self._client


@lru_cache
def get_embedding_client() -> OpenAIEmbeddingClient:
    return OpenAIEmbeddingClient(
        api_key=settings.openai_api_key,
        model_name=settings.openai_embedding_model,
    )
