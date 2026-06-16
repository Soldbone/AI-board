from __future__ import annotations

import argparse
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "backend"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.ai.rag import indexing_service
from app.db.database import SessionLocal


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Reindex posts and comments into ContentChunk rows."
    )
    parser.add_argument("--post-id", type=int, help="Index a single post.")
    parser.add_argument("--comment-id", type=int, help="Index a single comment.")
    parser.add_argument(
        "--skip-posts",
        action="store_true",
        help="Skip post reindexing when running a full reindex.",
    )
    parser.add_argument(
        "--skip-comments",
        action="store_true",
        help="Skip comment reindexing when running a full reindex.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit the number of posts and comments loaded for a full reindex.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    db = SessionLocal()

    try:
        if args.post_id is not None:
            result = indexing_service.index_post(db, post_id=args.post_id)
            print(result.model_dump(mode="json"))
            return

        if args.comment_id is not None:
            result = indexing_service.index_comment(db, comment_id=args.comment_id)
            print(result.model_dump(mode="json"))
            return

        result = indexing_service.reindex_all_content(
            db,
            include_posts=not args.skip_posts,
            include_comments=not args.skip_comments,
            limit=args.limit,
        )
        print(result.model_dump(mode="json"))
    finally:
        db.close()


if __name__ == "__main__":
    main()
