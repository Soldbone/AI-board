#embedding 테스트용 파일
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


def main() -> None:
    enable_pgvector_extension()
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    try:
        target_post = (
            db.query(Post)
            .filter(Post.deleted_at.is_(None))
            .order_by(Post.id.asc())
            .first()
        )

        if target_post is None:
            print("게시글이 없습니다.")
            return

        post_embedding = upsert_post_embedding_source(db, target_post)
        update_post_embedding_vector(post_embedding)

        db.commit()
        db.refresh(post_embedding)

        print(f"embedded post_id={target_post.id}")
        print(f"embedding_model={post_embedding.embedding_model}")
        print(f"embedding_saved={post_embedding.embedding is not None}")
        print(post_embedding.source_text[:100].encode("unicode_escape").decode("ascii"))
    finally:
        db.close()


if __name__ == "__main__":
    main()