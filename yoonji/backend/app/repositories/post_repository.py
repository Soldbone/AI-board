from typing import Literal

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.board import Board
from app.models.enums import BoardCode, PostStatus
from app.models.post import Post
from app.models.post_tag import PostTag

PostSort = Literal["latest", "views"]


def list_public_posts(
    db: Session,
    *,
    board_code: BoardCode | None,
    sort: PostSort,
    page: int,
    size: int,
) -> list[Post]:
    statement = (
        _public_posts_statement(board_code=board_code)
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
    return list(db.scalars(statement).all())


def count_public_posts(
    db: Session,
    *,
    board_code: BoardCode | None,
) -> int:
    statement = (
        select(func.count())
        .select_from(Post)
        .join(Post.board)
        .where(*_public_post_filters(board_code=board_code))
    )
    return int(db.scalar(statement) or 0)


def get_public_post_by_id(db: Session, post_id: int) -> Post | None:
    statement = (
        _public_posts_statement(board_code=None)
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


def increment_view_count(post: Post) -> None:
    post.view_count += 1


def _public_posts_statement(*, board_code: BoardCode | None) -> Select[tuple[Post]]:
    return select(Post).join(Post.board).where(
        *_public_post_filters(board_code=board_code),
    )


def _public_post_filters(*, board_code: BoardCode | None) -> list[object]:
    filters: list[object] = [
        Post.status == PostStatus.PUBLISHED,
        Post.deleted_at.is_(None),
        Board.is_active.is_(True),
    ]

    if board_code is not None:
        filters.append(Board.code == board_code)

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
