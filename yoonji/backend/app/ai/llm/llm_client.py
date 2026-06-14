from __future__ import annotations

from functools import lru_cache

from app.core.config import settings


class LlmClientError(RuntimeError):
    pass


class OpenAIChatClient:
    def __init__(
        self,
        *,
        api_key: str | None,
        model_name: str,
    ) -> None:
        self.api_key = api_key
        self.model_name = model_name
        self._client = None

    def invoke(self, messages: list[tuple[str, str]]) -> str:
        response = self._get_client().invoke(messages)
        content = getattr(response, "content", "")

        if isinstance(content, list):
            return "\n".join(str(item) for item in content)

        return str(content)

    def _get_client(self):
        if self._client is not None:
            return self._client

        if not self.api_key:
            raise LlmClientError("OPENAI_API_KEY is required to call the chat model.")

        try:
            from langchain_openai import ChatOpenAI
        except Exception as exc:
            raise LlmClientError(
                "langchain_openai is not available or could not be imported."
            ) from exc

        try:
            self._client = ChatOpenAI(
                model=self.model_name,
                api_key=self.api_key,
                temperature=0.2,
            )
        except Exception as exc:
            raise LlmClientError("Failed to initialize OpenAI chat model.") from exc

        return self._client


@lru_cache
def get_chat_client() -> OpenAIChatClient:
    return OpenAIChatClient(
        api_key=settings.openai_api_key,
        model_name=settings.openai_chat_model,
    )
