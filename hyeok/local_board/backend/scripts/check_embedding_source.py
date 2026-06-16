from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import text

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.append(str(BACKEND_DIR))

from app.database import Base, SessionLocal, enable_pgvector_extension, engine
from app.models import comment, post, post_embedding, tag, user
from app.models.post import Post
from app.models.post_embedding import PostEmbedding
from app.services.embedding_service import (
    build_post_embedding_source,
    summarize_comments,
    sync_post_embedding_sources,
)


def assert_condition(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def check_comment_summary() -> None:
    summary = summarize_comments(
        [
            "짬뽕 국물이 진하고 점심시간에는 웨이팅이 있어요.",
            "탕수육은 바삭하고 양이 괜찮았어요.",
            "점심시간 웨이팅이 조금 길었어요.",
        ]
    )

    assert_condition(summary is not None, "댓글 요약이 생성되어야 합니다.")
    assert_condition("자주 언급된 키워드" in summary, "댓글 요약에는 핵심 키워드가 포함되어야 합니다.")
    assert_condition("대표 댓글" in summary, "댓글 요약에는 대표 댓글이 포함되어야 합니다.")
    print("PASS comment summary")


def check_post_embedding_table(db) -> None:
    table_name = db.execute(
        text("SELECT to_regclass('public.post_embeddings')")
    ).scalar_one()

    assert_condition(table_name == "post_embeddings", "post_embeddings 테이블이 있어야 합니다.")
    print("PASS post_embeddings table")


def check_embedding_source_sync(db) -> None:
    sample_post = db.query(Post).filter(Post.deleted_at.is_(None)).first()

    if sample_post is None:
        print("SKIP embedding source sync: 게시글이 없습니다.")
        return

    source = build_post_embedding_source(db, sample_post)
    assert_condition("제목:" in source["source_text"], "임베딩 source_text에는 제목이 있어야 합니다.")
    assert_condition("내용:" in source["source_text"], "임베딩 source_text에는 내용이 있어야 합니다.")

    synced_count = sync_post_embedding_sources(db, limit=5)
    post_embedding_count = db.query(PostEmbedding).count()

    assert_condition(synced_count > 0, "임베딩 source 동기화 대상 게시글이 있어야 합니다.")
    assert_condition(post_embedding_count > 0, "post_embeddings 레코드가 생성되어야 합니다.")
    print(f"PASS embedding source sync ({synced_count} posts)")


def main() -> None:
    enable_pgvector_extension()
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    try:
        check_comment_summary()
        check_post_embedding_table(db)
        check_embedding_source_sync(db)
        print("Embedding source checks passed")
    finally:
        db.close()


if __name__ == "__main__":
    main()
