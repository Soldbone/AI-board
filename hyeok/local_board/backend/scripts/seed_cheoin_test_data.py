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


TARGET_POST_COUNT = 1000
SEED_EMAIL = "cheoin-seed@example.com"
SEED_NICKNAME = "처인구테스터"
SEED_MARKER = "[처인구 테스트]"
RANDOM_SEED = 20260612


AREAS = [
    "처인구 김량장동",
    "처인구 역북동",
    "처인구 삼가동",
    "처인구 고림동",
    "처인구 유방동",
    "처인구 마평동",
    "처인구 포곡읍",
    "처인구 모현읍",
    "처인구 이동읍",
    "처인구 남사읍",
    "처인구 양지면",
    "처인구 원삼면",
    "처인구 백암면",
]

CATEGORY_STORE_NAMES = {
    "한식": ["처인밥상", "역북한상", "김량장국밥", "고림정식", "마평손맛"],
    "중국집": ["진샤이", "처인반점", "역북각", "삼가루", "용인짬뽕"],
    "분식": ["처인떡볶이", "김량장분식", "역북김밥", "마평라볶이", "고림분식"],
    "고기집": ["처인화로", "삼가갈비", "역북삼겹", "포곡숯불", "양지정육식당"],
    "카페": ["처인커피", "역북로스터스", "김량장라떼", "삼가브루", "양지카페"],
    "베이커리": ["처인베이커리", "역북빵집", "고림식빵", "양지브레드", "마평제과"],
    "미용실": ["처인헤어", "역북살롱", "고림헤어샵", "마평미장원", "양지헤어"],
    "네일샵": ["처인네일", "역북네일", "삼가네일룸", "고림네일", "양지네일"],
    "옷가게": ["처인옷장", "역북클로젯", "김량장편집샵", "삼가웨어", "고림스타일"],
    "헬스장": ["처인피트니스", "역북짐", "고림헬스", "마평PT", "양지운동관"],
    "치과": ["처인치과", "역북바른치과", "김량장스마일치과", "삼가치과", "양지치과"],
    "약국": ["처인약국", "역북온누리약국", "김량장약국", "고림약국", "양지약국"],
}

POST_TEMPLATES = [
    "{store} 가보신 분 후기 궁금해요.",
    "{store} 가격대랑 대기 시간 어떤가요?",
    "{area}에서 {category} 찾다가 {store} 봤는데 괜찮나요?",
    "{store} 처음 가보려는데 추천 메뉴나 서비스 알려주세요.",
    "{area} 주민분들 {store} 실제 이용 후기 부탁드려요.",
]

COMMENT_TEMPLATES = [
    "저는 평일 저녁에 갔는데 생각보다 괜찮았어요.",
    "가격은 보통이고 직원 응대는 친절한 편이었습니다.",
    "주말에는 사람이 많아서 예약이나 전화 확인을 추천해요.",
    "처인구 근처에서는 재방문할 만한 곳이라고 느꼈습니다.",
    "메뉴나 서비스가 매장마다 차이가 있어서 방문 시간도 적어주면 좋아요.",
    "가성비를 중요하게 보면 만족도가 괜찮을 것 같아요.",
]

COMMON_TAGS = [
    "처인구",
    "용인",
    "후기",
    "추천",
    "가성비",
    "주차",
    "예약",
    "점심",
    "저녁",
    "혼밥",
    "가족",
    "데이트",
]


def get_or_create_seed_user(db) -> User:
    user = db.query(User).filter(User.email == SEED_EMAIL).first()

    if user:
        return user

    user = User(
        email=SEED_EMAIL,
        nickname=SEED_NICKNAME,
        password_hash="seed-data-only",
        bio="처인구 테스트 데이터 생성용 계정입니다.",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return user


def get_or_create_tag(db, name: str) -> Tag:
    tag = db.query(Tag).filter(Tag.name == name).first()

    if tag:
        return tag

    tag = Tag(name=name)
    db.add(tag)
    db.commit()
    db.refresh(tag)

    return tag


def attach_tags(db, post_id: int, tag_names: list[str]) -> None:
    unique_tag_names = []

    for tag_name in tag_names:
        cleaned_name = tag_name.strip()
        if cleaned_name and cleaned_name not in unique_tag_names:
            unique_tag_names.append(cleaned_name)

    for tag_name in unique_tag_names:
        tag = get_or_create_tag(db, tag_name)
        exists = (
            db.query(post_tags)
            .filter(
                post_tags.c.post_id == post_id,
                post_tags.c.tag_id == tag.id,
            )
            .first()
        )

        if not exists:
            db.execute(
                post_tags.insert().values(
                    post_id=post_id,
                    tag_id=tag.id,
                )
            )


def build_post_payload(index: int) -> dict:
    area = random.choice(AREAS)
    category = random.choice(list(CATEGORY_STORE_NAMES.keys()))
    base_store = random.choice(CATEGORY_STORE_NAMES[category])
    store = f"{base_store} {index % 17 + 1}호점"
    title_template = random.choice(POST_TEMPLATES)
    title = f"{SEED_MARKER} {title_template.format(area=area, category=category, store=store)}"
    content = (
        f"{area}에서 {category} 관련 정보를 찾고 있습니다. "
        f"{store}를 실제로 이용해본 분들의 가격, 대기 시간, 주차, 친절도 후기가 궁금합니다. "
        f"처인구 주민 입장에서 추천할 만한지 댓글로 알려주세요."
    )
    tag_names = [
        "처인구",
        area.replace("처인구 ", ""),
        category,
        store.split()[0],
        random.choice(COMMON_TAGS),
    ]

    return {
        "title": title[:100],
        "content": content,
        "region": area,
        "store_name": store,
        "category": category,
        "tag_names": tag_names,
        "view_count": random.randint(0, 700),
        "created_at": datetime.now() - timedelta(days=random.randint(0, 90)),
    }


def create_comments(db, post: Post, author_id: int) -> None:
    comment_count = random.randint(2, 5)

    for _ in range(comment_count):
        comment = Comment(
            post_id=post.id,
            author_id=author_id,
            content=random.choice(COMMENT_TEMPLATES),
            is_anonymous=random.choice([False, False, True]),
            created_at=post.created_at + timedelta(hours=random.randint(1, 72)),
        )
        db.add(comment)


def seed() -> None:
    random.seed(RANDOM_SEED)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        user = get_or_create_seed_user(db)
        existing_count = (
            db.query(func.count(Post.id))
            .filter(
                Post.author_id == user.id,
                Post.title.like(f"{SEED_MARKER}%"),
                Post.deleted_at.is_(None),
            )
            .scalar()
        )
        missing_count = max(0, TARGET_POST_COUNT - existing_count)

        if missing_count == 0:
            print(f"이미 {TARGET_POST_COUNT}개 이상의 처인구 테스트 게시글이 있습니다.")
            return

        for index in range(existing_count + 1, TARGET_POST_COUNT + 1):
            payload = build_post_payload(index)
            post = Post(
                author_id=user.id,
                title=payload["title"],
                content=payload["content"],
                region=payload["region"],
                store_name=payload["store_name"],
                category=payload["category"],
                view_count=payload["view_count"],
                created_at=payload["created_at"],
                updated_at=payload["created_at"],
            )
            db.add(post)
            db.commit()
            db.refresh(post)

            attach_tags(db, post.id, payload["tag_names"])
            create_comments(db, post, user.id)

            if index % 100 == 0:
                db.commit()
                print(f"{index}개까지 생성 완료")

        db.commit()
        print(f"처인구 테스트 게시글 {missing_count}개 추가 완료")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
