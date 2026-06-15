from sqlalchemy.orm import Session

from backend.app.core.config import Settings
from backend.app.models.post import Post
from backend.app.models.user import User
from backend.app.schemas.ai import RagRecommendationItem
from backend.app.services import rag as rag_service


def make_post() -> Post:
    """RAG 정책 테스트에서 사용할 최소 게시글 객체를 만든다."""
    return Post(
        id=1,
        user_id=1,
        board_type="idea",
        title="감자 로그라이크",
        content="감자를 키우며 던전을 탐험하는 게임",
        genre="Roguelike",
        core_fun="매번 다른 감자 빌드",
        platform="Web",
        difficulty="medium",
    )


def make_user() -> User:
    """RAG 정책 테스트에서 사용할 최소 사용자 객체를 만든다."""
    return User(id=1, email="author@example.com", password_hash="hash", is_email_verified=True)


def test_refresh_post_embedding_skips_when_author_has_no_api_key(
    db_session: Session,
    test_settings: Settings,
    monkeypatch,
) -> None:
    """작성자 API Key가 없으면 게시글 embedding을 만들지 않고 RAG 대상에서 제외한다."""
    called = {"embedding": False, "upsert": False}

    def fake_get_user_openai_api_key(db, user, settings, required):
        return None

    def fake_create_openai_embedding(api_key, model_name, input_text):
        called["embedding"] = True
        return [0.1] * rag_service.EMBEDDING_DIMENSIONS

    def fake_upsert_post_embedding(db, post_id, embedding, model_name):
        called["upsert"] = True

    monkeypatch.setattr(rag_service, "get_user_openai_api_key", fake_get_user_openai_api_key)
    monkeypatch.setattr(rag_service, "create_openai_embedding", fake_create_openai_embedding)
    monkeypatch.setattr(rag_service, "upsert_post_embedding", fake_upsert_post_embedding)

    result = rag_service.refresh_post_embedding_from_author_key(
        db_session,
        make_user(),
        make_post(),
        test_settings,
    )

    assert result is False
    assert called == {"embedding": False, "upsert": False}


def test_refresh_post_embedding_uses_author_api_key(
    db_session: Session,
    test_settings: Settings,
    monkeypatch,
) -> None:
    """작성자 API Key가 있으면 그 Key로 현재 게시글 embedding만 저장한다."""
    captured = {}

    def fake_get_user_openai_api_key(db, user, settings, required):
        return "sk-author"

    def fake_create_openai_embedding(api_key, model_name, input_text):
        captured["api_key"] = api_key
        captured["model_name"] = model_name
        captured["input_text"] = input_text
        return [0.2] * rag_service.EMBEDDING_DIMENSIONS

    def fake_upsert_post_embedding(db, post_id, embedding, model_name):
        captured["post_id"] = post_id
        captured["embedding"] = embedding
        captured["upsert_model_name"] = model_name

    monkeypatch.setattr(rag_service, "get_user_openai_api_key", fake_get_user_openai_api_key)
    monkeypatch.setattr(rag_service, "create_openai_embedding", fake_create_openai_embedding)
    monkeypatch.setattr(rag_service, "upsert_post_embedding", fake_upsert_post_embedding)

    result = rag_service.refresh_post_embedding_from_author_key(
        db_session,
        make_user(),
        make_post(),
        test_settings,
    )

    assert result is True
    assert captured["api_key"] == "sk-author"
    assert captured["model_name"] == test_settings.embedding_model
    assert captured["post_id"] == 1
    assert captured["upsert_model_name"] == test_settings.embedding_model
    assert captured["embedding"] == [0.2] * rag_service.EMBEDDING_DIMENSIONS
    assert "제목: 감자 로그라이크" in captured["input_text"]


def test_recommend_posts_by_title_does_not_create_other_post_embeddings(
    db_session: Session,
    test_settings: Settings,
    monkeypatch,
) -> None:
    """미리확인 추천 검색은 현재 제목 embedding만 만들고 다른 게시글 embedding은 대신 만들지 않는다."""
    called = {"find": False}

    def fake_get_user_openai_api_key(db, user, settings, required):
        return "sk-searcher"

    def fake_create_openai_embedding(api_key, model_name, input_text):
        return [0.3] * rag_service.EMBEDDING_DIMENSIONS

    def fake_upsert_post_embedding(db, post_id, embedding, model_name):
        raise AssertionError("recommend_posts_by_title must not upsert post embeddings")

    def fake_find_similar_posts(db, embedding, limit):
        called["find"] = True
        return [
            RagRecommendationItem(
                id=10,
                board_type="idea",
                title="이미 embedding이 있는 글",
                similarity=0.91,
            )
        ]

    def fake_create_rag_preview_feedback(api_key, settings, title, items):
        return {
            "summary": "비슷한 글 1개를 찾았습니다.",
            "duplicate_risk": "핵심 소재가 일부 겹칩니다.",
            "suggestion": "감자 성장 규칙을 더 구체화하세요.",
        }

    monkeypatch.setattr(rag_service, "get_user_openai_api_key", fake_get_user_openai_api_key)
    monkeypatch.setattr(rag_service, "create_openai_embedding", fake_create_openai_embedding)
    monkeypatch.setattr(rag_service, "upsert_post_embedding", fake_upsert_post_embedding)
    monkeypatch.setattr(rag_service, "find_similar_posts", fake_find_similar_posts)
    monkeypatch.setattr(rag_service, "create_rag_preview_feedback", fake_create_rag_preview_feedback)

    response = rag_service.recommend_posts_by_title(
        db_session,
        make_user(),
        "감자 로그라이크",
        test_settings,
    )

    assert called["find"] is True
    assert response.items[0].title == "이미 embedding이 있는 글"
    assert response.summary == "비슷한 글 1개를 찾았습니다."
    assert response.duplicate_risk == "핵심 소재가 일부 겹칩니다."
    assert response.suggestion == "감자 성장 규칙을 더 구체화하세요."
