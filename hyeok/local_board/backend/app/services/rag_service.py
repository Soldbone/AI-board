import re

from sqlalchemy.orm import Session

from app.models.comment import Comment
from app.models.post import Post
from app.models.tag import Tag, post_tags


DEFAULT_SIMILAR_POST_LIMIT = 5
MAX_SIMILAR_POST_LIMIT = 5
SEARCH_CANDIDATE_LIMIT = 100

STOPWORDS = {
    "그리고",
    "궁금",
    "궁금해요",
    "근처",
    "너무",
    "대해",
    "또는",
    "리뷰",
    "있는",
    "있나요",
    "어때요",
    "좀",
    "좋은",
    "추천",
    "추천해주세요",
    "하고",
    "합니다",
    "후기",
    "해주세요",
}

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


def extract_keywords(
    title: str,
    content: str,
    tag_names: list[str] | None = None,
    limit: int = 20,
) -> list[str]:
    raw_text = f"{title} {content}"
    words = re.findall(r"[0-9a-zA-Z가-힣]+", raw_text.lower())
    keywords: list[str] = []

    for word in words:
        cleaned_word = normalize_keyword(word)

        if (
            len(cleaned_word) >= 2
            and cleaned_word not in STOPWORDS
            and cleaned_word not in keywords
        ):
            keywords.append(cleaned_word)

    for tag_name in tag_names or []:
        cleaned_tag = normalize_keyword(tag_name)

        if len(cleaned_tag) >= 2 and cleaned_tag not in keywords:
            keywords.append(cleaned_tag)

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

        results.append(
            {
                "id": post.id,
                "title": post.title,
                "content_preview": post.content[:80],
                "region": post.region,
                "store_name": post.store_name,
                "category": post.category,
                "score": match_detail["score"],
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
        key=lambda item: (item["score"], item["created_at"]),
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
