import re

from sqlalchemy.orm import Session

from app.models.comment import Comment
from app.models.post import Post
from app.models.tag import Tag, post_tags


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


def calculate_score(
    post: Post,
    tag_names: list[str],
    comment_text: str,
    matched_keywords: list[str],
) -> int:
    score = 0
    title = post.title.lower()
    content = post.content.lower()
    region = (post.region or "").lower()
    store_name = (post.store_name or "").lower()
    category = (post.category or "").lower()
    tag_text = " ".join(tag_names).lower()
    comments = comment_text.lower()

    for keyword in matched_keywords:
        if keyword in title:
            score += 4
        if keyword in store_name:
            score += 4
        if keyword in tag_text:
            score += 3
        if keyword in category:
            score += 2
        if keyword in region:
            score += 2
        if keyword in content:
            score += 1
        if keyword in comments:
            score += 1

    return score


def find_similar_posts(
    db: Session,
    title: str,
    content: str,
    tag_names: list[str],
    limit: int = 5,
):
    keywords = extract_keywords(title, content, tag_names)

    if not keywords:
        return []

    posts = (
        db.query(Post)
        .filter(Post.deleted_at.is_(None))
        .order_by(Post.created_at.desc())
        .limit(100)
        .all()
    )

    results = []

    for post in posts:
        tag_rows = (
            db.query(Tag.name)
            .join(post_tags, Tag.id == post_tags.c.tag_id)
            .filter(post_tags.c.post_id == post.id)
            .all()
        )
        comment_rows = (
            db.query(Comment.content)
            .filter(
                Comment.post_id == post.id,
                Comment.deleted_at.is_(None),
            )
            .limit(10)
            .all()
        )

        post_tag_names = [tag_name for (tag_name,) in tag_rows]
        comment_text = " ".join(comment for (comment,) in comment_rows)
        searchable_text = (
            f"{post.title} {post.content} {post.region or ''} "
            f"{post.store_name or ''} {post.category or ''} "
            f"{' '.join(post_tag_names)} {comment_text}"
        ).lower()

        matched_keywords = [
            keyword for keyword in keywords
            if keyword in searchable_text
        ]

        if not matched_keywords:
            continue

        results.append(
            {
                "id": post.id,
                "title": post.title,
                "content_preview": post.content[:80],
                "region": post.region,
                "store_name": post.store_name,
                "category": post.category,
                "score": calculate_score(post, post_tag_names, comment_text, matched_keywords),
                "matched_keywords": matched_keywords,
                "created_at": post.created_at,
            }
        )

    results.sort(key=lambda item: (item["score"], item["created_at"]), reverse=True)

    return results[:limit]


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
        searchable_text = f"{post.title} {post.content}".lower()

        matched_keywords = [
            keyword for keyword in keywords
            if keyword in searchable_text
        ]

        if not matched_keywords:
            continue

        tag_rows = (
            db.query(Tag.name)
            .join(post_tags, Tag.id == post_tags.c.tag_id)
            .filter(post_tags.c.post_id == post.id)
            .all()
        )

        for (tag_name,) in tag_rows:
            tag_scores[tag_name] = tag_scores.get(tag_name, 0) + len(matched_keywords)

    results = [
        {"name": tag_name, "score": score}
        for tag_name, score in tag_scores.items()
    ]
    results.sort(key=lambda item: item["score"], reverse=True)

    return results[:limit]
