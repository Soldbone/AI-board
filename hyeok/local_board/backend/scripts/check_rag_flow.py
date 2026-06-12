from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.append(str(BACKEND_DIR))

from app.database import SessionLocal
from app.models.post import Post
from app.models.user import User
from app.services.rag_service import extract_keywords, find_similar_posts


def assert_condition(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def check_empty_input(db) -> None:
    results = find_similar_posts(db, title="", content="", tag_names=[], limit=5)
    assert_condition(results == [], "빈 입력은 빈 배열을 반환해야 합니다.")
    print("PASS empty input")


def check_stopwords() -> None:
    keywords = extract_keywords(
        title="둔전역 진샤이 어때요?",
        content="가보신 분 후기 궁금해요",
        tag_names=[],
    )

    assert_condition("진샤이" in keywords, "핵심 키워드는 남아야 합니다.")
    assert_condition("어때요" not in keywords, "불용어는 키워드에서 제외되어야 합니다.")
    assert_condition("가보신" not in keywords, "불용어는 키워드에서 제외되어야 합니다.")
    assert_condition("궁금해요" not in keywords, "불용어는 키워드에서 제외되어야 합니다.")
    print("PASS stopwords")


def check_kiwi_noun_keywords() -> None:
    keywords = extract_keywords(
        title="처인구 중국집 추천",
        content="처인구에서 점심 먹을 중국집 찾고 있어요.",
        tag_names=["처인구", "중국집"],
    )

    assert_condition("처인구" in keywords, "지역 명사는 키워드로 남아야 합니다.")
    assert_condition("중국집" in keywords, "가게 분류 명사는 키워드로 남아야 합니다.")
    assert_condition("점심" in keywords, "본문의 핵심 명사는 키워드로 남아야 합니다.")
    assert_condition("처인구에서" not in keywords, "조사가 붙은 표현은 제외되어야 합니다.")
    assert_condition("먹을" not in keywords, "동사 표현은 제외되어야 합니다.")
    assert_condition("찾고" not in keywords, "동사 표현은 제외되어야 합니다.")
    assert_condition("있어요" not in keywords, "일반 서술 표현은 제외되어야 합니다.")
    print("PASS kiwi noun keywords")


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
        check_stopwords()
        check_kiwi_noun_keywords()
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
