import math
import re
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.comment import Comment
from app.models.post import Post
from app.models.tag import Tag, post_tags

try:
    from kiwipiepy import Kiwi
except ImportError:  # pragma: no cover - fallback for environments not yet installed.
    Kiwi = None


DEFAULT_SIMILAR_POST_LIMIT = 5
MAX_SIMILAR_POST_LIMIT = 5
SEARCH_CANDIDATE_LIMIT = 100
STOPWORDS_FILE = Path(__file__).resolve().parents[1] / "data" / "rag_stopwords_ko.txt"
KIWI_KEYWORD_TAGS = {"NNG", "NNP", "NNB", "NR", "SL", "SN"}
VIEW_BONUS_MAX = 3
COMMENT_BONUS_MAX = 3
RECENCY_BONUS_MAX = 2
RECENCY_BONUS_DAYS = 30

FIELD_WEIGHTS = {
    "title": 4,
    "store_name": 4,
    "tag": 3,
    "category": 2,
    "region": 2,
    "content": 1,
    "comment": 1,
}

FIELD_LABELS = {
    "title": "제목",
    "store_name": "가게명",
    "tag": "태그",
    "category": "분류",
    "region": "동네",
    "content": "본문",
    "comment": "댓글",
}


def normalize_keyword(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def add_keyword(keywords: list[str], candidate: str, stopwords: set[str]) -> None:
    cleaned_keyword = normalize_keyword(candidate)

    if len(cleaned_keyword) < 2 or cleaned_keyword in stopwords:
        return

    if any(cleaned_keyword == keyword for keyword in keywords):
        return

    if any(cleaned_keyword in keyword for keyword in keywords):
        return

    keywords[:] = [
        keyword for keyword in keywords
        if keyword not in cleaned_keyword
    ]
    keywords.append(cleaned_keyword)


@lru_cache(maxsize=1)
def load_stopwords() -> set[str]:
    stopwords: set[str] = set()

    with STOPWORDS_FILE.open(encoding="utf-8") as file:
        for line in file:
            word = normalize_keyword(line)

            if word and not word.startswith("#"):
                stopwords.add(word)

    return stopwords


def remove_stopword_phrases(text: str, stopwords: set[str]) -> str:
    cleaned_text = text.lower()

    for stopword in stopwords:
        if " " in stopword:
            cleaned_text = cleaned_text.replace(stopword, " ")

    return cleaned_text


@lru_cache(maxsize=1)
def get_kiwi():
    if Kiwi is None:
        return None

    return Kiwi()


def extract_kiwi_keywords(text: str, stopwords: set[str]) -> list[str]:
    kiwi = get_kiwi()

    if kiwi is None:
        return []

    keywords: list[str] = []

    for token in kiwi.tokenize(text):
        if token.tag in KIWI_KEYWORD_TAGS:
            add_keyword(keywords, token.form, stopwords)

    return keywords


def extract_regex_keywords(text: str, stopwords: set[str]) -> list[str]:
    keywords: list[str] = []

    for word in re.findall(r"[0-9a-zA-Z가-힣]+", text.lower()):
        add_keyword(keywords, word, stopwords)

    return keywords


def extract_keywords(
    title: str,
    content: str,
    tag_names: list[str] | None = None,
    limit: int = 20,
) -> list[str]:
    stopwords = load_stopwords()
    title_text = remove_stopword_phrases(title, stopwords)
    content_text = remove_stopword_phrases(content, stopwords)
    raw_text = f"{title_text} {content_text}"
    keywords: list[str] = []

    for keyword in extract_kiwi_keywords(raw_text, stopwords):
        add_keyword(keywords, keyword, stopwords)

    for keyword in extract_regex_keywords(title_text, stopwords):
        add_keyword(keywords, keyword, stopwords)

    for tag_name in tag_names or []:
        add_keyword(keywords, tag_name, stopwords)

    return keywords[:limit]


def calculate_match_detail(
    post: Post,
    tag_names: list[str],
    comment_text: str,
    matched_keywords: list[str],
) -> dict:
    score = 0
    matched_fields: list[str] = []
    fields = {
        "title": post.title.lower(),
        "store_name": (post.store_name or "").lower(),
        "tag": " ".join(tag_names).lower(),
        "category": (post.category or "").lower(),
        "region": (post.region or "").lower(),
        "content": post.content.lower(),
        "comment": comment_text.lower(),
    }

    for keyword in matched_keywords:
        for field_name, field_text in fields.items():
            if field_text and keyword in field_text:
                score += FIELD_WEIGHTS[field_name]

                field_label = FIELD_LABELS[field_name]
                if field_label not in matched_fields:
                    matched_fields.append(field_label)

    return {
        "score": score,
        "matched_fields": matched_fields,
    }


def get_post_tag_names(db: Session, post_id: int) -> list[str]:
    tag_rows = (
        db.query(Tag.name)
        .join(post_tags, Tag.id == post_tags.c.tag_id)
        .filter(post_tags.c.post_id == post_id)
        .all()
    )

    return [tag_name for (tag_name,) in tag_rows]


def get_post_comment_text(db: Session, post_id: int) -> str:
    comment_rows = (
        db.query(Comment.content)
        .filter(
            Comment.post_id == post_id,
            Comment.deleted_at.is_(None),
        )
        .limit(10)
        .all()
    )

    return " ".join(comment for (comment,) in comment_rows)


def get_post_comment_count(db: Session, post_id: int) -> int:
    return (
        db.query(Comment.id)
        .filter(
            Comment.post_id == post_id,
            Comment.deleted_at.is_(None),
        )
        .count()
    )


def calculate_log_bonus(value: int | None, max_bonus: int) -> int:
    if not value or value <= 0:
        return 0

    return min(max_bonus, round(math.log1p(value)))


def calculate_recency_bonus(created_at: datetime | None) -> int:
    if created_at is None:
        return 0

    now = (
        datetime.now(created_at.tzinfo)
        if created_at.tzinfo
        else datetime.now(UTC).replace(tzinfo=None)
    )
    days_old = max(0, (now - created_at).days)

    if days_old >= RECENCY_BONUS_DAYS:
        return 0

    freshness_ratio = 1 - (days_old / RECENCY_BONUS_DAYS)
    return round(freshness_ratio * RECENCY_BONUS_MAX)


def calculate_ranking_bonus(post: Post, comment_count: int) -> dict[str, int]:
    view_bonus = calculate_log_bonus(post.view_count, VIEW_BONUS_MAX)
    comment_bonus = calculate_log_bonus(comment_count, COMMENT_BONUS_MAX)
    recency_bonus = calculate_recency_bonus(post.created_at)

    return {
        "view_bonus": view_bonus,
        "comment_bonus": comment_bonus,
        "recency_bonus": recency_bonus,
        "total": view_bonus + comment_bonus + recency_bonus,
    }


def build_searchable_text(post: Post, tag_names: list[str], comment_text: str) -> str:
    return (
        f"{post.title} {post.content} {post.region or ''} "
        f"{post.store_name or ''} {post.category or ''} "
        f"{' '.join(tag_names)} {comment_text}"
    ).lower()


def find_similar_posts(
    db: Session,
    title: str,
    content: str,
    tag_names: list[str],
    limit: int = DEFAULT_SIMILAR_POST_LIMIT,
):
    keywords = extract_keywords(title, content, tag_names)

    if not keywords:
        return []

    posts = (
        db.query(Post)
        .filter(Post.deleted_at.is_(None))
        .order_by(Post.created_at.desc())
        .limit(SEARCH_CANDIDATE_LIMIT)
        .all()
    )

    results = []

    for post in posts:
        post_tag_names = get_post_tag_names(db, post.id)
        comment_text = get_post_comment_text(db, post.id)
        comment_count = get_post_comment_count(db, post.id)
        searchable_text = build_searchable_text(post, post_tag_names, comment_text)

        matched_keywords = [
            keyword for keyword in keywords
            if keyword in searchable_text
        ]

        if not matched_keywords:
            continue

        match_detail = calculate_match_detail(
            post=post,
            tag_names=post_tag_names,
            comment_text=comment_text,
            matched_keywords=matched_keywords,
        )
        ranking_bonus = calculate_ranking_bonus(post, comment_count)
        final_score = match_detail["score"] + ranking_bonus["total"]

        results.append(
            {
                "id": post.id,
                "title": post.title,
                "content_preview": post.content[:80],
                "region": post.region,
                "store_name": post.store_name,
                "category": post.category,
                "comment_count": comment_count,
                "score": final_score,
                "base_score": match_detail["score"],
                "ranking_bonus": ranking_bonus,
                "matched_keywords": matched_keywords,
                "matched_fields": match_detail["matched_fields"],
                "created_at": post.created_at,
            }
        )

    return rank_similar_posts(results, limit)


def rank_similar_posts(results: list[dict], limit: int = DEFAULT_SIMILAR_POST_LIMIT):
    normalized_limit = max(1, min(limit, MAX_SIMILAR_POST_LIMIT))

    ranked_results = sorted(
        results,
        key=lambda item: (item["score"], item.get("base_score", 0), item["created_at"]),
        reverse=True,
    )

    return ranked_results[:normalized_limit]


def suggest_tags(
    db: Session,
    title: str,
    content: str,
    limit: int = 5,
):
    keywords = extract_keywords(title, content)

    if not keywords:
        return []

    posts = (
        db.query(Post)
        .filter(Post.deleted_at.is_(None))
        .order_by(Post.created_at.desc())
        .limit(100)
        .all()
    )

    tag_scores: dict[str, int] = {}

    for post in posts:
        post_tag_names = get_post_tag_names(db, post.id)
        comment_text = get_post_comment_text(db, post.id)
        searchable_text = build_searchable_text(post, post_tag_names, comment_text)

        matched_keywords = [
            keyword for keyword in keywords
            if keyword in searchable_text
        ]

        if not matched_keywords:
            continue

        match_detail = calculate_match_detail(
            post=post,
            tag_names=post_tag_names,
            comment_text=comment_text,
            matched_keywords=matched_keywords,
        )

        for tag_name in post_tag_names:
            tag_scores[tag_name] = tag_scores.get(tag_name, 0) + match_detail["score"]

    results = [
        {"name": tag_name, "score": score}
        for tag_name, score in tag_scores.items()
    ]
    results.sort(key=lambda item: item["score"], reverse=True)

    return results[:limit]
