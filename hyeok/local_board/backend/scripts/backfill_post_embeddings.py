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


BACKFILL_LIMIT = 100


def main() -> None:
    enable_pgvector_extension()
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    try:
        posts = (
            db.query(Post)
            .filter(Post.deleted_at.is_(None))
            .order_by(Post.id.asc())
            .limit(BACKFILL_LIMIT)
            .all()
        )

        for post in posts:
            post_embedding = upsert_post_embedding_source(db, post)

            if post_embedding.embedding is not None:
                print(f"skip post_id={post.id}")
                continue

            update_post_embedding_vector(post_embedding)
            print(f"embedded post_id={post.id}")

        db.commit()
        print(f"done count={len(posts)}")
    finally:
        db.close()


if __name__ == "__main__":
    main()