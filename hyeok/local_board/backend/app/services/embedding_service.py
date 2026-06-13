import hashlib
import re

from sqlalchemy.orm import Session

from app.config import EMBEDDING_MODEL_NAME
from app.models.comment import Comment
from app.models.post import Post
from app.models.post_embedding import PostEmbedding
from app.services.rag_service import extract_keywords, get_post_tag_names


COMMENT_SUMMARY_LIMIT = 20
REPRESENTATIVE_COMMENT_LIMIT = 5
COMMENT_SUMMARY_MAX_LENGTH = 700


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def get_recent_comment_texts(
    db: Session,
    post_id: int,
    limit: int = COMMENT_SUMMARY_LIMIT,
) -> list[str]:
    comment_rows = (
        db.query(Comment.content)
        .filter(
            Comment.post_id == post_id,
            Comment.deleted_at.is_(None),
        )
        .order_by(Comment.created_at.desc())
        .limit(limit)
        .all()
    )

    return [normalize_text(content) for (content,) in comment_rows if normalize_text(content)]


def summarize_comments(comment_texts: list[str]) -> str | None:
    unique_comments: list[str] = []

    for comment_text in comment_texts:
        cleaned_comment = normalize_text(comment_text)

        if len(cleaned_comment) < 3 or cleaned_comment in unique_comments:
            continue

        unique_comments.append(cleaned_comment)

    if not unique_comments:
        return None

    keyword_text = " ".join(unique_comments)
    keywords = extract_keywords("", keyword_text, tag_names=[], limit=8)
    representative_comments = unique_comments[:REPRESENTATIVE_COMMENT_LIMIT]

    parts = []

    if keywords:
        parts.append(f"자주 언급된 키워드: {', '.join(keywords)}")

    parts.append(f"대표 댓글: {' / '.join(representative_comments)}")
    summary = "\n".join(parts)

    return summary[:COMMENT_SUMMARY_MAX_LENGTH]


def build_post_embedding_source(db: Session, post: Post) -> dict:
    tag_names = get_post_tag_names(db, post.id)
    comment_texts = get_recent_comment_texts(db, post.id)
    comment_summary = summarize_comments(comment_texts)

    source_parts = [
        f"제목: {post.title}",
        f"내용: {post.content}",
    ]

    if post.region:
        source_parts.append(f"지역: {post.region}")

    if post.store_name:
        source_parts.append(f"가게명: {post.store_name}")

    if post.category:
        source_parts.append(f"분류: {post.category}")

    if tag_names:
        source_parts.append(f"태그: {', '.join(tag_names)}")

    if comment_summary:
        source_parts.append(f"댓글 요약: {comment_summary}")

    source_text = "\n".join(source_parts)
    source_hash = hashlib.sha256(source_text.encode("utf-8")).hexdigest()

    return {
        "source_text": source_text,
        "comment_summary": comment_summary,
        "source_hash": source_hash,
        "tag_names": tag_names,
        "comment_count_for_summary": len(comment_texts),
    }


def upsert_post_embedding_source(db: Session, post: Post) -> PostEmbedding:
    source = build_post_embedding_source(db, post)
    post_embedding = (
        db.query(PostEmbedding)
        .filter(PostEmbedding.post_id == post.id)
        .first()
    )

    if post_embedding is None:
        post_embedding = PostEmbedding(
            post_id=post.id,
            embedding_model=EMBEDDING_MODEL_NAME,
            source_text=source["source_text"],
            comment_summary=source["comment_summary"],
            source_hash=source["source_hash"],
        )
        db.add(post_embedding)
        return post_embedding

    if post_embedding.source_hash != source["source_hash"]:
        post_embedding.embedding = None
        post_embedding.embedding_model = EMBEDDING_MODEL_NAME
        post_embedding.source_text = source["source_text"]
        post_embedding.comment_summary = source["comment_summary"]
        post_embedding.source_hash = source["source_hash"]

    return post_embedding


def sync_post_embedding_sources(db: Session, limit: int = 100) -> int:
    posts = (
        db.query(Post)
        .filter(Post.deleted_at.is_(None))
        .order_by(Post.updated_at.desc())
        .limit(limit)
        .all()
    )

    for post in posts:
        upsert_post_embedding_source(db, post)

    db.commit()

    return len(posts)
