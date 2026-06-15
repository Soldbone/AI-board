from __future__ import annotations

import asyncio
import random
import re
import sys
from datetime import datetime, timedelta
from html import unescape
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx
from sqlalchemy import func, text


BACKEND_DIR = Path(__file__).resolve().parents[1]
LOCAL_BOARD_DIR = BACKEND_DIR.parent
MCP_SERVER_DIR = LOCAL_BOARD_DIR / "mcp_server"

sys.path.append(str(BACKEND_DIR))
sys.path.insert(0, str(MCP_SERVER_DIR))

from app.database import Base, SessionLocal, engine
from app.models.comment import Comment
from app.models.post import Post
from app.models.tag import Tag, post_tags
from app.models.user import User
from config import get_settings


RANDOM_SEED = 20260615

REGION_TARGETS = {
    "용인 처인구": 50,
    "창원 성산구": 100,
    "사당역": 100,
}

SEARCH_KEYWORDS = [
    "병원",
    "약국",
    "치과",
    "한식",
    "중국집",
    "일식",
    "분식",
    "고기집",
    "치킨",
    "카페",
    "베이커리",
    "미용실",
    "옷가게",
    "네일샵",
    "피자",
    "돈까스",
    "국밥",
    "초밥",
    "파스타",
    "헬스장",
]

NAVER_REQUEST_DELAY_SECONDS = 0.7
NAVER_MAX_RETRIES = 4

SEED_USERS = [
    ("local-seed-01@example.com", "동네후기러1"),
    ("local-seed-02@example.com", "동네후기러2"),
    ("local-seed-03@example.com", "맛집탐색러"),
    ("local-seed-04@example.com", "카페기록러"),
    ("local-seed-05@example.com", "생활정보러"),
    ("local-seed-06@example.com", "동네주민A"),
    ("local-seed-07@example.com", "동네주민B"),
    ("local-seed-08@example.com", "후기수집가"),
]

POST_TITLE_TEMPLATES = [
    "{store} 실제로 가보신 분 있나요?",
    "{region}에서 {store} 이용해본 후기 궁금해요",
    "{store} 처음 가보려는데 괜찮을까요?",
    "{category} 쪽으로 {store} 어떤 편인가요?",
    "{region} 주민분들 {store} 추천하시나요?",
    "{store} 가격대나 분위기 아시는 분 계신가요?",
    "{store} 방문 전에 참고할 만한 점 있을까요?",
    "{region} 근처에서 {store} 다녀오신 분 후기 부탁드려요",
]

POST_CONTENT_TEMPLATES = [
    "{region}에서 {category} 정보를 찾다가 {store}를 봤습니다. 실제로 이용해보신 분들이 느낀 장단점이 궁금합니다.",
    "{store}가 네이버에 나오긴 하는데, 지도 정보만으로는 판단이 어려워서 질문 남깁니다. 직원 응대나 대기 시간은 어떤가요?",
    "{category} 관련해서 {store}를 후보로 보고 있습니다. 처음 방문하는 사람 입장에서 추천할 만한지 알려주세요.",
    "{region} 주변에서 갈 만한 곳을 찾는 중입니다. {store}의 가격대, 접근성, 재방문 의사가 궁금합니다.",
    "{store}를 방문해볼까 하는데, 혼자 가도 괜찮은지 또는 가족이나 지인과 가기 좋은지 의견 부탁드립니다.",
    "최근 {region} 쪽에서 {category} 찾는 분들이 많아서 {store} 후기를 모아보고 싶습니다. 이용 경험을 댓글로 공유해주세요.",
]

COMMENT_TEMPLATES = [
    "직원 응대가 차분하고 친절해서 첫 방문이어도 부담이 적었습니다.",
    "주말에는 사람이 몰릴 수 있어서 가능하면 평일이나 이른 시간대를 추천합니다.",
    "위치가 찾기 쉬운 편이라 처음 가는 사람도 크게 헤매지는 않을 것 같아요.",
    "가격대는 아주 저렴하진 않지만 전반적인 만족도는 괜찮았습니다.",
    "매장 분위기가 깔끔해서 지인과 같이 가기에도 무난해 보였습니다.",
    "대기 시간이 생길 수 있으니 방문 전에 영업시간을 한 번 확인하는 게 좋아요.",
    "친절도는 좋은 편이었고 설명도 비교적 자세하게 해줬습니다.",
    "혼자 방문해도 크게 어색하지 않은 분위기였습니다.",
    "가족 단위로 가는 분들도 종종 보여서 편하게 이용할 수 있을 것 같아요.",
    "근처 다른 곳과 비교하면 접근성이 괜찮은 편입니다.",
    "매장 내부가 복잡하지 않아서 짧게 들르기에도 좋았습니다.",
    "처음 방문이라면 가장 기본 메뉴나 대표 서비스를 먼저 이용해보는 걸 추천해요.",
    "포장이나 예약 가능 여부는 상황마다 다를 수 있어서 전화 확인이 안전합니다.",
    "직원분이 바쁠 때도 응대가 크게 불편하지는 않았습니다.",
    "주변에 다른 가게도 많아서 일정 묶어서 들르기 좋았습니다.",
    "기대보다 깔끔했고 재방문을 고민해볼 만한 정도였습니다.",
    "사람마다 만족 기준은 다르겠지만 저는 무난하게 괜찮았습니다.",
    "피크 시간대만 피하면 훨씬 편하게 이용할 수 있을 것 같아요.",
    "동네에서 가볍게 들르기 좋은 곳이라는 인상이었습니다.",
    "처음 가는 분은 지도 링크로 위치를 정확히 보고 가는 걸 추천합니다.",
]

COMMENT_DETAIL_TEMPLATES = [
    "{store} 기준으로 보면 {region}에서 접근성이 괜찮다는 점이 먼저 눈에 들어왔습니다.",
    "분류가 {category}인 곳으로 보면 기본적인 만족도는 무난하게 기대해볼 만합니다.",
    "저라면 {store} 방문은 피크 시간대를 피해서 먼저 시도해볼 것 같습니다.",
    "{region} 근처에서 일정이 있다면 후보에 넣어볼 정도는 된다고 봅니다.",
    "{store} 위치만 잘 확인하고 가면 처음 방문도 크게 어렵지 않아 보입니다.",
    "분류가 {category}인 곳을 찾는 사람이라면 비교 후보로 같이 봐도 괜찮겠습니다.",
    "개인적으로는 {store}의 분위기와 접근성을 같이 보고 결정할 것 같아요.",
    "{region} 쪽을 자주 다닌다면 한 번쯤 체크해볼 만한 곳입니다.",
    "다만 사람 몰리는 시간에는 {store}도 여유가 적을 수 있어 보입니다.",
    "{category} 특성상 방문 목적을 먼저 정하고 가면 만족도가 더 높을 것 같습니다.",
]


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    without_tags = re.sub(r"<[^>]+>", "", value)
    return " ".join(unescape(without_tags).split()).strip()


def build_naver_map_url(query: str) -> str:
    return f"https://map.naver.com/p/search/{quote(query, safe='')}"


def short_text(value: str, limit: int) -> str:
    cleaned_value = clean_text(value)
    return cleaned_value[:limit]


def simplify_category(category: str, fallback_keyword: str) -> str:
    cleaned_category = clean_text(category)
    if not cleaned_category:
        return fallback_keyword
    return cleaned_category[:50]


def build_tags(region: str, keyword: str, place: dict[str, Any]) -> list[str]:
    category = clean_text(place.get("category"))
    title = clean_text(place.get("title"))
    tags = [
        region,
        keyword,
        "실제가게",
        "후기",
        "추천",
    ]

    if title:
        tags.append(title[:20])

    for separator in (">", ",", "/"):
        category = category.replace(separator, " ")

    for part in category.split():
        if len(part) >= 2:
            tags.append(part[:20])

    unique_tags: list[str] = []
    for tag in tags:
        if tag and tag not in unique_tags:
            unique_tags.append(tag)

    return unique_tags[:6]


async def collect_places_for_region(region: str, target_count: int) -> list[dict[str, Any]]:
    places: list[dict[str, Any]] = []
    settings = get_settings()
    headers = {
        "X-Naver-Client-Id": settings.naver_client_id,
        "X-Naver-Client-Secret": settings.naver_client_secret,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        for keyword in SEARCH_KEYWORDS:
            query = f"{region} {keyword}"
            response = None

            for attempt in range(1, NAVER_MAX_RETRIES + 1):
                response = await client.get(
                    settings.naver_local_search_url,
                    headers=headers,
                    params={
                        "query": query,
                        "display": 5,
                        "start": 1,
                        "sort": "comment",
                    },
                )

                if response.status_code != 429:
                    break

                wait_seconds = NAVER_REQUEST_DELAY_SECONDS * attempt
                print(f"[retry] {query} 429 응답, {wait_seconds:.1f}초 대기")
                await asyncio.sleep(wait_seconds)

            if response is None:
                continue

            if response.status_code == 429:
                print(f"[skip] {query} 요청 제한으로 건너뜀")
                continue

            response.raise_for_status()

            for item in response.json().get("items", []):
                title = clean_text(item.get("title"))
                if not title:
                    continue

                map_query = " ".join(part for part in [region, title] if part)
                places.append(
                    {
                        "title": title,
                        "category": clean_text(item.get("category")),
                        "description": clean_text(item.get("description")),
                        "road_address": clean_text(item.get("roadAddress")),
                        "address": clean_text(item.get("address")),
                        "link": clean_text(item.get("link")),
                        "naver_map_url": build_naver_map_url(map_query or query),
                        "seed_region": region,
                        "seed_keyword": keyword,
                    }
                )

            await asyncio.sleep(NAVER_REQUEST_DELAY_SECONDS)

    if not places:
        raise RuntimeError(f"{region} 지역의 실제 가게 검색 결과를 찾지 못했습니다.")

    while len(places) < target_count:
        places.extend(random.sample(places, min(len(places), target_count - len(places))))

    random.shuffle(places)
    return places[:target_count]


async def collect_places() -> dict[str, list[dict[str, Any]]]:
    collected: dict[str, list[dict[str, Any]]] = {}

    for region, target_count in REGION_TARGETS.items():
        print(f"[collect] {region} 실제 가게 {target_count}개 수집 중")
        collected[region] = await collect_places_for_region(region, target_count)
        print(f"[collect] {region} {len(collected[region])}개 준비 완료")

    return collected


def get_or_create_seed_users(db) -> list[User]:
    users: list[User] = []

    for email, nickname in SEED_USERS:
        user = db.query(User).filter(User.email == email).first()

        if not user:
            user = User(
                email=email,
                nickname=nickname,
                password_hash="seed-data-only",
                bio="실제 가게 테스트 데이터 생성용 계정입니다.",
            )
            db.add(user)
            db.flush()

        users.append(user)

    db.commit()
    return users


def get_or_create_tag(db, name: str) -> Tag:
    tag = db.query(Tag).filter(Tag.name == name).first()

    if tag:
        return tag

    tag = Tag(name=name)
    db.add(tag)
    db.flush()
    return tag


def attach_tags(db, post_id: int, tag_names: list[str]) -> None:
    for tag_name in tag_names:
        tag = get_or_create_tag(db, tag_name)
        db.execute(
            post_tags.insert().values(
                post_id=post_id,
                tag_id=tag.id,
            )
        )


def delete_existing_board_data(db) -> None:
    embedding_table = db.execute(text("SELECT to_regclass('public.post_embeddings')")).scalar()

    if embedding_table:
        db.execute(text("DELETE FROM post_embeddings"))

    db.execute(text("DELETE FROM comments"))
    db.execute(text("DELETE FROM post_tags"))
    db.execute(text("DELETE FROM posts"))
    db.execute(text("DELETE FROM tags"))
    db.commit()


def build_post_data(region: str, place: dict[str, Any], index: int) -> dict[str, Any]:
    store_name = short_text(place.get("title", ""), 100)
    keyword = clean_text(place.get("seed_keyword")) or "장소"
    category = simplify_category(place.get("category", ""), keyword)
    title_template = POST_TITLE_TEMPLATES[index % len(POST_TITLE_TEMPLATES)]
    content_template = POST_CONTENT_TEMPLATES[index % len(POST_CONTENT_TEMPLATES)]
    created_at = datetime.now() - timedelta(
        days=random.randint(0, 75),
        hours=random.randint(0, 23),
        minutes=random.randint(0, 59),
    )

    return {
        "title": short_text(
            title_template.format(
                region=region,
                store=store_name,
                category=keyword,
            ),
            100,
        ),
        "content": content_template.format(
            region=region,
            store=store_name,
            category=keyword,
        ),
        "region": region,
        "store_name": store_name,
        "category": category,
        "tag_names": build_tags(region, keyword, place),
        "view_count": random.randint(0, 900),
        "created_at": created_at,
    }


def create_comments(db, post: Post, users: list[User], index: int) -> None:
    comment_count = 3 + (index % 3)
    start_index = (index * 5) % len(COMMENT_TEMPLATES)
    selected_comments = [
        COMMENT_TEMPLATES[(start_index + offset) % len(COMMENT_TEMPLATES)]
        for offset in range(comment_count)
    ]

    for offset, content in enumerate(selected_comments):
        author = users[(index + offset + 1) % len(users)]
        created_at = post.created_at + timedelta(hours=offset + 1)
        detail = COMMENT_DETAIL_TEMPLATES[
            (index + offset * 3) % len(COMMENT_DETAIL_TEMPLATES)
        ].format(
            store=post.store_name,
            region=post.region,
            category=post.category,
        )
        comment = Comment(
            post_id=post.id,
            author_id=author.id,
            content=f"{content} {detail}",
            is_anonymous=(index + offset) % 5 == 0,
            created_at=created_at,
            updated_at=created_at,
        )
        db.add(comment)


def seed_database(collected_places: dict[str, list[dict[str, Any]]]) -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        delete_existing_board_data(db)
        users = get_or_create_seed_users(db)
        created_count = 0

        for region, places in collected_places.items():
            for place in places:
                author = users[created_count % len(users)]
                payload = build_post_data(region, place, created_count)
                post = Post(
                    author_id=author.id,
                    title=payload["title"],
                    content=payload["content"],
                    region=payload["region"],
                    store_name=payload["store_name"],
                    category=payload["category"],
                    post_type="question",
                    view_count=payload["view_count"],
                    created_at=payload["created_at"],
                    updated_at=payload["created_at"],
                )
                db.add(post)
                db.flush()

                attach_tags(db, post.id, payload["tag_names"])
                create_comments(db, post, users, created_count)
                created_count += 1

                if created_count % 50 == 0:
                    db.commit()
                    print(f"[seed] 게시글 {created_count}개 생성 완료")

        db.commit()
        comment_count = db.query(func.count(Comment.id)).scalar()
        tag_count = db.query(func.count(Tag.id)).scalar()
        print(
            "[done] 실제 가게 테스트 데이터 생성 완료: "
            f"posts={created_count}, comments={comment_count}, tags={tag_count}"
        )
    finally:
        db.close()


async def main() -> None:
    random.seed(RANDOM_SEED)
    collected_places = await collect_places()
    seed_database(collected_places)


if __name__ == "__main__":
    asyncio.run(main())
