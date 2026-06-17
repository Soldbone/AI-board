from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import text


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.append(str(BACKEND_DIR))

from app.database import engine


def main() -> None:
    with engine.begin() as connection:
        connection.execute(
            text(
                "ALTER TABLE posts "
                "ADD COLUMN IF NOT EXISTS post_type VARCHAR(20) "
                "NOT NULL DEFAULT 'question'"
            )
        )
        connection.execute(
            text(
                "UPDATE posts "
                "SET post_type = 'review' "
                "WHERE title LIKE '[실제 후기]%'"
            )
        )
        connection.execute(
            text(
                "UPDATE posts "
                "SET post_type = 'question' "
                "WHERE title NOT LIKE '[실제 후기]%'"
            )
        )

    print("post_type backfill completed")


if __name__ == "__main__":
    main()
