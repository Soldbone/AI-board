from __future__ import annotations

import random
import sys
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import func


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.append(str(BACKEND_DIR))

from app.database import Base, SessionLocal, engine
from app.models.comment import Comment
from app.models.post import Post
from app.models.tag import Tag, post_tags
from app.models.user import User


RANDOM_SEED = 20260615
REVIEW_MARKER = "[실제 후기]"
REVIEWS_PER_STORE = 3

SEED_USERS = [
    ("review-seed-01@example.com", "후기동네러1"),
    ("review-seed-02@example.com", "후기동네러2"),
    ("review-seed-03@example.com", "재방문러"),
    ("review-seed-04@example.com", "맛기록러"),
    ("review-seed-05@example.com", "생활후기러"),
    ("review-seed-06@example.com", "동네탐방러"),
]

FOOD_KEYWORDS = (
    "음식",
    "한식",
    "중식",
    "일식",
    "분식",
    "카페",
    "디저트",
    "베이커리",
    "토스트",
    "김밥",
    "초밥",
    "닭갈비",
    "햄버거",
    "족발",
    "보쌈",
    "감자탕",
    "파스타",
    "치킨",
    "국밥",
)

BEAUTY_KEYWORDS = ("미용", "네일", "헤어", "뷰티", "왁싱")
MEDICAL_KEYWORDS = ("병원", "의원", "치과", "약국", "의료", "피부과")
SHOPPING_KEYWORDS = ("패션", "의류", "옷", "쇼핑", "유통")
FITNESS_KEYWORDS = ("헬스", "피트니스", "스포츠")

TITLE_TEMPLATES = [
    "{marker} {store} 생각보다 만족스러웠어요",
    "{marker} {store} 다녀온 후기 남겨요",
    "{marker} {store} 재방문 고민 중입니다",
]

FOOD_CONTENTS = [
    "{store}에서 먹어봤는데 음식이 전반적으로 깔끔하고 맛도 괜찮았습니다. {region} 근처에서 식사할 곳 찾는 분들에게 참고가 될 것 같아요.",
    "{store}는 첫 방문이었는데 메뉴 선택이 어렵지 않았고 양도 무난했습니다. 사람이 몰리는 시간만 피하면 더 편하게 먹을 수 있을 것 같습니다.",
    "{store} 방문했을 때 음식 나오는 속도와 직원 응대가 괜찮았습니다. 맛은 자극적이지 않고 다시 가볼 만한 정도였습니다.",
]

BEAUTY_CONTENTS = [
    "{store} 이용해봤는데 상담이 비교적 자세했고 응대가 친절했습니다. {region} 근처에서 미용 관련 가게 찾는 분들에게 참고가 될 것 같습니다.",
    "{store}는 예약하고 방문하는 편이 좋아 보였습니다. 매장 분위기가 깔끔하고 처음 방문해도 크게 부담스럽지 않았습니다.",
    "{store}에서 서비스를 받아봤는데 설명을 차분하게 해줘서 좋았습니다. 결과는 개인 취향이 있겠지만 저는 무난하게 만족했습니다.",
]

MEDICAL_CONTENTS = [
    "{store}는 대기 시간이 아주 짧지는 않았지만 안내가 비교적 명확했습니다. {region} 근처에서 병원이나 약국 찾는 분들에게 참고가 될 것 같아요.",
    "{store} 이용했을 때 설명이 친절했고 위치도 찾기 쉬웠습니다. 급하게 방문하기 전에 운영 시간을 확인하면 좋겠습니다.",
    "{store}는 직원 응대가 차분했고 처음 방문해도 절차가 어렵지 않았습니다. 대기 인원은 시간대에 따라 다를 것 같습니다.",
]

SHOPPING_CONTENTS = [
    "{store} 둘러봤는데 상품 구성이 생각보다 다양했습니다. {region} 근처에서 가볍게 구경할 곳 찾는 분들에게 괜찮아 보입니다.",
    "{store}는 위치가 나쁘지 않고 매장도 보기 편했습니다. 가격대는 품목마다 차이가 있어서 직접 비교해보는 게 좋겠습니다.",
    "{store} 방문했을 때 직원 응대가 부담스럽지 않아서 편하게 볼 수 있었습니다. 필요한 물건이 있으면 한 번쯤 들러볼 만합니다.",
]

FITNESS_CONTENTS = [
    "{store}는 시설이 깔끔한 편이고 처음 상담받기에도 부담이 적었습니다. {region} 근처 운동 시설 찾는 분들에게 참고가 될 것 같습니다.",
    "{store} 방문했을 때 기구 배치가 복잡하지 않고 설명도 괜찮았습니다. 시간대에 따라 사람이 많을 수 있어 보입니다.",
    "{store}는 접근성이 괜찮아서 꾸준히 다니기 좋은 위치라는 생각이 들었습니다. 등록 전 상담을 받아보는 걸 추천합니다.",
]

GENERAL_CONTENTS = [
    "{store} 이용해봤는데 전반적으로 깔끔하고 직원 응대도 괜찮았습니다. {region} 근처에서 후보를 찾는 분들에게 참고가 될 것 같습니다.",
    "{store}는 처음 방문해도 위치를 찾기 어렵지 않았고 분위기도 무난했습니다. 피크 시간대만 피하면 더 편하게 이용할 수 있어 보입니다.",
    "{store} 다녀와보니 기대보다 괜찮았습니다. 가격대나 세부 서비스는 방문 목적에 따라 다르게 느껴질 수 있을 것 같습니다.",
]

COMMENT_TEMPLATES = [
    "{store}는 직원분 응대가 편안해서 첫 방문이어도 부담이 덜했습니다.",
    "저도 {store} 다녀왔는데 위치가 찾기 쉬운 편이라 좋았습니다.",
    "{store}는 피크 시간대만 피하면 훨씬 여유롭게 이용할 수 있을 것 같아요.",
    "가격대는 사람마다 다르게 느낄 수 있지만 저는 전체적으로 무난했습니다.",
    "{region} 근처에서 비슷한 곳 찾는다면 비교 후보로 넣어볼 만합니다.",
    "설명이 자세한 편이라 처음 가는 사람도 크게 어렵지 않을 것 같습니다.",
    "분위기가 깔끔해서 혼자 가도 크게 어색하지 않았습니다.",
    "주말에는 사람이 많을 수 있으니 미리 확인하고 가는 걸 추천합니다.",
    "재방문 의사는 있습니다. 엄청 특별하진 않아도 안정적인 느낌이었어요.",
    "가까운 곳에 있다면 한 번쯤 가볼 만한 곳이라고 생각합니다.",
]


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.split()).strip()


def short_text(value: str, limit: int) -> str:
    return clean_text(value)[:limit]


def classify_content_templates(category: str) -> list[str]:
    if any(keyword in category for keyword in FOOD_KEYWORDS):
        return FOOD_CONTENTS
    if any(keyword in category for keyword in BEAUTY_KEYWORDS):
        return BEAUTY_CONTENTS
    if any(keyword in category for keyword in MEDICAL_KEYWORDS):
        return MEDICAL_CONTENTS
    if any(keyword in category for keyword in SHOPPING_KEYWORDS):
        return SHOPPING_CONTENTS
    if any(keyword in category for keyword in FITNESS_KEYWORDS):
        return FITNESS_CONTENTS
    return GENERAL_CONTENTS


def get_or_create_seed_users(db) -> list[User]:
    users: list[User] = []

    for email, nickname in SEED_USERS:
        user = db.query(User).filter(User.email == email).first()

        if not user:
            user = User(
                email=email,
                nickname=nickname,
                password_hash="seed-data-only",
                bio="실제 후기 테스트 데이터 생성용 계정입니다.",
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


def build_tags(region: str, store_name: str, category: str) -> list[str]:
    tags = [region, store_name[:20], "실제후기", "재방문", "친절"]

    category_parts = (
        category.replace(">", " ")
        .replace(",", " ")
        .replace("/", " ")
        .split()
    )

    for part in category_parts:
        if len(part) >= 2:
            tags.append(part[:20])

    unique_tags: list[str] = []
    for tag in tags:
        if tag and tag not in unique_tags:
            unique_tags.append(tag)

    return unique_tags[:7]


def attach_tags(db, post_id: int, tag_names: list[str]) -> None:
    for tag_name in tag_names:
        tag = get_or_create_tag(db, tag_name)
        db.execute(post_tags.insert().values(post_id=post_id, tag_id=tag.id))


def get_store_rows(db) -> list[tuple[str, str, str]]:
    rows = (
        db.query(Post.region, Post.store_name, Post.category)
        .filter(
            Post.deleted_at.is_(None),
            Post.store_name.isnot(None),
        )
        .distinct()
        .all()
    )

    return [
        (clean_text(region), clean_text(store_name), clean_text(category))
        for region, store_name, category in rows
        if clean_text(store_name)
    ]


def count_existing_review_posts(db, region: str, store_name: str) -> int:
    return (
        db.query(func.count(Post.id))
        .filter(
            Post.deleted_at.is_(None),
            Post.region == region,
            Post.store_name == store_name,
            Post.title.like(f"{REVIEW_MARKER}%"),
        )
        .scalar()
    )


def create_review_comments(
    db,
    post: Post,
    users: list[User],
    store_name: str,
    region: str,
    base_index: int,
) -> None:
    for offset in range(3):
        author = users[(base_index + offset + 1) % len(users)]
        template = COMMENT_TEMPLATES[(base_index * 3 + offset) % len(COMMENT_TEMPLATES)]
        created_at = post.created_at + timedelta(hours=offset + 1)
        comment = Comment(
            post_id=post.id,
            author_id=author.id,
            content=template.format(store=store_name, region=region),
            is_anonymous=(base_index + offset) % 4 == 0,
            created_at=created_at,
            updated_at=created_at,
        )
        db.add(comment)


def create_review_post(
    db,
    users: list[User],
    region: str,
    store_name: str,
    category: str,
    review_index: int,
    global_index: int,
) -> Post:
    title_template = TITLE_TEMPLATES[review_index % len(TITLE_TEMPLATES)]
    content_templates = classify_content_templates(category)
    content_template = content_templates[review_index % len(content_templates)]
    created_at = datetime.now() - timedelta(
        days=random.randint(0, 45),
        hours=random.randint(0, 23),
        minutes=random.randint(0, 59),
    )
    author = users[global_index % len(users)]

    post = Post(
        author_id=author.id,
        title=short_text(
            title_template.format(marker=REVIEW_MARKER, store=store_name),
            100,
        ),
        content=content_template.format(store=store_name, region=region),
        region=region,
        store_name=short_text(store_name, 100),
        category=short_text(category, 50),
        post_type="review",
        view_count=random.randint(20, 900),
        created_at=created_at,
        updated_at=created_at,
    )
    db.add(post)
    db.flush()

    attach_tags(db, post.id, build_tags(region, store_name, category))
    create_review_comments(db, post, users, store_name, region, global_index)

    return post


def main() -> None:
    random.seed(RANDOM_SEED)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        users = get_or_create_seed_users(db)
        store_rows = get_store_rows(db)
        created_count = 0

        for region, store_name, category in store_rows:
            existing_count = count_existing_review_posts(db, region, store_name)
            missing_count = max(0, REVIEWS_PER_STORE - existing_count)

            for review_index in range(existing_count, existing_count + missing_count):
                create_review_post(
                    db=db,
                    users=users,
                    region=region,
                    store_name=store_name,
                    category=category,
                    review_index=review_index,
                    global_index=created_count,
                )
                created_count += 1

                if created_count % 100 == 0:
                    db.commit()
                    print(f"[seed] 후기 게시글 {created_count}개 추가 완료")

        db.commit()
        print(f"[done] 후기 게시글 {created_count}개 추가 완료")
    finally:
        db.close()


if __name__ == "__main__":
    main()
