from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
import sys
from urllib.parse import urlparse


ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.security import hash_password
from app.db.database import SessionLocal
from app.db.init_db import init_db
from app.models.board import Board
from app.models.enums import (
    BoardCode,
    FigureTargetType,
    FigureType,
    ImageStatus,
    PostSourceType,
    PostStatus,
    TagStatus,
    TagType,
    UserRole,
    UserStatus,
)
from app.models.post import Post
from app.models.post_figure_info import PostFigureInfo
from app.models.post_image import PostImage
from app.models.post_tag import PostTag
from app.models.tag import Tag
from app.models.user import User
from app.utils.normalizer import normalize_tag_name
from app.utils.price_range import amount_to_price_range


SEED_USER = {
    "email": "amiami_reviewer@example.com",
    "login_id": "amiami_reviewer",
    "password": "reviewpass1234!",
    "nickname": "AmiAmi 리뷰어",
}


REVIEW_POSTS = [
    {
        "product_code": "FIGURE-201560",
        "image_url": "https://img.amiami.com/images/product/main/262/FIGURE-201560.jpg",
        "image_size": 93926,
        "title": "[귀멸의칼날] figma 하시비라 이노스케 액션 피규어 리뷰",
        "content": (
            "멧돼지 탈, 맨얼굴 파츠, 톱니처럼 거친 두 자루의 일륜도가 한 번에 들어간 "
            "이노스케 figma입니다. 근육 조형은 과장되기보다 액션 피규어답게 관절 가동을 "
            "살리는 쪽이고, 허리의 털 표현과 바지 주름이 사진보다 실물이 더 입체적으로 보입니다.\n\n"
            "제조사는 Max Factory이고 일본 정가 8,000엔 기준이라 국내 체감가는 대략 8~10만원대입니다. "
            "칼을 크게 벌린 짐승의 호흡 포즈가 잘 잡히지만, 상체가 노출된 디자인이라 어깨 관절선은 "
            "가까이서 보면 조금 보입니다. 그래도 귀멸 액션 라인으로는 만족도가 높습니다."
        ),
        "figure_name": "figma 하시비라 이노스케",
        "manufacturer": "Max Factory",
        "figure_type": FigureType.ACTION_FIGURE,
        "price_amount": "80000",
        "purchase_date": date(2026, 5, 30),
        "satisfaction_score": 5,
        "tags": [
            ("귀멸의칼날", TagType.WORK),
            ("이노스케", TagType.CHARACTER),
        ],
    },
    {
        "product_code": "FIGURE-190811",
        "image_url": "https://img.amiami.com/images/product/main/253/FIGURE-190811.jpg",
        "image_size": 70999,
        "title": "[귀멸의칼날] figma 아카자 액션 피규어 리뷰",
        "content": (
            "상현의 삼 아카자를 figma로 낸 제품입니다. 푸른 문양과 붉은 머리, 하얀 바지의 대비가 "
            "강해서 진열장 안에서도 시선이 바로 갑니다. 파괴살 나침 플레이트가 포함되어 있어서 "
            "단순 스탠딩보다 전투 장면을 만들 때 훨씬 설득력이 생깁니다.\n\n"
            "제조사는 FREEing이고 정가는 11,000엔입니다. 국내 체감가는 11~14만원대라 일반 figma보다 "
            "조금 높은 편이지만, 표정 파츠와 전용 이펙트 베이스를 생각하면 납득 가능한 구성입니다. "
            "무릎을 굽힌 자세가 잘 살아서 렌고쿠와 함께 두면 특히 좋습니다."
        ),
        "figure_name": "figma 아카자",
        "manufacturer": "FREEing",
        "figure_type": FigureType.ACTION_FIGURE,
        "price_amount": "110000",
        "purchase_date": date(2026, 5, 26),
        "satisfaction_score": 4,
        "tags": [
            ("귀멸의칼날", TagType.WORK),
            ("아카자", TagType.CHARACTER),
        ],
    },
    {
        "product_code": "FIGURE-200275",
        "image_url": "https://img.amiami.com/images/product/main/262/FIGURE-200275.jpg",
        "image_size": 86333,
        "title": "[귀멸의칼날] G.E.M. 손바닥 기유 피규어 리뷰",
        "content": (
            "메가하우스 G.E.M. 시리즈의 손바닥 기유입니다. 정좌 자세라 움직임은 없지만, 기유 특유의 "
            "무표정한 분위기와 반반 하오리 패턴이 깔끔하게 살아 있습니다. 크기는 작아도 앉은 자세의 "
            "균형이 좋아서 책상 위에 두기 편합니다.\n\n"
            "제조사는 MegaHouse이고 정가는 6,930엔입니다. 국내 체감가는 6~8만원대입니다. 큰 스케일 "
            "피규어처럼 화려한 맛은 없지만, 귀멸 캐릭터를 부담 없는 크기로 모으고 싶다면 만족도가 "
            "높은 라인입니다."
        ),
        "figure_name": "G.E.M. 시리즈 귀멸의 칼날 손바닥 기유",
        "manufacturer": "MegaHouse",
        "figure_type": FigureType.OTHER,
        "price_amount": "69000",
        "purchase_date": date(2026, 5, 20),
        "satisfaction_score": 4,
        "tags": [
            ("귀멸의칼날", TagType.WORK),
            ("기유", TagType.CHARACTER),
        ],
    },
    {
        "product_code": "FIGURE-200313",
        "image_url": "https://img.amiami.com/images/product/main/262/FIGURE-200313.jpg",
        "image_size": 67861,
        "title": "[귀멸의칼날] 룩업 카마도 네즈코 피규어 리뷰",
        "content": (
            "메가하우스 룩업 시리즈의 네즈코입니다. 고개를 올려다보는 비율이라 모니터 아래나 책상 "
            "앞쪽에 두면 눈이 잘 마주칩니다. 대나무 재갈, 분홍 기모노, 작은 보따리까지 네즈코의 "
            "상징적인 요소가 아주 귀엽게 축약되어 있습니다.\n\n"
            "제조사는 MegaHouse이고 정가는 3,278엔 기준입니다. 국내 체감가는 3~5만원대라 입문용으로 "
            "좋습니다. 조형이 데포르메라 정교함보다 분위기와 귀여움에 초점이 맞춰진 제품입니다."
        ),
        "figure_name": "룩업 귀멸의 칼날 카마도 네즈코",
        "manufacturer": "MegaHouse",
        "figure_type": FigureType.OTHER,
        "price_amount": "33000",
        "purchase_date": date(2026, 5, 14),
        "satisfaction_score": 5,
        "tags": [
            ("귀멸의칼날", TagType.WORK),
            ("네즈코", TagType.CHARACTER),
        ],
    },
    {
        "product_code": "FIGURE-132437",
        "image_url": "https://img.amiami.com/images/product/main/214/FIGURE-132437.jpg",
        "image_size": 66165,
        "title": "[귀멸의칼날] Precious G.E.M. 카마도 남매 세트 리뷰",
        "content": (
            "탄지로와 네즈코를 한 베이스에 배치한 메가하우스 Precious G.E.M. 카마도 남매 세트입니다. "
            "탄지로는 상자를 멘 자세, 네즈코는 낮게 몸을 낮춘 전투 자세라 두 캐릭터의 관계와 긴장감이 "
            "한 장면 안에 잘 들어옵니다. 검은 원형 베이스의 문양도 작품 분위기와 잘 맞습니다.\n\n"
            "제조사는 MegaHouse이고 고가 라인의 세트 상품이라 국내 체감가는 20만원대 중후반 이상으로 "
            "잡는 편이 맞습니다. 공간은 조금 필요하지만, 귀멸의 칼날 리뷰 데이터에서 대표 이미지로 "
            "쓰기 좋은 존재감 있는 제품입니다."
        ),
        "figure_name": "Precious G.E.M. 시리즈 귀멸의 칼날 카마도 남매 세트",
        "manufacturer": "MegaHouse",
        "figure_type": FigureType.SCALE,
        "price_amount": "264000",
        "purchase_date": date(2026, 5, 8),
        "satisfaction_score": 5,
        "tags": [
            ("귀멸의칼날", TagType.WORK),
            ("탄지로", TagType.CHARACTER),
            ("네즈코", TagType.CHARACTER),
        ],
    },
    {
        "product_code": "FIGURE-193889",
        "image_url": "https://img.amiami.com/images/product/main/254/FIGURE-193889.jpg",
        "image_size": 56274,
        "title": "[원피스] 룩업 돈키호테 도플라밍고 피규어 리뷰",
        "content": (
            "도플라밍고를 룩업 특유의 앉은 데포르메로 만든 제품입니다. 선글라스와 씩 웃는 표정, "
            "분홍 깃털 코트가 작은 크기 안에서도 확실히 살아 있습니다. 악역 캐릭터인데도 룩업 비율로 "
            "바뀌니 책상 위에서 부담 없이 보기 좋습니다.\n\n"
            "제조사는 MegaHouse이고 정가는 4,620엔급 룩업 라인입니다. 국내 체감가는 4~6만원대입니다. "
            "보아 핸콕 룩업과 같이 두면 원피스 진열 구역이 더 풍성해집니다."
        ),
        "figure_name": "룩업 원피스 돈키호테 도플라밍고",
        "manufacturer": "MegaHouse",
        "figure_type": FigureType.OTHER,
        "price_amount": "46000",
        "purchase_date": date(2026, 5, 2),
        "satisfaction_score": 4,
        "tags": [
            ("원피스", TagType.WORK),
            ("도플라밍고", TagType.CHARACTER),
        ],
    },
    {
        "product_code": "FIGURE-183244",
        "image_url": "https://img.amiami.com/images/product/main/251/FIGURE-183244.jpg",
        "image_size": 70236,
        "title": "[원피스] S.H.Figuarts 에그헤드 쵸파 리뷰",
        "content": (
            "에그헤드 의상의 토니토니 쵸파 S.H.Figuarts입니다. SSG가 적힌 파란 슈트와 헬멧, 고글이 "
            "강한 포인트라 기존 쵸파 피규어와 분위기가 확실히 다릅니다. 작은 크기지만 표정 파츠가 "
            "있어 울상이나 놀란 얼굴을 바꿔 끼우는 재미가 있습니다.\n\n"
            "제조사는 BANDAI SPIRITS이고 정가는 4,400엔입니다. 국내 체감가는 4~5만원대입니다. 루피 "
            "에그헤드 라인과 같이 두면 스케일감이 맞아서 활용도가 높습니다."
        ),
        "figure_name": "S.H.Figuarts 토니토니 쵸파 -Future Island Egghead-",
        "manufacturer": "BANDAI SPIRITS",
        "figure_type": FigureType.ACTION_FIGURE,
        "price_amount": "44000",
        "purchase_date": date(2026, 4, 28),
        "satisfaction_score": 5,
        "tags": [
            ("원피스", TagType.WORK),
            ("쵸파", TagType.CHARACTER),
        ],
    },
    {
        "product_code": "FIGURE-151311",
        "image_url": "https://img.amiami.com/images/product/main/231/FIGURE-151311.jpg",
        "image_size": 67974,
        "title": "[원피스] S.H.Figuarts 루피 ROMANCE DAWN 리뷰",
        "content": (
            "초기 의상의 몽키 D. 루피를 S.H.Figuarts로 만든 제품입니다. 밀짚모자, 빨간 조끼, 노란 반바지 "
            "조합이라 가장 기본적인 루피 이미지가 잘 살아 있고, 하이킥이나 전투 자세도 자연스럽게 잡힙니다. "
            "표정 파츠와 고기 파츠 덕분에 장난스러운 장면 연출도 쉽습니다.\n\n"
            "제조사는 BANDAI SPIRITS이고 정가는 4,400엔입니다. 국내 체감가는 4~5만원대입니다. 가격 대비 "
            "가동과 구성품이 좋아 원피스 액션 피규어 입문용으로 추천하기 좋습니다."
        ),
        "figure_name": "S.H.Figuarts 몽키 D. 루피 -ROMANCE DAWN-",
        "manufacturer": "BANDAI SPIRITS",
        "figure_type": FigureType.ACTION_FIGURE,
        "price_amount": "44000",
        "purchase_date": date(2026, 4, 22),
        "satisfaction_score": 5,
        "tags": [
            ("원피스", TagType.WORK),
            ("루피", TagType.CHARACTER),
        ],
    },
    {
        "product_code": "FIG-IPN-3190",
        "image_url": "https://img.amiami.com/images/product/main/121/FIG-IPN-3190.jpg",
        "image_size": 97898,
        "title": "[원피스] P.O.P 스모커 더 화이트 헌터 리뷰",
        "content": (
            "메가하우스 P.O.P 라인의 스모커 피규어입니다. 어깨에 짊어진 십수, 입에 문 시가, 흰 코트의 "
            "녹색 퍼가 스모커의 이미지를 바로 보여줍니다. 오래된 조형 계열이라 최신 P.O.P처럼 세밀한 "
            "명암은 아니지만, 캐릭터의 체격과 거친 분위기는 충분히 좋습니다.\n\n"
            "제조사는 MegaHouse입니다. 구판 P.O.P라 정가보다 현 시세 편차가 커서 국내 체감가는 보통 "
            "8~12만원대로 잡았습니다. 원피스 해군 캐릭터를 모으는 사람에게는 여전히 매력적인 제품입니다."
        ),
        "figure_name": "Portrait.Of.Pirates 원피스 스모커 더 화이트 헌터",
        "manufacturer": "MegaHouse",
        "figure_type": FigureType.SCALE,
        "price_amount": "90000",
        "purchase_date": date(2026, 4, 16),
        "satisfaction_score": 4,
        "tags": [
            ("원피스", TagType.WORK),
            ("스모커", TagType.CHARACTER),
        ],
    },
    {
        "product_code": "FIGURE-153977",
        "image_url": "https://img.amiami.com/images/product/main/232/FIGURE-153977.jpg",
        "image_size": 91850,
        "title": "[원피스] P.O.P Playback Memories 빨간 머리 샹크스 리뷰",
        "content": (
            "P.O.P Playback Memories 라인의 빨간 머리 샹크스입니다. 박스 전면에서도 검을 들어 올린 "
            "포즈와 망토의 흐름이 잘 보이고, 마린포드에서 아카이누의 공격을 막는 장면을 떠올리게 합니다. "
            "샹크스 특유의 여유와 위압감이 모두 살아 있는 조형입니다.\n\n"
            "제조사는 MegaHouse이고 정가는 22,000엔입니다. 국내 체감가는 20만원대 초중반 이상입니다. "
            "원피스 P.O.P 라인 중에서도 존재감이 강해서 단독 진열해도 충분히 화면을 채웁니다."
        ),
        "figure_name": "Portrait.Of.Pirates 원피스 Playback Memories 빨간 머리 샹크스",
        "manufacturer": "MegaHouse",
        "figure_type": FigureType.SCALE,
        "price_amount": "220000",
        "purchase_date": date(2026, 4, 10),
        "satisfaction_score": 5,
        "tags": [
            ("원피스", TagType.WORK),
            ("샹크스", TagType.CHARACTER),
        ],
    },
    {
        "product_code": "FIGURE-178558",
        "image_url": "https://img.amiami.com/images/product/main/251/FIGURE-178558.jpg",
        "image_size": 85032,
        "title": "[네즈코] 애니플렉스 1/8 카마도 네즈코 리뷰",
        "content": (
            "도공 마을 편 마지막 장면의 분위기를 담은 애니플렉스 1/8 네즈코입니다. 햇빛 아래로 걸어 나오는 "
            "듯한 표정이 부드럽고, 긴 머리 끝의 주황 그라데이션과 해진 하오리 표현이 섬세합니다. 잔디 베이스가 "
            "작지만 장면성을 잘 잡아줍니다.\n\n"
            "제조사는 Aniplex이고 미국 Aniplex Online 기준 가격은 185.99달러입니다. 국내 체감가는 "
            "20만원대 중후반으로 잡는 편이 자연스럽습니다. 귀여움보다 장면 재현과 감정선이 강한 네즈코 "
            "스케일 피규어입니다."
        ),
        "figure_name": "Demon Slayer: Kimetsu no Yaiba Nezuko Kamado 1/8 Scale Figure",
        "manufacturer": "Aniplex",
        "figure_type": FigureType.SCALE,
        "price_amount": "250000",
        "purchase_date": date(2026, 4, 4),
        "satisfaction_score": 5,
        "tags": [
            ("귀멸의칼날", TagType.WORK),
            ("네즈코", TagType.CHARACTER),
        ],
    },
    {
        "product_code": "FIGURE-120752",
        "image_url": "https://img.amiami.com/images/product/main/204/FIGURE-120752.jpg",
        "image_size": 55613,
        "title": "[네즈코] 이치방쿠지 앉은 자세 네즈코 피규어 리뷰",
        "content": (
            "나무 상자와 함께 앉은 자세를 잡은 네즈코 프라이즈 계열 피규어입니다. 한쪽 무릎을 올린 포즈라 "
            "작은 사이즈에도 캐릭터성이 잘 보이고, 상자 소품이 포함되어 단독으로 놓아도 허전하지 않습니다. "
            "블리스터 사진 기준으로는 머리카락과 하오리의 흐름이 생각보다 안정적입니다.\n\n"
            "제조사는 BANDAI SPIRITS 계열 이치방쿠지 상품으로 보고, 국내 체감가는 3~5만원대 프라이즈 "
            "가격대로 잡았습니다. 고급 스케일은 아니지만 네즈코 태그 테스트용으로는 사진과 정보가 분명해서 "
            "쓰기 좋습니다."
        ),
        "figure_name": "이치방쿠지 귀멸의 칼날 앉은 자세 카마도 네즈코 피규어",
        "manufacturer": "BANDAI SPIRITS",
        "figure_type": FigureType.PRIZE,
        "price_amount": "40000",
        "purchase_date": date(2026, 3, 29),
        "satisfaction_score": 4,
        "tags": [
            ("귀멸의칼날", TagType.WORK),
            ("네즈코", TagType.CHARACTER),
        ],
    },
    {
        "product_code": "FIGURE-052215",
        "image_url": "https://img.amiami.com/images/product/main/193/FIGURE-052215.jpg",
        "image_size": 86004,
        "title": "[네즈코] 넨도로이드 카마도 네즈코 1194 리뷰",
        "content": (
            "Good Smile Company 넨도로이드 1194번 카마도 네즈코입니다. 기본 얼굴, 혈귀화 표정, 작은 "
            "나무 상자 파츠가 들어 있어 평상시 모습과 전투 직전 느낌을 모두 만들 수 있습니다. 대나무 재갈과 "
            "머리카락 끝의 주황색 그라데이션이 작은 크기에서도 또렷합니다.\n\n"
            "제조사는 Good Smile Company이고 넨도로이드 라인답게 국내 체감가는 5~7만원대입니다. 파츠가 "
            "작아 분실만 조심하면, 네즈코 단독 태그 검색과 캐릭터별 리뷰 테스트에 가장 쓰기 좋은 제품입니다."
        ),
        "figure_name": "넨도로이드 카마도 네즈코 1194",
        "manufacturer": "Good Smile Company",
        "figure_type": FigureType.NENDOROID,
        "price_amount": "55000",
        "purchase_date": date(2026, 3, 23),
        "satisfaction_score": 5,
        "tags": [
            ("귀멸의칼날", TagType.WORK),
            ("네즈코", TagType.CHARACTER),
        ],
    },
]


def seed_amiami_review_posts() -> list[dict[str, str | int]]:
    init_db()
    db = SessionLocal()

    try:
        board = _get_review_board(db)
        user = _upsert_seed_user(db)
        tags = _upsert_tags(db)
        now = datetime.now(timezone.utc)
        post_summaries: list[dict[str, str | int]] = []

        for index, post_seed in enumerate(REVIEW_POSTS):
            post = _upsert_review_post(
                db,
                board=board,
                user=user,
                tags=tags,
                post_seed=post_seed,
                published_at=now - timedelta(days=len(REVIEW_POSTS) - index),
            )
            post_summaries.append({"id": post.id, "title": post.title})

        _refresh_tag_usage_counts(db)
        db.commit()
        return post_summaries
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _get_review_board(db) -> Board:
    board = db.query(Board).filter(Board.code == BoardCode.REVIEW).one_or_none()

    if board is None:
        raise RuntimeError("REVIEW 게시판이 없습니다. scripts/seed_boards.py를 먼저 실행해주세요.")

    return board


def _upsert_seed_user(db) -> User:
    user = db.query(User).filter(User.login_id == SEED_USER["login_id"]).one_or_none()

    if user is None:
        user = User(
            email=SEED_USER["email"],
            login_id=SEED_USER["login_id"],
            password_hash=hash_password(SEED_USER["password"]),
            nickname=SEED_USER["nickname"],
            role=UserRole.USER,
            status=UserStatus.ACTIVE,
        )
        db.add(user)
        db.flush()
        return user

    user.email = SEED_USER["email"]
    user.nickname = SEED_USER["nickname"]
    user.role = UserRole.USER
    user.status = UserStatus.ACTIVE
    return user


def _upsert_tags(db) -> dict[tuple[str, TagType], Tag]:
    tags: dict[tuple[str, TagType], Tag] = {}
    tag_specs = {
        (tag_name, tag_type)
        for post_seed in REVIEW_POSTS
        for tag_name, tag_type in post_seed["tags"]
    }

    for tag_name, tag_type in sorted(tag_specs, key=lambda item: (item[1].value, item[0])):
        normalized_name = normalize_tag_name(tag_name)
        tag = (
            db.query(Tag)
            .filter(
                Tag.normalized_name == normalized_name,
                Tag.tag_type == tag_type,
            )
            .one_or_none()
        )

        if tag is None:
            tag = Tag(
                name=tag_name,
                normalized_name=normalized_name,
                tag_type=tag_type,
                usage_count=0,
                status=TagStatus.ACTIVE,
            )
            db.add(tag)
            db.flush()
        else:
            tag.name = tag_name
            tag.status = TagStatus.ACTIVE

        tags[(normalized_name, tag_type)] = tag

    return tags


def _upsert_review_post(
    db,
    *,
    board: Board,
    user: User,
    tags: dict[tuple[str, TagType], Tag],
    post_seed: dict,
    published_at: datetime,
) -> Post:
    post = _find_existing_post(db, user=user, post_seed=post_seed)

    if post is None:
        post = Post(
            board_id=board.id,
            author_id=user.id,
            title=post_seed["title"],
            content=post_seed["content"],
            source_type=PostSourceType.USER,
            status=PostStatus.PUBLISHED,
            view_count=0,
            comment_count=0,
            published_at=published_at,
            deleted_at=None,
        )
        db.add(post)
        db.flush()
    else:
        _clear_post_review_children(db, post)
        post.board_id = board.id
        post.author_id = user.id
        post.title = post_seed["title"]
        post.content = post_seed["content"]
        post.source_type = PostSourceType.USER
        post.status = PostStatus.PUBLISHED
        post.comment_count = 0
        post.published_at = post.published_at or published_at
        post.deleted_at = None

    _add_figure_info(db, post=post, post_seed=post_seed)
    _add_tags(db, post=post, tags=tags, post_seed=post_seed)
    _add_image(db, post=post, user=user, post_seed=post_seed)
    db.flush()
    return post


def _find_existing_post(db, *, user: User, post_seed: dict) -> Post | None:
    post = (
        db.query(Post)
        .filter(Post.author_id == user.id, Post.title == post_seed["title"])
        .one_or_none()
    )

    if post is not None:
        return post

    return (
        db.query(Post)
        .join(PostImage, PostImage.post_id == Post.id)
        .filter(PostImage.file_url == post_seed["image_url"])
        .first()
    )


def _clear_post_review_children(db, post: Post) -> None:
    db.query(PostImage).filter(PostImage.post_id == post.id).delete(
        synchronize_session=False
    )
    db.query(PostTag).filter(PostTag.post_id == post.id).delete(
        synchronize_session=False
    )
    db.query(PostFigureInfo).filter(PostFigureInfo.post_id == post.id).delete(
        synchronize_session=False
    )
    db.flush()


def _add_figure_info(db, *, post: Post, post_seed: dict) -> None:
    price_amount = Decimal(post_seed["price_amount"])
    db.add(
        PostFigureInfo(
            post_id=post.id,
            target_type=FigureTargetType.REVIEW_TARGET,
            figure_name_text=post_seed["figure_name"],
            manufacturer_text=post_seed["manufacturer"],
            figure_type=post_seed["figure_type"],
            price_amount=price_amount,
            price_range=amount_to_price_range(price_amount),
            purchase_date=post_seed["purchase_date"],
            satisfaction_score=post_seed["satisfaction_score"],
        )
    )


def _add_tags(
    db,
    *,
    post: Post,
    tags: dict[tuple[str, TagType], Tag],
    post_seed: dict,
) -> None:
    seen_tag_ids: set[int] = set()

    for tag_name, tag_type in post_seed["tags"]:
        normalized_name = normalize_tag_name(tag_name)
        tag = tags[(normalized_name, tag_type)]

        if tag.id in seen_tag_ids:
            continue

        db.add(PostTag(post_id=post.id, tag_id=tag.id))
        seen_tag_ids.add(tag.id)


def _add_image(db, *, post: Post, user: User, post_seed: dict) -> None:
    original_name = Path(urlparse(post_seed["image_url"]).path).name
    db.add(
        PostImage(
            post_id=post.id,
            uploader_id=user.id,
            file_url=post_seed["image_url"],
            thumbnail_url=post_seed["image_url"],
            original_name=original_name,
            mime_type="image/jpeg",
            size_bytes=post_seed["image_size"],
            width=600,
            height=600,
            sort_order=0,
            status=ImageStatus.ATTACHED,
        )
    )


def _refresh_tag_usage_counts(db) -> None:
    for tag in db.query(Tag).all():
        tag.usage_count = (
            db.query(PostTag)
            .join(Post)
            .filter(
                PostTag.tag_id == tag.id,
                Post.status == PostStatus.PUBLISHED,
                Post.deleted_at.is_(None),
            )
            .count()
        )


if __name__ == "__main__":
    seeded_post_summaries = seed_amiami_review_posts()
    print("Seeded AmiAmi review posts.")
    print(f"Login ID: {SEED_USER['login_id']}")
    print(f"Password: {SEED_USER['password']}")

    for seeded_post in seeded_post_summaries:
        print(f"- id={seeded_post['id']} {seeded_post['title']}")
