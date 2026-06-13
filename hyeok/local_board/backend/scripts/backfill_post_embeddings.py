from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.append(str(BACKEND_DIR))

from app.database import Base, SessionLocal, enable_pgvector_extension, engine
from app.models import comment, post, post_embedding, tag, user
from app.models.post import Post
from app.services.embedding_service import (
    update_post_embedding_vector,
    upsert_post_embedding_source,
)


def get_backfill_limit() -> int | None:
    if len(sys.argv) < 2:
        return None

    limit = int(sys.argv[1])

    if limit < 1:
        return None

    return limit


def main() -> None:
    enable_pgvector_extension()
    Base.metadata.create_all(bind=engine)

    limit = get_backfill_limit()
    db = SessionLocal()

    try:
        query = (
            db.query(Post)
            .filter(Post.deleted_at.is_(None))
            .order_by(Post.id.asc())
        )

        if limit is not None:
            query = query.limit(limit)

        posts = query.all()
        embedded_count = 0
        skipped_count = 0
        failed_count = 0

        for post in posts:
            try:
                post_embedding = upsert_post_embedding_source(db, post)

                if post_embedding.embedding is not None:
                    skipped_count += 1
                    print(f"skip post_id={post.id}")
                    continue

                update_post_embedding_vector(post_embedding)
                db.commit()
                embedded_count += 1
                print(f"embedded post_id={post.id}")
            except Exception as exc:
                db.rollback()
                failed_count += 1
                print(f"failed post_id={post.id} error={exc}")
                continue

        print(
            "done "
            f"checked={len(posts)} "
            f"embedded={embedded_count} "
            f"skipped={skipped_count} "
            f"failed={failed_count}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
