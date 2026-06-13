import hashlib
import re

from sqlalchemy.orm import Session

from app.config import EMBEDDING_DIMENSION, EMBEDDING_MODEL_NAME, OPENAI_API_KEY
from app.database import SessionLocal
from app.models.comment import Comment
from app.models.post import Post
from app.models.post_embedding import PostEmbedding
from app.services.rag_service import (
    DEFAULT_SIMILAR_POST_LIMIT,
    MAX_SIMILAR_POST_LIMIT,
    extract_keywords,
    get_post_tag_names,
)
from openai import OpenAI

COMMENT_SUMMARY_LIMIT = 20
REPRESENTATIVE_COMMENT_LIMIT = 5
COMMENT_SUMMARY_MAX_LENGTH = 700
VECTOR_MATCH_FIELD = "vector"

def get_openai_client() -> OpenAI:
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY가 설정되지 않았습니다.")

    return OpenAI(api_key=OPENAI_API_KEY)


def create_embedding(text: str) -> list[float]:
    client = get_openai_client()

    response = client.embeddings.create(
        model=EMBEDDING_MODEL_NAME,
        input=text,
    )

    return response.data[0].embedding


def update_post_embedding_vector(post_embedding: PostEmbedding) -> PostEmbedding:
    embedding = create_embedding(post_embedding.source_text)

    if len(embedding) != EMBEDDING_DIMENSION:
        raise ValueError(
            f"Embedding dimension mismatch: expected {EMBEDDING_DIMENSION}, got {len(embedding)}"
        )

    post_embedding.embedding = embedding
    post_embedding.embedding_model = EMBEDDING_MODEL_NAME

    return post_embedding


def embed_post_by_id(post_id: int) -> bool:
    db = SessionLocal()

    try:
        post = (
            db.query(Post)
            .filter(Post.id == post_id, Post.deleted_at.is_(None))
            .first()
        )

        if post is None:
            return False

        post_embedding = upsert_post_embedding_source(db, post)
        update_post_embedding_vector(post_embedding)
        db.commit()

        return True
    except Exception as exc:
        db.rollback()
        print(f"post embedding failed post_id={post_id}: {exc}")
        return False
    finally:
        db.close()


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


def build_query_embedding_text(
    title: str,
    content: str,
    tag_names: list[str] | None = None,
) -> str:
    source_parts = []

    if title.strip():
        source_parts.append(f"title: {normalize_text(title)}")

    if content.strip():
        source_parts.append(f"content: {normalize_text(content)}")

    cleaned_tags = [
        normalize_text(tag_name)
        for tag_name in tag_names or []
        if normalize_text(tag_name)
    ]

    if cleaned_tags:
        source_parts.append(f"tags: {', '.join(cleaned_tags)}")

    return "\n".join(source_parts).strip()


def calculate_vector_score(distance: float | None) -> int:
    if distance is None:
        return 0

    similarity = 1 - float(distance)
    score = round(similarity * 100)

    return max(0, min(100, score))


def find_similar_posts_by_vector(
    db: Session,
    title: str,
    content: str,
    tag_names: list[str],
    limit: int = DEFAULT_SIMILAR_POST_LIMIT,
) -> list[dict]:
    query_text = build_query_embedding_text(title, content, tag_names)

    if not query_text:
        return []

    query_embedding = create_embedding(query_text)
    normalized_limit = max(1, min(limit, MAX_SIMILAR_POST_LIMIT))
    distance = PostEmbedding.embedding.cosine_distance(query_embedding).label("distance")

    rows = (
        db.query(Post, distance)
        .join(PostEmbedding, PostEmbedding.post_id == Post.id)
        .filter(
            Post.deleted_at.is_(None),
            PostEmbedding.embedding.isnot(None),
        )
        .order_by(distance.asc())
        .limit(normalized_limit)
        .all()
    )

    keywords = extract_keywords(title, content, tag_names, limit=8)
    results = []

    for post, vector_distance in rows:
        results.append(
            {
                "id": post.id,
                "title": post.title,
                "content_preview": post.content[:80],
                "region": post.region,
                "store_name": post.store_name,
                "category": post.category,
                "score": calculate_vector_score(vector_distance),
                "matched_keywords": keywords,
                "matched_fields": [VECTOR_MATCH_FIELD],
                "created_at": post.created_at,
            }
        )

    return results
