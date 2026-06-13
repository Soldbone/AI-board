from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.user import UserApiKey
from conftest import auth_headers, register_verified_user


def test_auth_profile_and_api_key_flow(client, db_session: Session) -> None:
    """회원가입, 현재 사용자 조회, 닉네임 수정, API Key 암호화 저장을 검증한다."""
    token, user = register_verified_user(client, db_session, "Student@Example.com")
    headers = auth_headers(token)

    me_response = client.get("/auth/me", headers=headers)
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "student@example.com"

    nickname_response = client.patch(
        "/users/me/nickname",
        json={"nickname": "감자"},
        headers=headers,
    )
    assert nickname_response.status_code == 200
    assert nickname_response.json()["nickname"] == "감자"

    api_key_response = client.put(
        "/users/me/api-key",
        json={"provider": "openai", "api_key": "sk-demo-1234"},
        headers=headers,
    )
    assert api_key_response.status_code == 200
    assert api_key_response.json() == {
        "provider": "openai",
        "has_api_key": True,
        "api_key_last4": "1234",
    }

    saved_api_key = db_session.execute(
        select(UserApiKey).where(UserApiKey.user_id == user["id"])
    ).scalar_one()
    assert saved_api_key.encrypted_api_key != "sk-demo-1234"

    delete_response = client.delete("/users/me/api-key", headers=headers)
    assert delete_response.status_code == 200
    assert delete_response.json()["has_api_key"] is False


def test_posts_comments_search_and_owner_checks(client, db_session: Session) -> None:
    """게시글 CRUD 핵심, 검색, 댓글/별점 규칙, 작성자 권한 체크를 검증한다."""
    owner_token, _ = register_verified_user(client, db_session, "owner@example.com")
    other_token, _ = register_verified_user(client, db_session, "other@example.com")
    owner_headers = auth_headers(owner_token)
    other_headers = auth_headers(other_token)

    idea_response = client.post(
        "/posts",
        json={
            "board_type": "idea",
            "title": "감자 로그라이크",
            "content": "감자를 키우며 던전을 탐험하는 게임",
            "genre": "Roguelike",
            "core_fun": "매번 다른 감자 빌드",
            "platform": "Web",
            "difficulty": "medium",
            "tags": ["roguelike", "farming", "roguelike"],
            "source_url": "https://example.com/idea",
        },
        headers=owner_headers,
    )
    assert idea_response.status_code == 200
    idea = idea_response.json()
    assert idea["tags"] == ["farming", "roguelike"]

    list_response = client.get("/posts?board_type=idea&search=감자", headers=owner_headers)
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1

    comment_response = client.post(
        f"/posts/{idea['id']}/comments",
        json={"content": "핵심 재미가 명확해요."},
        headers=other_headers,
    )
    assert comment_response.status_code == 200

    idea_rating_response = client.post(
        f"/posts/{idea['id']}/comments",
        json={"content": "별점은 리뷰 게시판에서만 씁니다.", "rating": 4},
        headers=other_headers,
    )
    assert idea_rating_response.status_code == 400

    review_response = client.post(
        "/posts",
        json={
            "board_type": "review",
            "title": "점프 감자 플레이 리뷰",
            "content": "웹에서 바로 플레이할 수 있는 짧은 점프 게임",
            "genre": "Arcade",
            "platform": "Web",
            "tags": ["arcade"],
            "source_url": "https://example.com/game",
            "video_url": "https://example.com/video",
            "image_url": "https://example.com/image.png",
        },
        headers=owner_headers,
    )
    assert review_response.status_code == 200
    review = review_response.json()
    assert len(review["media"]) == 3

    missing_rating_response = client.post(
        f"/posts/{review['id']}/comments",
        json={"content": "재미있어요."},
        headers=other_headers,
    )
    assert missing_rating_response.status_code == 400

    rating_response = client.post(
        f"/posts/{review['id']}/comments",
        json={
            "content": "짧고 다시 하기 좋아요.",
            "rating": 5,
            "good_point": "조작이 단순함",
            "bad_point": "목표 설명이 부족함",
            "suggestion": "첫 화면에 목표를 보여주면 좋겠음",
        },
        headers=other_headers,
    )
    assert rating_response.status_code == 200

    detail_response = client.get(f"/posts/{review['id']}", headers=owner_headers)
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["average_rating"] == 5
    assert detail["review_count"] == 1

    forbidden_response = client.patch(
        f"/posts/{review['id']}",
        json={"title": "다른 사람이 바꾸려는 제목"},
        headers=other_headers,
    )
    assert forbidden_response.status_code == 403
