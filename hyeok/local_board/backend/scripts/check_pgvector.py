from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import text

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.append(str(BACKEND_DIR))

from app.database import SessionLocal, enable_pgvector_extension


def main() -> None:
    enable_pgvector_extension()

    db = SessionLocal()

    try:
        version = db.execute(
            text("SELECT extversion FROM pg_extension WHERE extname = 'vector'")
        ).scalar_one()
        distance = db.execute(
            text("SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector")
        ).scalar_one()

        print(f"PASS pgvector extension version: {version}")
        print(f"PASS vector distance check: {distance}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
