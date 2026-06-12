from typing import Literal

from datetime import datetime, timezone

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.board import Board
from app.models.enums import BoardCode, PostStatus, TagStatus
from app.models.post import Post
from app.models.post_figure_info import PostFigureInfo
from app.models.post_tag import PostTag
from app.models.tag import Tag

PostSort = Literal["latest", "views"]


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

    if normalized_tag is not None:
        statement = statement.join(Post.tag_links).join(PostTag.tag)

    statement = statement.where(
        *_public_post_filters(board_code=board_code, normalized_tag=normalized_tag)
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


def _public_posts_statement(
    *,
    board_code: BoardCode | None,
    normalized_tag: str | None,
) -> Select[tuple[Post]]:
    statement = select(Post).join(Post.board)

    if normalized_tag is not None:
        statement = statement.join(Post.tag_links).join(PostTag.tag)

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
        filters.extend(
            [
                Tag.normalized_name == normalized_tag,
                Tag.status == TagStatus.ACTIVE,
            ]
        )

    return filters


def _post_order_by(sort: PostSort) -> list[object]:
    if sort == "views":
        return [
            Post.view_count.desc(),
            Post.published_at.desc(),
            Post.created_at.desc(),
            Post.id.desc(),
        ]

    return [
        Post.published_at.desc(),
        Post.created_at.desc(),
        Post.id.desc(),
    ]
