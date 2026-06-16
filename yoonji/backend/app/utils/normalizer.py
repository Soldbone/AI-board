import unicodedata


def clean_tag_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value)
    return " ".join(normalized.strip().split())


def normalize_tag_name(value: str) -> str:
    cleaned = clean_tag_name(value)
    return "".join(cleaned.lower().split())
