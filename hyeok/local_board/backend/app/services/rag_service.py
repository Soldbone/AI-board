import re

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.comment import Comment
from app.models.post import Post
from app.models.tag import Tag, post_tags


DEFAULT_SIMILAR_POST_LIMIT = 5
MAX_SIMILAR_POST_LIMIT = 5
SEARCH_CANDIDATE_LIMIT = 100
MIN_KEYWORD_LENGTH = 2
NOUN_TAGS = {"NNG", "NNP", "SL", "SN"}

try:
    from kiwipiepy import Kiwi
except ImportError:
    Kiwi = None

_kiwi = Kiwi() if Kiwi is not None else None

STOPWORDS = {
    "그리고",
    "궁금",
    "궁금해요",
    "근처",
    "너무",
    "대해",
    "또는",
    "리뷰",
    "있는",
    "있나요",
    "어때요",
    "좀",
    "좋은",
    "추천",
    "추천해주세요",
    "하고",
    "합니다",
    "후기",
    "해주세요",
    "실제",
    "실제로",
    "이용",
    "이용해본",
    "이용해보신",
    "이용해봤",
    "이용한",
    "이용했던",
    "방문",
    "방문해본",
    "방문한",
    "가본",
    "가보신",
    "가보신분",
    "분들",
    "분들의",
    "분",
    "분이",
    "분은",
    "분께",
    "사람",
    "사람들",
    "가격",
    "가격대",
    "비용",
    "대기",
    "대기시간",
    "시간",
    "얼마",
    "정도",
    "혹시",
    "여기",
    "저기",
    "어디",
    "어떤",
    "어때",
    "어떤가요",
    "궁금합니다",
    "알려주세요",
    "있을까요",
    "있으면",
    "없는",
    "많이",
    "진짜",
    "괜찮은",
    "괜찮나요",
    "추천좀",
    "기준",
    "만족도",
    "무난",
    "기본",
    "정말",
    "먼저",
    "후보",
    "정보",
    "확인",
    "지도",
    "링크",
    "위치",
    "접근성",
    "분위기",
    "직원",
    "응대",
    "친절",
    "처음",
    "피크",
    "주말",
    "평일",
    "방문전",
    "방문전에",
    "가려는데",
    "찾습니다",
    "찾다가",
    "보고",
    "보입니다",
    "같아요",
    "좋아요",
}

STOPWORD_SUFFIXES = (
    "에서",
    "에게",
    "으로",
    "까지",
    "부터",
    "처럼",
    "보다",
    "은",
    "는",
    "이",
    "가",
    "을",
    "를",
    "의",
    "에",
    "도",
    "만",
    "로",
    "와",
    "과",
)

FIELD_WEIGHTS = {
    "title": 4,
    "store_name": 4,
    "tag": 3,
    "category": 2,
    "region": 2,
    "content": 1,
    "comment": 1,
}

FIELD_LABELS = {
    "title": "제목",
    "store_name": "가게명",
    "tag": "태그",
    "category": "분류",
    "region": "동네",
    "content": "본문",
    "comment": "댓글",
}


def normalize_keyword(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def compact_keyword(value: str) -> str:
    return re.sub(r"\s+", "", normalize_keyword(value))


def is_valid_keyword(value: str) -> bool:
    return len(value) >= MIN_KEYWORD_LENGTH and not is_stopword(value)


def is_stopword(value: str) -> bool:
    if value in STOPWORDS:
        return True

    for suffix in STOPWORD_SUFFIXES:
        if len(value) > len(suffix) + 1 and value.endswith(suffix):
            base_word = value.removesuffix(suffix)
            if base_word in STOPWORDS:
                return True

    return False


def append_keyword(keywords: list[str], value: str) -> None:
    cleaned_value = normalize_keyword(value)

    if is_valid_keyword(cleaned_value) and cleaned_value not in keywords:
        keywords.append(cleaned_value)


def extract_regex_keywords(value: str) -> list[str]:
    return re.findall(r"[0-9a-zA-Z가-힣]+", value.lower())


def extract_noun_keywords(value: str) -> list[str]:
    if _kiwi is None:
        return extract_regex_keywords(value)

    keywords: list[str] = []

    for token in _kiwi.tokenize(value.lower()):
        if token.tag not in NOUN_TAGS:
            continue
        append_keyword(keywords, token.form)

    return keywords


def extract_tag_keywords(tag_names: list[str] | None) -> list[str]:
    keywords: list[str] = []

    for tag_name in tag_names or []:
        cleaned_tag = normalize_keyword(tag_name)

        if not re.search(r"[>/,|]+", cleaned_tag):
            append_keyword(keywords, cleaned_tag)

        tag_parts = re.split(r"[\s>/,|]+", cleaned_tag)
        for tag_part in tag_parts:
            append_keyword(keywords, tag_part)

        for noun_keyword in extract_noun_keywords(cleaned_tag):
            append_keyword(keywords, noun_keyword)

    return keywords


def extract_keywords(
    title: str,
    content: str,
    store_name: str | None = None,
    tag_names: list[str] | None = None,
    limit: int = 20,
) -> list[str]:
    raw_text = f"{title} {content} {store_name or ''}"
    keywords: list[str] = []

    for keyword in extract_noun_keywords(raw_text):
        append_keyword(keywords, keyword)

    if store_name:
        append_keyword(keywords, store_name)

    for keyword in extract_tag_keywords(tag_names):
        append_keyword(keywords, keyword)

    return keywords[:limit]


def contains_store_name(
    store_name: str | None,
    post: Post,
    tag_names: list[str],
    comment_text: str,
) -> bool:
    if not store_name:
        return True

    normalized_store_name = normalize_keyword(store_name)
    compact_store_name = compact_keyword(store_name)

    if len(compact_store_name) < MIN_KEYWORD_LENGTH:
        return True

    searchable_text = build_searchable_text(post, tag_names, comment_text)
    compact_searchable_text = compact_keyword(searchable_text)

    return (
        normalized_store_name in searchable_text
        or compact_store_name in compact_searchable_text
    )


def calculate_match_detail(
    post: Post,
    tag_names: list[str],
    comment_text: str,
    matched_keywords: list[str],
) -> dict:
    score = 0
    matched_fields: list[str] = []
    fields = {
        "title": post.title.lower(),
        "store_name": (post.store_name or "").lower(),
        "tag": " ".join(tag_names).lower(),
        "category": (post.category or "").lower(),
        "region": (post.region or "").lower(),
        "content": post.content.lower(),
        "comment": comment_text.lower(),
    }

    for keyword in matched_keywords:
        for field_name, field_text in fields.items():
            if field_text and keyword in field_text:
                score += FIELD_WEIGHTS[field_name]

                field_label = FIELD_LABELS[field_name]
                if field_label not in matched_fields:
                    matched_fields.append(field_label)

    return {
        "score": score,
        "matched_fields": matched_fields,
    }


def get_post_tag_names(db: Session, post_id: int) -> list[str]:
    tag_rows = (
        db.query(Tag.name)
        .join(post_tags, Tag.id == post_tags.c.tag_id)
        .filter(post_tags.c.post_id == post_id)
        .all()
    )

    return [tag_name for (tag_name,) in tag_rows]


def get_post_comment_text(db: Session, post_id: int) -> str:
    comment_rows = (
        db.query(Comment.content)
        .filter(
            Comment.post_id == post_id,
            Comment.deleted_at.is_(None),
        )
        .limit(10)
        .all()
    )

    return " ".join(comment for (comment,) in comment_rows)


def build_searchable_text(post: Post, tag_names: list[str], comment_text: str) -> str:
    return (
        f"{post.title} {post.content} {post.region or ''} "
        f"{post.store_name or ''} {post.category or ''} "
        f"{' '.join(tag_names)} {comment_text}"
    ).lower()


def find_similar_posts(
    db: Session,
    title: str,
    content: str,
    tag_names: list[str],
    store_name: str | None = None,
    limit: int = DEFAULT_SIMILAR_POST_LIMIT,
    exclude_post_id: int | None = None,
):
    keywords = extract_keywords(title, content, store_name, tag_names)

    if not keywords:
        return []

    query = db.query(Post).filter(Post.deleted_at.is_(None))

    if exclude_post_id is not None:
        query = query.filter(Post.id != exclude_post_id)

    if store_name:
        store_name_pattern = f"%{store_name.strip()}%"
        query = query.filter(
            or_(
                Post.store_name.ilike(store_name_pattern),
                Post.title.ilike(store_name_pattern),
                Post.content.ilike(store_name_pattern),
            )
        )

    posts = (
        query
        .order_by(Post.created_at.desc())
        .limit(SEARCH_CANDIDATE_LIMIT)
        .all()
    )

    results = []

    for post in posts:
        post_tag_names = get_post_tag_names(db, post.id)
        comment_text = get_post_comment_text(db, post.id)
        if not contains_store_name(store_name, post, post_tag_names, comment_text):
            continue

        searchable_text = build_searchable_text(post, post_tag_names, comment_text)

        matched_keywords = [
            keyword for keyword in keywords
            if keyword in searchable_text
        ]

        if not matched_keywords:
            continue

        match_detail = calculate_match_detail(
            post=post,
            tag_names=post_tag_names,
            comment_text=comment_text,
            matched_keywords=matched_keywords,
        )

        results.append(
            {
                "id": post.id,
                "title": post.title,
                "content_preview": post.content[:80],
                "region": post.region,
                "store_name": post.store_name,
                "category": post.category,
                "score": match_detail["score"],
                "matched_keywords": matched_keywords,
                "matched_fields": match_detail["matched_fields"],
                "created_at": post.created_at,
            }
        )

    return rank_similar_posts(results, limit)


def rank_similar_posts(results: list[dict], limit: int = DEFAULT_SIMILAR_POST_LIMIT):
    normalized_limit = max(1, min(limit, MAX_SIMILAR_POST_LIMIT))

    ranked_results = sorted(
        results,
        key=lambda item: (item["score"], item["created_at"]),
        reverse=True,
    )

    return ranked_results[:normalized_limit]


def suggest_tags(
    db: Session,
    title: str,
    content: str,
    limit: int = 5,
):
    keywords = extract_keywords(title, content)

    if not keywords:
        return []

    posts = (
        db.query(Post)
        .filter(Post.deleted_at.is_(None))
        .order_by(Post.created_at.desc())
        .limit(100)
        .all()
    )

    tag_scores: dict[str, int] = {}

    for post in posts:
        post_tag_names = get_post_tag_names(db, post.id)
        comment_text = get_post_comment_text(db, post.id)
        searchable_text = build_searchable_text(post, post_tag_names, comment_text)

        matched_keywords = [
            keyword for keyword in keywords
            if keyword in searchable_text
        ]

        if not matched_keywords:
            continue

        match_detail = calculate_match_detail(
            post=post,
            tag_names=post_tag_names,
            comment_text=comment_text,
            matched_keywords=matched_keywords,
        )

        for tag_name in post_tag_names:
            tag_scores[tag_name] = tag_scores.get(tag_name, 0) + match_detail["score"]

    results = [
        {"name": tag_name, "score": score}
        for tag_name, score in tag_scores.items()
    ]
    results.sort(key=lambda item: item["score"], reverse=True)

    return results[:limit]
