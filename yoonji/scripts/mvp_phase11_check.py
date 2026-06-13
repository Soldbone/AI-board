"""Run MVP Phase 11 smoke checks against a live FastAPI server.

This script intentionally calls the public HTTP API instead of repository or
service functions. Phase 11 is about checking whether the MVP behaves like a
usable board app from the outside.

Before running:
1. Start PostgreSQL and seed boards.
2. Start the backend server.
3. Run: python scripts/mvp_phase11_check.py

Optional:
    MVP_API_BASE_URL=http://127.0.0.1:8000/api/v1
"""

from __future__ import annotations

import base64
import os
import sys
import uuid
from dataclasses import dataclass
from typing import Any

import httpx


API_BASE_URL = os.getenv(
    "MVP_API_BASE_URL",
    "http://127.0.0.1:8000/api/v1",
).rstrip("/")
PASSWORD = "Phase11Password!23"
ONE_PIXEL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)
REQUIRED_BOARD_CODES = {"REVIEW", "INFO", "QUESTION", "PURCHASE_HELP"}


class CheckFailure(AssertionError):
    """Raised when an API response does not match the MVP contract."""


@dataclass(frozen=True)
class Actor:
    login_id: str
    email: str
    nickname: str
    access_token: str
    refresh_token: str


def main() -> int:
    print(f"Running MVP Phase 11 smoke checks against {API_BASE_URL}")

    try:
        with httpx.Client(base_url=API_BASE_URL, timeout=10.0) as client:
            run_checks(client)
    except httpx.ConnectError as exc:
        print(f"[FAIL] Backend is not reachable: {exc}", file=sys.stderr)
        print(
            "Start the backend first, or set MVP_API_BASE_URL to the running API.",
            file=sys.stderr,
        )
        return 1
    except CheckFailure as exc:
        print(f"[FAIL] {exc}", file=sys.stderr)
        return 1

    print("\nAll MVP Phase 11 smoke checks passed.")
    return 0


def run_checks(client: httpx.Client) -> None:
    marker = uuid.uuid4().hex[:8]

    check_health(client)
    check_boards(client)

    protected_payload = build_review_payload(marker, image_ids=[])
    expect_status(
        client.post("/posts", json=protected_payload),
        401,
        "anonymous user cannot create posts",
    )

    actor_a = signup_and_login(client, marker, "a")
    actor_b = signup_and_login(client, marker, "b")
    check_current_user(client, actor_a)

    image_id = upload_image(client, actor_a)

    invalid_payload = build_review_payload(marker, image_ids=[])
    invalid_payload["figure_info"]["figure_name"] = " "
    expect_status(
        client.post("/posts", json=invalid_payload, headers=auth_headers(actor_a)),
        (400, 422),
        "review post requires figure name",
    )

    post_id = create_review_post(client, actor_a, marker, image_id)
    check_public_read(client, post_id, marker)
    check_board_search_and_filters(client, post_id, marker)
    check_paging_and_sorting(client)
    check_comment_crud(client, actor_a, actor_b, post_id)
    check_post_permissions_and_update(client, actor_a, actor_b, post_id, marker)
    check_my_page(client, actor_a, post_id)
    check_post_delete(client, actor_a, actor_b, post_id)


def check_health(client: httpx.Client) -> None:
    response = expect_status(client.get("/health"), 200, "health check")
    body = response.json()
    assert_equal(body.get("status"), "ok", "health status")
    print("[PASS] BOARD-00 health check")


def check_boards(client: httpx.Client) -> None:
    response = expect_status(client.get("/boards"), 200, "board list")
    codes = {board["code"] for board in response.json().get("items", [])}
    missing = REQUIRED_BOARD_CODES - codes

    if missing:
        raise CheckFailure(f"missing required boards: {sorted(missing)}")

    print("[PASS] BOARD-01 board list includes MVP boards")


def signup_and_login(client: httpx.Client, marker: str, suffix: str) -> Actor:
    login_id = f"phase11_{marker}_{suffix}"
    email = f"{login_id}@example.com"
    nickname = f"Phase11 {suffix.upper()} {marker}"

    signup_payload = {
        "email": email,
        "login_id": login_id,
        "password": PASSWORD,
        "nickname": nickname,
    }
    expect_status(
        client.post("/auth/signup", json=signup_payload),
        201,
        f"signup {suffix}",
    )

    login_response = expect_status(
        client.post(
            "/auth/login",
            json={"login_id": login_id, "password": PASSWORD},
        ),
        200,
        f"login {suffix}",
    )
    tokens = login_response.json()

    print(f"[PASS] BOARD-02 signup and login for actor {suffix}")
    return Actor(
        login_id=login_id,
        email=email,
        nickname=nickname,
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
    )


def check_current_user(client: httpx.Client, actor: Actor) -> None:
    response = expect_status(
        client.get("/users/me", headers=auth_headers(actor)),
        200,
        "current user",
    )
    assert_equal(response.json()["login_id"], actor.login_id, "current user login_id")
    print("[PASS] BOARD-18 authenticated user can read /users/me")


def upload_image(client: httpx.Client, actor: Actor) -> int:
    files = {"file": ("phase11.png", ONE_PIXEL_PNG, "image/png")}
    expect_status(
        client.post("/images", files=files),
        401,
        "anonymous user cannot upload images",
    )

    response = expect_status(
        client.post("/images", files=files, headers=auth_headers(actor)),
        201,
        "authenticated image upload",
    )
    image = response.json()
    assert_equal(image["mime_type"], "image/png", "uploaded image mime_type")
    print("[PASS] BOARD-04 image upload before review post creation")
    return int(image["id"])


def create_review_post(
    client: httpx.Client,
    actor: Actor,
    marker: str,
    image_id: int,
) -> int:
    payload = build_review_payload(marker, image_ids=[image_id])
    response = expect_status(
        client.post("/posts", json=payload, headers=auth_headers(actor)),
        201,
        "create review post",
    )
    body = response.json()
    assert_equal(body["board_code"], "REVIEW", "created post board_code")
    print("[PASS] BOARD-04 review post creation with figure info, tag, image")
    return int(body["id"])


def check_public_read(client: httpx.Client, post_id: int, marker: str) -> None:
    list_response = expect_status(
        client.get("/posts", params={"board_code": "REVIEW", "size": 5}),
        200,
        "public post list",
    )
    assert_list_shape(list_response.json(), "public post list")

    detail_response = expect_status(
        client.get(f"/posts/{post_id}"),
        200,
        "public post detail",
    )
    detail = detail_response.json()
    assert_equal(detail["id"], post_id, "detail post id")
    assert_contains(detail["title"], marker, "detail title marker")
    assert_equal(detail["figure_info"]["figure_name"], f"Phase11 Figure {marker}", "figure name")

    if not detail["images"]:
        raise CheckFailure("review detail should include uploaded image")

    print("[PASS] BOARD-01 public list/detail read")


def check_board_search_and_filters(
    client: httpx.Client,
    post_id: int,
    marker: str,
) -> None:
    tag_name = f"phase11-{marker}"
    board_search = expect_status(
        client.get(
            "/posts",
            params={"board_code": "REVIEW", "q": marker, "sort": "relevance"},
        ),
        200,
        "board-scoped post search",
    ).json()
    assert_item_id_in_response(board_search, post_id, "board-scoped search result")

    tag_response = expect_status(
        client.get("/tags", params={"q": tag_name, "limit": 5}),
        200,
        "tag autocomplete",
    ).json()

    if not any(item["name"] == tag_name for item in tag_response.get("items", [])):
        raise CheckFailure("created tag was not returned from tag autocomplete")

    tag_posts = expect_status(
        client.get("/posts", params={"tag": tag_name, "size": 10}),
        200,
        "tag-filtered posts",
    ).json()
    assert_item_id_in_response(tag_posts, post_id, "tag-filtered post result")

    search_posts = expect_status(
        client.get("/search/posts", params={"q": f"Figure {marker}", "size": 10}),
        200,
        "global post search",
    ).json()
    assert_item_id_in_response(search_posts, post_id, "global search result")

    print("[PASS] BOARD-14/15 tag exploration and search")


def check_paging_and_sorting(client: httpx.Client) -> None:
    for sort in ("latest", "views", "satisfaction", "comments"):
        response = expect_status(
            client.get("/posts", params={"page": 1, "size": 1, "sort": sort}),
            200,
            f"post paging sort={sort}",
        )
        assert_list_shape(response.json(), f"post paging sort={sort}")

    print("[PASS] BOARD-16 paging and sorting")


def check_comment_crud(
    client: httpx.Client,
    actor_a: Actor,
    actor_b: Actor,
    post_id: int,
) -> None:
    expect_status(
        client.post(f"/posts/{post_id}/comments", json={"content": "anonymous"}),
        401,
        "anonymous user cannot create comments",
    )

    create_response = expect_status(
        client.post(
            f"/posts/{post_id}/comments",
            json={"content": "Phase11 comment"},
            headers=auth_headers(actor_a),
        ),
        201,
        "create comment",
    )
    comment_id = int(create_response.json()["id"])

    list_response = expect_status(
        client.get(f"/posts/{post_id}/comments"),
        200,
        "list comments",
    ).json()
    assert_item_id_in_response(list_response, comment_id, "comment list")

    expect_status(
        client.patch(
            f"/comments/{comment_id}",
            json={"content": "Trying to edit another user's comment"},
            headers=auth_headers(actor_b),
        ),
        403,
        "other user cannot edit comment",
    )

    update_response = expect_status(
        client.patch(
            f"/comments/{comment_id}",
            json={"content": "Phase11 comment updated"},
            headers=auth_headers(actor_a),
        ),
        200,
        "update comment",
    )
    assert_equal(update_response.json()["content"], "Phase11 comment updated", "updated comment")

    my_comments = expect_status(
        client.get("/users/me/comments", headers=auth_headers(actor_a)),
        200,
        "my comments",
    ).json()
    assert_item_id_in_response(my_comments, comment_id, "my comment list")

    detail_after_comment = expect_status(
        client.get(f"/posts/{post_id}"),
        200,
        "post detail after comment",
    ).json()

    if detail_after_comment["comment_count"] < 1:
        raise CheckFailure("post comment_count should increase after comment create")

    expect_status(
        client.delete(f"/comments/{comment_id}", headers=auth_headers(actor_a)),
        204,
        "delete comment",
    )
    print("[PASS] BOARD-12 comment CRUD and author permission")


def check_post_permissions_and_update(
    client: httpx.Client,
    actor_a: Actor,
    actor_b: Actor,
    post_id: int,
    marker: str,
) -> None:
    expect_status(
        client.patch(
            f"/posts/{post_id}",
            json={"title": "Not my post"},
            headers=auth_headers(actor_b),
        ),
        403,
        "other user cannot update post",
    )

    updated_title = f"Phase11 Updated Review {marker}"
    response = expect_status(
        client.patch(
            f"/posts/{post_id}",
            json={
                "title": updated_title,
                "content": f"Updated Phase11 content {marker}",
                "figure_info": {
                    "figure_name": f"Phase11 Figure Updated {marker}",
                    "manufacturer": "Phase11 Maker",
                    "figure_type": "SCALE",
                    "price_range": "50000_100000",
                    "satisfaction_score": 4,
                    "target_type": "REVIEW_TARGET",
                },
                "tags": [{"name": f"phase11-updated-{marker}", "tag_type": "GENERAL"}],
            },
            headers=auth_headers(actor_a),
        ),
        200,
        "author updates post",
    )
    body = response.json()
    assert_equal(body["title"], updated_title, "updated post title")
    assert_equal(
        body["figure_info"]["figure_name"],
        f"Phase11 Figure Updated {marker}",
        "updated figure info",
    )
    print("[PASS] BOARD-09 post update and author permission")


def check_my_page(client: httpx.Client, actor: Actor, post_id: int) -> None:
    response = expect_status(
        client.get("/users/me/posts", headers=auth_headers(actor)),
        200,
        "my posts",
    )
    assert_item_id_in_response(response.json(), post_id, "my post list")
    print("[PASS] BOARD-18 my page post list")


def check_post_delete(
    client: httpx.Client,
    actor_a: Actor,
    actor_b: Actor,
    post_id: int,
) -> None:
    expect_status(
        client.delete(f"/posts/{post_id}", headers=auth_headers(actor_b)),
        403,
        "other user cannot delete post",
    )
    expect_status(
        client.delete(f"/posts/{post_id}", headers=auth_headers(actor_a)),
        204,
        "author deletes post",
    )
    expect_status(
        client.get(f"/posts/{post_id}"),
        404,
        "deleted post is hidden from public detail",
    )
    print("[PASS] BOARD-11 soft delete and author permission")


def build_review_payload(marker: str, *, image_ids: list[int]) -> dict[str, Any]:
    return {
        "board_code": "REVIEW",
        "title": f"Phase11 Review {marker}",
        "content": f"Phase11 content for search marker {marker}.",
        "status": "PUBLISHED",
        "figure_info": {
            "figure_name": f"Phase11 Figure {marker}",
            "manufacturer": "Phase11 Maker",
            "figure_type": "SCALE",
            "price_amount": "69000",
            "price_range": "50000_100000",
            "purchase_date": "2026-06-13",
            "satisfaction_score": 5,
            "target_type": "REVIEW_TARGET",
        },
        "tags": [{"name": f"phase11-{marker}", "tag_type": "GENERAL"}],
        "image_ids": image_ids,
    }


def auth_headers(actor: Actor) -> dict[str, str]:
    return {"Authorization": f"Bearer {actor.access_token}"}


def expect_status(
    response: httpx.Response,
    expected_status: int | tuple[int, ...],
    label: str,
) -> httpx.Response:
    expected = (
        expected_status
        if isinstance(expected_status, tuple)
        else (expected_status,)
    )

    if response.status_code not in expected:
        body = response.text[:500]
        raise CheckFailure(
            f"{label}: expected HTTP {expected}, got {response.status_code}. Body: {body}"
        )

    return response


def assert_equal(actual: Any, expected: Any, label: str) -> None:
    if actual != expected:
        raise CheckFailure(f"{label}: expected {expected!r}, got {actual!r}")


def assert_contains(value: str, expected_piece: str, label: str) -> None:
    if expected_piece not in value:
        raise CheckFailure(f"{label}: {expected_piece!r} not found in {value!r}")


def assert_list_shape(body: dict[str, Any], label: str) -> None:
    for key in ("items", "page", "size", "total", "has_next"):
        if key not in body:
            raise CheckFailure(f"{label}: missing list response key {key!r}")


def assert_item_id_in_response(
    body: dict[str, Any],
    item_id: int,
    label: str,
) -> None:
    ids = {int(item["id"]) for item in body.get("items", [])}

    if item_id not in ids:
        raise CheckFailure(f"{label}: id {item_id} was not present in {sorted(ids)}")


if __name__ == "__main__":
    raise SystemExit(main())
