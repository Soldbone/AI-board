from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.append(str(BACKEND_DIR))

from app.database import SessionLocal
from app.models.post import Post
from app.models.user import User
from app.services.rag_service import find_similar_posts


def assert_condition(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def check_empty_input(db) -> None:
    results = find_similar_posts(db, title="", content="", tag_names=[], limit=5)
    assert_condition(results == [], "빈 입력은 빈 배열을 반환해야 합니다.")
    print("PASS empty input")


def check_no_result(db) -> None:
    results = find_similar_posts(
        db,
        title="zzzz_unique_no_match_keyword_20260612",
        content="xxxx_unique_no_match_keyword_20260612",
        tag_names=[],
        limit=5,
    )
    assert_condition(results == [], "검색 결과가 없으면 빈 배열을 반환해야 합니다.")
    print("PASS no result")


def check_limit(db) -> None:
    results = find_similar_posts(
        db,
        title="처인구 중국집 추천",
        content="처인구에서 점심 먹을 중국집 찾고 있어요.",
        tag_names=["처인구", "중국집"],
        limit=99,
    )
    assert_condition(len(results) <= 5, "유사 게시글은 최대 5개까지만 반환해야 합니다.")
    print(f"PASS top 5 limit ({len(results)} items)")


def check_deleted_post_excluded(db) -> None:
    user = db.query(User).first()
    assert_condition(user is not None, "삭제 글 제외 테스트에는 최소 1명의 유저가 필요합니다.")

    deleted_post = Post(
        author_id=user.id,
        title="RAG_DELETE_TEST_UNIQUE_STORE",
        content="RAG_DELETE_TEST_UNIQUE_CONTENT",
        region="처인구",
        store_name="RAG_DELETE_TEST_UNIQUE_STORE",
        category="테스트",
        deleted_at=datetime.now(),
    )
    db.add(deleted_post)
    db.flush()

    results = find_similar_posts(
        db,
        title="RAG_DELETE_TEST_UNIQUE_STORE",
        content="RAG_DELETE_TEST_UNIQUE_CONTENT",
        tag_names=[],
        limit=5,
    )
    matched_ids = [item["id"] for item in results]

    assert_condition(
        deleted_post.id not in matched_ids,
        "삭제된 게시글은 RAG 결과에서 제외되어야 합니다.",
    )
    print("PASS deleted post excluded")


def main() -> None:
    db = SessionLocal()

    try:
        check_empty_input(db)
        check_no_result(db)
        check_limit(db)
        check_deleted_post_excluded(db)
        db.rollback()
        print("RAG checks passed")
    finally:
        db.close()


if __name__ == "__main__":
    main()
