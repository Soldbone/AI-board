from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.models.comment import Comment
from backend.app.models.post import Post, PostMedia, PostTag, Tag
from backend.app.models.user import User
from backend.app.schemas.common import PageResponse
from backend.app.schemas.posts import (
    CommentCreateRequest,
    CommentRead,
    CommentUpdateRequest,
    PostCreateRequest,
    PostListItem,
    PostMediaRead,
    PostRead,
    PostUpdateRequest,
    TagRead,
)
from backend.app.schemas.users import UserSummary
from backend.app.services import rag as rag_service

ALLOWED_BOARD_TYPES = {"idea", "review"}
REVIEW_MEDIA_FIELDS = {
    "source_url": "game_url",
    "video_url": "video_url",
    "image_url": "image_url",
}


def list_posts(
    db: Session,
    board_type: str | None,
    search: str | None,
    page: int,
    page_size: int,
) -> PageResponse[PostListItem]:
    """게시판별 목록을 검색어와 페이지 조건에 맞게 조회한다."""
    filters = build_post_filters(board_type, search)
    total = db.execute(select(func.count()).select_from(Post).where(*filters)).scalar_one()
    posts = db.execute(
        select(Post)
        .where(*filters)
        .options(
            selectinload(Post.author),
            selectinload(Post.comments).selectinload(Comment.author),
            selectinload(Post.tag_links).selectinload(PostTag.tag),
            selectinload(Post.media_items),
        )
        .order_by(Post.created_at.desc(), Post.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).scalars().all()

    return PageResponse(
        items=[build_post_list_item(post) for post in posts],
        page=page,
        page_size=page_size,
        total=total,
    )


def create_post(db: Session, user: User, payload: PostCreateRequest) -> PostRead:
    """로그인한 사용자가 작성한 게시글과 태그/미디어 연결을 함께 저장한다."""
    post = Post(
        user_id=user.id,
        board_type=normalize_board_type(payload.board_type),
        title=clean_required_text(payload.title, "title_required"),
        content=clean_required_text(payload.content, "content_required"),
        genre=clean_optional_text(payload.genre),
        core_fun=clean_optional_text(payload.core_fun),
        platform=clean_optional_text(payload.platform),
        difficulty=clean_optional_text(payload.difficulty),
        source_url=clean_optional_text(payload.source_url),
    )
    db.add(post)
    db.flush()
    post_id = post.id

    sync_post_tags(db, post, payload.tags)
    sync_review_media_from_payload(db, post, payload)
    db.commit()

    return get_post_detail(db, post_id)


def get_post_detail(db: Session, post_id: int) -> PostRead:
    """삭제되지 않은 게시글 한 건을 상세 화면 응답으로 만든다."""
    post = get_post_or_404(db, post_id)
    return build_post_detail(post)


def update_post(db: Session, post_id: int, user: User, payload: PostUpdateRequest) -> PostRead:
    """게시글 작성자만 제목, 본문, 태그, 미디어 정보를 수정하게 한다."""
    post = get_post_or_404(db, post_id)
    ensure_owner(post.user_id, user.id)

    update_fields = payload.model_fields_set
    if "title" in update_fields:
        post.title = clean_required_text(payload.title, "title_required")
    if "content" in update_fields:
        post.content = clean_required_text(payload.content, "content_required")
    if "genre" in update_fields:
        post.genre = clean_optional_text(payload.genre)
    if "core_fun" in update_fields:
        post.core_fun = clean_optional_text(payload.core_fun)
    if "platform" in update_fields:
        post.platform = clean_optional_text(payload.platform)
    if "difficulty" in update_fields:
        post.difficulty = clean_optional_text(payload.difficulty)
    if "source_url" in update_fields:
        post.source_url = clean_optional_text(payload.source_url)
    if "tags" in update_fields:
        sync_post_tags(db, post, payload.tags or [])

    sync_review_media_from_payload(db, post, payload)
    saved_post_id = post.id
    rag_service.delete_post_embedding(db, saved_post_id)
    db.commit()

    return get_post_detail(db, saved_post_id)


def delete_post(db: Session, post_id: int, user: User) -> None:
    """게시글 작성자만 게시글을 목록과 상세에서 보이지 않게 삭제 처리한다."""
    post = get_post_or_404(db, post_id)
    ensure_owner(post.user_id, user.id)
    post.deleted_at = datetime.now(timezone.utc)
    db.commit()


def create_comment(db: Session, post_id: int, user: User, payload: CommentCreateRequest) -> CommentRead:
    """게시글 종류에 맞는 댓글 또는 리뷰 별점 댓글을 저장한다."""
    post = get_post_or_404(db, post_id)
    validate_comment_fields(post.board_type, payload)
    comment = Comment(
        post_id=post.id,
        user_id=user.id,
        content=clean_required_text(payload.content, "comment_required"),
        rating=payload.rating,
        good_point=clean_optional_text(payload.good_point),
        bad_point=clean_optional_text(payload.bad_point),
        suggestion=clean_optional_text(payload.suggestion),
    )
    db.add(comment)
    db.commit()

    return get_comment_read(db, comment.id)


def update_comment(db: Session, comment_id: int, user: User, payload: CommentUpdateRequest) -> CommentRead:
    """댓글 작성자만 댓글 본문과 리뷰 필드를 수정하게 한다."""
    comment = get_comment_or_404(db, comment_id)
    ensure_owner(comment.user_id, user.id)

    next_values = CommentCreateRequest(
        content=payload.content if "content" in payload.model_fields_set else comment.content,
        rating=payload.rating if "rating" in payload.model_fields_set else comment.rating,
        good_point=payload.good_point if "good_point" in payload.model_fields_set else comment.good_point,
        bad_point=payload.bad_point if "bad_point" in payload.model_fields_set else comment.bad_point,
        suggestion=payload.suggestion if "suggestion" in payload.model_fields_set else comment.suggestion,
    )
    validate_comment_fields(comment.post.board_type, next_values)

    if "content" in payload.model_fields_set:
        comment.content = clean_required_text(payload.content, "comment_required")
    if "rating" in payload.model_fields_set:
        comment.rating = payload.rating
    if "good_point" in payload.model_fields_set:
        comment.good_point = clean_optional_text(payload.good_point)
    if "bad_point" in payload.model_fields_set:
        comment.bad_point = clean_optional_text(payload.bad_point)
    if "suggestion" in payload.model_fields_set:
        comment.suggestion = clean_optional_text(payload.suggestion)

    db.commit()
    return get_comment_read(db, comment.id)


def delete_comment(db: Session, comment_id: int, user: User) -> None:
    """댓글 작성자만 댓글을 상세 화면에서 보이지 않게 삭제 처리한다."""
    comment = get_comment_or_404(db, comment_id)
    ensure_owner(comment.user_id, user.id)
    comment.deleted_at = datetime.now(timezone.utc)
    db.commit()


def list_tags(db: Session, search: str | None = None) -> list[TagRead]:
    """태그 입력 자동완성이나 태그 목록 화면에서 쓸 태그 목록을 반환한다."""
    query = select(Tag).order_by(Tag.name.asc())
    cleaned_search = clean_optional_text(search)
    if cleaned_search:
        query = query.where(Tag.name.ilike(f"%{cleaned_search}%"))

    tags = db.execute(query.limit(100)).scalars().all()
    return [TagRead.model_validate(tag) for tag in tags]


def create_tag(db: Session, name: str) -> TagRead:
    """태그 이름을 정리한 뒤 이미 있으면 재사용하고 없으면 새로 만든다."""
    tag = get_or_create_tag(db, name)
    db.commit()
    db.refresh(tag)
    return TagRead.model_validate(tag)


def build_post_filters(board_type: str | None, search: str | None) -> list[object]:
    """목록 API의 board_type과 검색어 조건을 SQLAlchemy where 조건으로 바꾼다."""
    filters: list[object] = [Post.deleted_at.is_(None)]
    if board_type is not None:
        filters.append(Post.board_type == normalize_board_type(board_type))

    cleaned_search = clean_optional_text(search)
    if cleaned_search:
        pattern = f"%{cleaned_search}%"
        filters.append(
            or_(
                Post.title.ilike(pattern),
                Post.content.ilike(pattern),
                Post.genre.ilike(pattern),
                Post.core_fun.ilike(pattern),
                Post.platform.ilike(pattern),
                Post.source_url.ilike(pattern),
                Post.tag_links.any(PostTag.tag.has(Tag.name.ilike(pattern))),
            )
        )

    return filters


def get_post_or_404(db: Session, post_id: int) -> Post:
    """상세/수정/삭제에서 공통으로 쓰는 게시글 조회와 404 처리다."""
    post = db.execute(
        select(Post)
        .where(Post.id == post_id, Post.deleted_at.is_(None))
        .options(
            selectinload(Post.author),
            selectinload(Post.comments).selectinload(Comment.author),
            selectinload(Post.tag_links).selectinload(PostTag.tag),
            selectinload(Post.media_items),
        )
    ).scalar_one_or_none()
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="post_not_found")

    return post


def get_comment_or_404(db: Session, comment_id: int) -> Comment:
    """댓글 수정/삭제에서 공통으로 쓰는 댓글 조회와 404 처리다."""
    comment = db.execute(
        select(Comment)
        .where(Comment.id == comment_id, Comment.deleted_at.is_(None))
        .options(
            selectinload(Comment.author),
            selectinload(Comment.post),
        )
    ).scalar_one_or_none()
    if comment is None or comment.post.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="comment_not_found")

    return comment


def get_comment_read(db: Session, comment_id: int) -> CommentRead:
    """저장 직후의 댓글을 작성자 정보와 함께 다시 읽어 응답 스키마로 만든다."""
    comment = get_comment_or_404(db, comment_id)
    return build_comment_read(comment)


def sync_post_tags(db: Session, post: Post, tag_names: list[str]) -> None:
    """게시글의 기존 태그 연결을 새 태그 이름 목록으로 교체한다."""
    for tag_link in list(post.tag_links):
        db.delete(tag_link)
    db.flush()

    for tag_name in clean_tag_names(tag_names):
        tag = get_or_create_tag(db, tag_name)
        db.add(PostTag(post_id=post.id, tag_id=tag.id))


def get_or_create_tag(db: Session, name: str) -> Tag:
    """중복 태그를 만들지 않도록 정리된 이름으로 태그를 찾거나 생성한다."""
    cleaned_name = clean_tag_name(name)
    if not cleaned_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="tag_name_required")

    tag = db.execute(select(Tag).where(Tag.name == cleaned_name)).scalar_one_or_none()
    if tag is not None:
        return tag

    tag = Tag(name=cleaned_name)
    db.add(tag)
    db.flush()
    return tag


def sync_review_media_from_payload(
    db: Session,
    post: Post,
    payload: PostCreateRequest | PostUpdateRequest,
) -> None:
    """리뷰 게시글의 게임/영상/이미지 URL을 post_media에 반영한다."""
    if post.board_type != "review":
        return

    update_fields = payload.model_fields_set
    for field_name, media_type in REVIEW_MEDIA_FIELDS.items():
        if field_name not in update_fields:
            continue

        for media in list(post.media_items):
            if media.media_type == media_type:
                db.delete(media)

        url = clean_optional_text(getattr(payload, field_name))
        if url:
            db.add(
                PostMedia(
                    post_id=post.id,
                    media_type=media_type,
                    url=url,
                    thumbnail_url=url if media_type == "image_url" else None,
                )
            )


def validate_comment_fields(board_type: str, payload: CommentCreateRequest) -> None:
    """게시판 종류에 따라 댓글 필드 사용 규칙을 확인한다."""
    if board_type == "idea":
        has_review_field = any(
            [
                payload.rating is not None,
                clean_optional_text(payload.good_point) is not None,
                clean_optional_text(payload.bad_point) is not None,
                clean_optional_text(payload.suggestion) is not None,
            ]
        )
        if has_review_field:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="idea_comment_review_fields_not_allowed")
        return

    if payload.rating is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="review_comment_rating_required")


def build_post_detail(post: Post) -> PostRead:
    """게시글 ORM 객체를 상세 응답 스키마로 변환한다."""
    list_item = build_post_list_item(post)
    comments = [
        build_comment_read(comment)
        for comment in sorted(active_comments(post), key=lambda item: (item.created_at, item.id))
    ]
    media = [
        PostMediaRead.model_validate(media_item)
        for media_item in sorted(post.media_items, key=lambda item: (item.created_at, item.id))
    ]
    return PostRead(
        **list_item.model_dump(),
        content=post.content,
        media=media,
        comments=comments,
    )


def build_post_list_item(post: Post) -> PostListItem:
    """게시글 ORM 객체를 목록 응답 스키마로 변환한다."""
    comments = active_comments(post)
    rating_values = [comment.rating for comment in comments if comment.rating is not None]
    average_rating = None
    if rating_values:
        average_rating = round(sum(rating_values) / len(rating_values), 2)

    return PostListItem(
        id=post.id,
        board_type=post.board_type,
        title=post.title,
        genre=post.genre,
        core_fun=post.core_fun,
        platform=post.platform,
        difficulty=post.difficulty,
        source_url=post.source_url,
        author=UserSummary.model_validate(post.author),
        tags=[tag_link.tag.name for tag_link in sorted(post.tag_links, key=lambda item: item.tag.name)],
        comment_count=len(comments),
        average_rating=average_rating,
        review_count=len(rating_values),
        created_at=post.created_at,
        updated_at=post.updated_at,
    )


def build_comment_read(comment: Comment) -> CommentRead:
    """댓글 ORM 객체를 응답 스키마로 변환한다."""
    return CommentRead(
        id=comment.id,
        post_id=comment.post_id,
        content=comment.content,
        rating=comment.rating,
        good_point=comment.good_point,
        bad_point=comment.bad_point,
        suggestion=comment.suggestion,
        author=UserSummary.model_validate(comment.author),
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


def active_comments(post: Post) -> list[Comment]:
    """soft delete 되지 않은 댓글만 화면 응답 계산에 사용한다."""
    return [comment for comment in post.comments if comment.deleted_at is None]


def ensure_owner(owner_id: int, user_id: int) -> None:
    """작성자 전용 수정/삭제 API의 권한을 확인한다."""
    if owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="owner_only")


def normalize_board_type(board_type: str) -> str:
    """게시판 종류 값을 DB 제약조건과 같은 값으로 정리한다."""
    normalized_board_type = board_type.strip().lower()
    if normalized_board_type not in ALLOWED_BOARD_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_board_type")

    return normalized_board_type


def clean_required_text(value: str | None, error_detail: str) -> str:
    """필수 문자열 입력에서 앞뒤 공백을 제거하고 빈 값은 에러로 막는다."""
    cleaned_value = clean_optional_text(value)
    if cleaned_value is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_detail)

    return cleaned_value


def clean_optional_text(value: str | None) -> str | None:
    """선택 문자열 입력은 공백만 있으면 None으로 통일한다."""
    if value is None:
        return None

    cleaned_value = value.strip()
    return cleaned_value or None


def clean_tag_names(tag_names: list[str]) -> list[str]:
    """태그 이름을 정리하고 같은 요청 안의 중복을 제거한다."""
    cleaned_names: list[str] = []
    seen_names: set[str] = set()
    for tag_name in tag_names:
        cleaned_name = clean_tag_name(tag_name)
        if not cleaned_name or cleaned_name in seen_names:
            continue

        cleaned_names.append(cleaned_name)
        seen_names.add(cleaned_name)

    return cleaned_names


def clean_tag_name(name: str) -> str:
    """태그 이름 비교가 흔들리지 않게 소문자와 앞뒤 공백 제거를 적용한다."""
    return name.strip().lower()[:50]
