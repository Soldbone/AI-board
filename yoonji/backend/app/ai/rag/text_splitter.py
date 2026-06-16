from __future__ import annotations

from langchain_core.documents import Document

from app.core.config import settings


DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", " ", ""]


class LocalRecursiveCharacterTextSplitter:
    def __init__(
        self,
        *,
        chunk_size: int,
        chunk_overlap: int,
        separators: list[str] | None = None,
    ) -> None:
        self.chunk_size = max(chunk_size, 1)
        self.chunk_overlap = max(min(chunk_overlap, self.chunk_size - 1), 0)
        self.separators = separators or DEFAULT_SEPARATORS

    def split_documents(self, documents: list[Document]) -> list[Document]:
        chunks: list[Document] = []

        for document in documents:
            for chunk_text in self.split_text(document.page_content):
                chunks.append(
                    Document(
                        page_content=chunk_text,
                        metadata=dict(document.metadata),
                    )
                )

        return chunks

    def split_text(self, text: str) -> list[str]:
        normalized = text.strip()

        if not normalized:
            return []

        chunks: list[str] = []
        start = 0

        while start < len(normalized):
            end = min(start + self.chunk_size, len(normalized))
            split_end = self._best_split_position(normalized, start, end)
            chunk = normalized[start:split_end].strip()

            if chunk:
                chunks.append(chunk)

            if split_end >= len(normalized):
                break

            start = max(split_end - self.chunk_overlap, start + 1)

        return chunks

    def _best_split_position(self, text: str, start: int, end: int) -> int:
        if end >= len(text):
            return len(text)

        min_end = start + max(self.chunk_size // 2, 1)

        for separator in self.separators:
            if separator == "":
                continue

            position = text.rfind(separator, min_end, end)
            if position != -1:
                return position + len(separator)

        return end


def build_text_splitter(
    *,
    chunk_size: int | None = None,
    chunk_overlap: int | None = None,
):
    resolved_chunk_size = chunk_size or settings.rag_chunk_size
    resolved_chunk_overlap = chunk_overlap or settings.rag_chunk_overlap

    try:
        from langchain_text_splitters import RecursiveCharacterTextSplitter

        return RecursiveCharacterTextSplitter(
            chunk_size=resolved_chunk_size,
            chunk_overlap=resolved_chunk_overlap,
            separators=DEFAULT_SEPARATORS,
        )
    except ImportError:
        return LocalRecursiveCharacterTextSplitter(
            chunk_size=resolved_chunk_size,
            chunk_overlap=resolved_chunk_overlap,
            separators=DEFAULT_SEPARATORS,
        )


def split_document(
    document: Document,
    *,
    chunk_size: int | None = None,
    chunk_overlap: int | None = None,
) -> list[Document]:
    splitter = build_text_splitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )
    chunks = splitter.split_documents([document])
    chunk_count = len(chunks)

    for chunk_index, chunk in enumerate(chunks):
        chunk.metadata = {
            **chunk.metadata,
            "chunk_index": chunk_index,
            "chunk_count": chunk_count,
        }

    return chunks


def estimate_token_count(text: str) -> int:
    # A lightweight estimate keeps indexing independent from tokenizer packages.
    return max(1, len(text) // 4)
