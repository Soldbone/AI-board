from sqlalchemy.orm import Session

from app.models.post import Post
from app.models.tag import Tag, post_tags


def extract_keywords(title: str, content: str, tag_names: list[str]) -> list[str]:
    raw_text = f"{title} {content}"
    words = raw_text.replace(",", " ").replace(".", " ").split()

    keywords = []

    for word in words:
        cleaned_word = word.strip().lower()

        if len(cleaned_word) >= 2 and cleaned_word not in keywords:
            keywords.append(cleaned_word)

    for tag_name in tag_names:
        cleaned_tag = tag_name.strip().lower()

        if cleaned_tag and cleaned_tag not in keywords:
            keywords.append(cleaned_tag)

    return keywords[:20]


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

        post_tag_names = [tag_name for (tag_name,) in tag_rows]
        searchable_text = f"{post.title} {post.content} {' '.join(post_tag_names)}".lower()

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
                "score": len(matched_keywords),
                "matched_keywords": matched_keywords,
                "created_at": post.created_at,
            }
        )

    results.sort(key=lambda item: item["score"], reverse=True)

    return results[:limit]
