from typing import Literal

from datetime import datetime, timezone

from sqlalchemy import Select, and_, case, func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.board import Board
from app.models.enums import BoardCode, PostStatus, PriceRange, TagStatus
from app.models.post import Post
from app.models.post_figure_info import PostFigureInfo
from app.models.post_tag import PostTag
from app.models.tag import Tag

PostSort = Literal["latest", "views", "satisfaction", "comments", "relevance"]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def list_public_posts(
    db: Session,
    *,
    board_code: BoardCode | None,
    normalized_tag: str | None,
    sort: PostSort,
    page: int,
    size: int,
) -> list[Post]:
    statement = (
        _public_posts_statement(board_code=board_code, normalized_tag=normalized_tag)
        .options(
            joinedload(Post.board),
            joinedload(Post.author),
            selectinload(Post.figure_infos),
            selectinload(Post.images),
            selectinload(Post.tag_links).joinedload(PostTag.tag),
        )
        .order_by(*_post_order_by(sort))
        .offset((page - 1) * size)
        .limit(size)
    )

    if normalized_tag is not None:
        statement = statement.distinct()

    return list(db.scalars(statement).all())


def count_public_posts(
    db: Session,
    *,
    board_code: BoardCode | None,
    normalized_tag: str | None,
) -> int:
    statement = select(func.count(Post.id.distinct())).select_from(Post).join(Post.board)

    statement = statement.where(
        *_public_post_filters(board_code=board_code, normalized_tag=normalized_tag)
    )

    return int(db.scalar(statement) or 0)


def list_search_posts(
    db: Session,
    *,
    q: str | None,
    normalized_q: str | None,
    board_code: BoardCode | None,
    normalized_tag: str | None,
    figure_name: str | None,
    manufacturer: str | None,
    price_range: PriceRange | None,
    sort: PostSort,
    page: int,
    size: int,
) -> list[Post]:
    statement = (
        _search_posts_statement(
            q=q,
            normalized_q=normalized_q,
            board_code=board_code,
            normalized_tag=normalized_tag,
            figure_name=figure_name,
            manufacturer=manufacturer,
            price_range=price_range,
        )
        .options(
            joinedload(Post.board),
            joinedload(Post.author),
            selectinload(Post.figure_infos),
            selectinload(Post.images),
            selectinload(Post.tag_links).joinedload(PostTag.tag),
        )
        .order_by(*_post_order_by(sort, q=q, normalized_q=normalized_q))
        .offset((page - 1) * size)
        .limit(size)
    )
    return list(db.scalars(statement).all())


def count_search_posts(
    db: Session,
    *,
    q: str | None,
    normalized_q: str | None,
    board_code: BoardCode | None,
    normalized_tag: str | None,
    figure_name: str | None,
    manufacturer: str | None,
    price_range: PriceRange | None,
) -> int:
    statement = select(func.count()).select_from(
        _search_posts_statement(
            q=q,
            normalized_q=normalized_q,
            board_code=board_code,
            normalized_tag=normalized_tag,
            figure_name=figure_name,
            manufacturer=manufacturer,
            price_range=price_range,
        ).subquery()
    )
    return int(db.scalar(statement) or 0)


def list_public_posts_by_author(
    db: Session,
    *,
    author_id: int,
    page: int,
    size: int,
) -> list[Post]:
    statement = (
        _public_posts_statement(board_code=None, normalized_tag=None)
        .options(
            joinedload(Post.board),
            joinedload(Post.author),
            selectinload(Post.figure_infos),
            selectinload(Post.images),
            selectinload(Post.tag_links).joinedload(PostTag.tag),
        )
        .where(Post.author_id == author_id)
        .order_by(*_post_order_by("latest"))
        .offset((page - 1) * size)
        .limit(size)
    )
    return list(db.scalars(statement).all())


def count_public_posts_by_author(db: Session, *, author_id: int) -> int:
    statement = (
        select(func.count(Post.id))
        .select_from(Post)
        .join(Post.board)
        .where(
            *_public_post_filters(board_code=None, normalized_tag=None),
            Post.author_id == author_id,
        )
    )
    return int(db.scalar(statement) or 0)


def get_public_post_by_id(db: Session, post_id: int) -> Post | None:
    statement = (
        _public_posts_statement(board_code=None, normalized_tag=None)
        .options(
            joinedload(Post.board),
            joinedload(Post.author),
            selectinload(Post.figure_infos),
            selectinload(Post.images),
            selectinload(Post.tag_links).joinedload(PostTag.tag),
        )
        .where(Post.id == post_id)
    )
    return db.scalar(statement)


def get_active_board_by_code(db: Session, code: BoardCode) -> Board | None:
    statement = select(Board).where(
        Board.code == code,
        Board.is_active.is_(True),
    )
    return db.scalar(statement)


def create_post(
    db: Session,
    *,
    board: Board,
    author_id: int,
    title: str,
    content: str,
    status: PostStatus,
) -> Post:
    now = utc_now()
    post = Post(
        board_id=board.id,
        author_id=author_id,
        title=title,
        content=content,
        status=status,
        published_at=now if status == PostStatus.PUBLISHED else None,
    )
    db.add(post)
    db.flush()
    return post


def get_post_for_write_action(db: Session, post_id: int) -> Post | None:
    statement = (
        select(Post)
        .options(
            joinedload(Post.board),
            joinedload(Post.author),
            selectinload(Post.figure_infos),
            selectinload(Post.images),
            selectinload(Post.tag_links).joinedload(PostTag.tag),
        )
        .where(
            Post.id == post_id,
            Post.status != PostStatus.DELETED,
            Post.deleted_at.is_(None),
        )
    )
    return db.scalar(statement)


def create_figure_info(
    db: Session,
    *,
    post: Post,
    values: dict,
) -> PostFigureInfo:
    figure_info = PostFigureInfo(post_id=post.id, **values)
    db.add(figure_info)
    db.flush()
    return figure_info


def update_figure_info(figure_info: PostFigureInfo, *, values: dict) -> PostFigureInfo:
    for field_name, value in values.items():
        setattr(figure_info, field_name, value)

    return figure_info


def delete_figure_infos(db: Session, *, post: Post) -> None:
    for figure_info in list(post.figure_infos):
        db.delete(figure_info)


def soft_delete_post(post: Post) -> None:
    post.status = PostStatus.DELETED
    post.deleted_at = utc_now()


def increment_view_count(post: Post) -> None:
    post.view_count += 1


def _search_posts_statement(
    *,
    q: str | None,
    normalized_q: str | None,
    board_code: BoardCode | None,
    normalized_tag: str | None,
    figure_name: str | None,
    manufacturer: str | None,
    price_range: PriceRange | None,
) -> Select[tuple[Post]]:
    return select(Post).join(Post.board).where(
        *_public_post_filters(board_code=board_code, normalized_tag=normalized_tag),
        *_search_post_filters(
            q=q,
            normalized_q=normalized_q,
            figure_name=figure_name,
            manufacturer=manufacturer,
            price_range=price_range,
        ),
    )


def _public_posts_statement(
    *,
    board_code: BoardCode | None,
    normalized_tag: str | None,
) -> Select[tuple[Post]]:
    statement = select(Post).join(Post.board)

    return statement.where(
        *_public_post_filters(board_code=board_code, normalized_tag=normalized_tag),
    )


def _public_post_filters(
    *,
    board_code: BoardCode | None,
    normalized_tag: str | None,
) -> list[object]:
    filters: list[object] = [
        Post.status == PostStatus.PUBLISHED,
        Post.deleted_at.is_(None),
        Board.is_active.is_(True),
    ]

    if board_code is not None:
        filters.append(Board.code == board_code)

    if normalized_tag is not None:
        filters.append(
            Post.tag_links.any(
                PostTag.tag.has(
                    and_(
                        Tag.normalized_name == normalized_tag,
                        Tag.status == TagStatus.ACTIVE,
                    )
                )
            )
        )

    return filters


def _search_post_filters(
    *,
    q: str | None,
    normalized_q: str | None,
    figure_name: str | None,
    manufacturer: str | None,
    price_range: PriceRange | None,
) -> list[object]:
    filters: list[object] = []

    if q:
        pattern = _contains_pattern(q)
        tag_conditions = [Tag.name.ilike(pattern)]

        if normalized_q:
            tag_conditions.append(Tag.normalized_name.contains(normalized_q))

        filters.append(
            or_(
                Post.title.ilike(pattern),
                Post.content.ilike(pattern),
                Post.figure_infos.any(
                    or_(
                        PostFigureInfo.figure_name_text.ilike(pattern),
                        PostFigureInfo.manufacturer_text.ilike(pattern),
                    )
                ),
                Post.tag_links.any(
                    PostTag.tag.has(
                        and_(
                            Tag.status == TagStatus.ACTIVE,
                            or_(*tag_conditions),
                        )
                    )
                ),
            )
        )

    if figure_name:
        filters.append(
            Post.figure_infos.any(
                PostFigureInfo.figure_name_text.ilike(_contains_pattern(figure_name))
            )
        )

    if manufacturer:
        filters.append(
            Post.figure_infos.any(
                PostFigureInfo.manufacturer_text.ilike(_contains_pattern(manufacturer))
            )
        )

    if price_range is not None:
        filters.append(Post.figure_infos.any(PostFigureInfo.price_range == price_range))

    return filters


def _post_order_by(
    sort: PostSort,
    *,
    q: str | None = None,
    normalized_q: str | None = None,
) -> list[object]:
    if sort == "views":
        return [
            Post.view_count.desc(),
            Post.published_at.desc(),
            Post.created_at.desc(),
            Post.id.desc(),
        ]

    if sort == "satisfaction":
        satisfaction_score = (
            select(func.max(PostFigureInfo.satisfaction_score))
            .where(PostFigureInfo.post_id == Post.id)
            .scalar_subquery()
        )
        return [
            satisfaction_score.desc().nullslast(),
            Post.published_at.desc(),
            Post.created_at.desc(),
            Post.id.desc(),
        ]

    if sort == "comments":
        return [
            Post.comment_count.desc(),
            Post.published_at.desc(),
            Post.created_at.desc(),
            Post.id.desc(),
        ]

    if sort == "relevance" and q:
        return _relevance_order_by(q=q, normalized_q=normalized_q)

    return [
        Post.published_at.desc(),
        Post.created_at.desc(),
        Post.id.desc(),
    ]


def _relevance_order_by(*, q: str, normalized_q: str | None) -> list[object]:
    pattern = _contains_pattern(q)
    tag_conditions = [Tag.name.ilike(pattern)]

    if normalized_q:
        tag_conditions.append(Tag.normalized_name.contains(normalized_q))

    figure_match = Post.figure_infos.any(
        or_(
            PostFigureInfo.figure_name_text.ilike(pattern),
            PostFigureInfo.manufacturer_text.ilike(pattern),
        )
    )
    tag_match = Post.tag_links.any(
        PostTag.tag.has(
            and_(
                Tag.status == TagStatus.ACTIVE,
                or_(*tag_conditions),
            )
        )
    )

    return [
        case((Post.title.ilike(pattern), 1), else_=0).desc(),
        case((Post.content.ilike(pattern), 1), else_=0).desc(),
        case((figure_match, 1), else_=0).desc(),
        case((tag_match, 1), else_=0).desc(),
        Post.published_at.desc(),
        Post.created_at.desc(),
        Post.id.desc(),
    ]


def _contains_pattern(value: str) -> str:
    return f"%{value}%"
