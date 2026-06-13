from sqlalchemy import func, or_
from datetime import datetime
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.comment import Comment
from app.models.post import Post
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.post import PostCreate, PostListItem, PostListResponse, PostRead, PostUpdate
from app.models.tag import Tag, post_tags
from app.services.embedding_service import embed_post_by_id

router = APIRouter(prefix="/posts", tags=["posts"])


def normalize_tag_names(tag_names: list[str]) -> list[str]:
    normalized_names = []

    for tag_name in tag_names:
        cleaned_name = tag_name.strip()

        if cleaned_name and cleaned_name not in normalized_names:
            normalized_names.append(cleaned_name)

    return normalized_names


def get_post_tag_names(db: Session, post_id: int) -> list[str]:
    tag_rows = (
        db.query(Tag.name)
        .join(post_tags, Tag.id == post_tags.c.tag_id)
        .filter(post_tags.c.post_id == post_id)
        .order_by(Tag.name.asc())
        .all()
    )

    return [tag_name for (tag_name,) in tag_rows]


@router.post("", response_model=PostRead, status_code=status.HTTP_201_CREATED)
def create_post(
    post_data: PostCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    new_post = Post(
        author_id=current_user.id,
        title=post_data.title,
        content=post_data.content,
        region=post_data.region,
        store_name=post_data.store_name,
        category=post_data.category,
    )

    db.add(new_post)
    db.commit()
    db.refresh(new_post)

    normalized_tag_names = normalize_tag_names(post_data.tag_names)

    for tag_name in normalized_tag_names:
        tag = db.query(Tag).filter(Tag.name == tag_name).first()

        if not tag:
            tag = Tag(name=tag_name)
            db.add(tag)
            db.commit()
            db.refresh(tag)

        db.execute(
            post_tags.insert().values(
                post_id=new_post.id,
                tag_id=tag.id,
            )
        )

    db.commit()
    background_tasks.add_task(embed_post_by_id, new_post.id)

    return {
        "id": new_post.id,
        "author_id": new_post.author_id,
        "title": new_post.title,
        "content": new_post.content,
        "region": new_post.region,
        "store_name": new_post.store_name,
        "category": new_post.category,
        "view_count": new_post.view_count,
        "comment_count": 0,
        "tag_names": normalized_tag_names,
        "created_at": new_post.created_at,
        "updated_at": new_post.updated_at,
    }

@router.get("", response_model=PostListResponse)
def read_posts(
    keyword: str | None = None,
    tag: str | None = None,
    sort: str = "latest",
    page: int = 1,
    size: int = 10,
    db: Session = Depends(get_db),
):
    allowed_sorts = {"latest", "views", "comments"}

    if sort not in allowed_sorts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="sort는 latest, views, comments 중 하나여야 합니다.",
        )

    query = db.query(Post).filter(Post.deleted_at.is_(None))

    if keyword and keyword.strip():
        search_keyword = f"%{keyword.strip()}%"

        query = query.filter(
            or_(
                Post.title.ilike(search_keyword),
                Post.content.ilike(search_keyword),
                Post.id.in_(
                    db.query(post_tags.c.post_id)
                    .join(Tag, Tag.id == post_tags.c.tag_id)
                    .filter(Tag.name.ilike(search_keyword))
                ),
            )
        )
    
    if tag and tag.strip():
        tag_name = tag.strip()

        query = query.filter(
            Post.id.in_(
                db.query(post_tags.c.post_id)
                .join(Tag, Tag.id == post_tags.c.tag_id)
                .filter(Tag.name == tag_name)
            )
        )

    if page < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="page는 1 이상이어야 합니다.",
        )

    if size < 1 or size > 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="size는 1 이상 50 이하이어야 합니다.",
        )

    total_count = query.count()
    total_pages = (total_count + size - 1) // size
    offset = (page - 1) * size

    comment_counts = (
        db.query(
            Comment.post_id.label("post_id"),
            func.count(Comment.id).label("comment_count"),
        )
        .filter(Comment.deleted_at.is_(None))
        .group_by(Comment.post_id)
        .subquery()
    )

    list_query = (
        query.outerjoin(comment_counts, Post.id == comment_counts.c.post_id)
        .add_columns(func.coalesce(comment_counts.c.comment_count, 0).label("comment_count"))
    )

    if sort == "views":
        list_query = list_query.order_by(Post.view_count.desc(), Post.created_at.desc())
    elif sort == "comments":
        list_query = list_query.order_by(
            func.coalesce(comment_counts.c.comment_count, 0).desc(),
            Post.created_at.desc(),
        )
    else:
        list_query = list_query.order_by(Post.created_at.desc())

    post_rows = (
        list_query
        .offset(offset)
        .limit(size)
        .all()
    )

    posts = [
        {
            "id": post.id,
            "author_id": post.author_id,
            "title": post.title,
            "region": post.region,
            "store_name": post.store_name,
            "category": post.category,
            "view_count": post.view_count,
            "comment_count": comment_count,
            "created_at": post.created_at,
        }
        for post, comment_count in post_rows
    ]

    return {
        "items": posts,
        "total_count": total_count,
        "page": page,
        "size": size,
        "total_pages": total_pages,
    }


@router.get("/{post_id}", response_model=PostRead)
def read_post(post_id: int, db: Session = Depends(get_db)):
    post = (
        db.query(Post)
        .filter(Post.id == post_id, Post.deleted_at.is_(None))
        .first()
    )

    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="게시글을 찾을 수 없습니다.",
        )

    post.view_count += 1
    db.commit()
    db.refresh(post)

    comment_count = (
        db.query(func.count(Comment.id))
        .filter(Comment.post_id == post.id, Comment.deleted_at.is_(None))
        .scalar()
    )
    tag_names = get_post_tag_names(db, post.id)

    return {
        "id": post.id,
        "author_id": post.author_id,
        "title": post.title,
        "content": post.content,
        "region": post.region,
        "store_name": post.store_name,
        "category": post.category,
        "view_count": post.view_count,
        "comment_count": comment_count,
        "tag_names": tag_names,
        "created_at": post.created_at,
        "updated_at": post.updated_at,
    }


@router.patch("/{post_id}", response_model=PostRead)
def update_post(
    post_id: int,
    post_data: PostUpdate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    post = (
        db.query(Post)
        .filter(Post.id == post_id, Post.deleted_at.is_(None))
        .first()
    )

    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="게시글을 찾을 수 없습니다.",
        )

    if post.author_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="게시글을 수정할 권한이 없습니다.",
        )

    if post_data.title is not None:
        post.title = post_data.title

    if post_data.content is not None:
        post.content = post_data.content

    if post_data.region is not None:
        post.region = post_data.region

    if post_data.store_name is not None:
        post.store_name = post_data.store_name

    if post_data.category is not None:
        post.category = post_data.category

    db.commit()
    db.refresh(post)
    background_tasks.add_task(embed_post_by_id, post.id)

    comment_count = (
        db.query(func.count(Comment.id))
        .filter(Comment.post_id == post.id, Comment.deleted_at.is_(None))
        .scalar()
    )

    return {
        "id": post.id,
        "author_id": post.author_id,
        "title": post.title,
        "content": post.content,
        "region": post.region,
        "store_name": post.store_name,
        "category": post.category,
        "view_count": post.view_count,
        "comment_count": comment_count,
        "tag_names": get_post_tag_names(db, post.id),
        "created_at": post.created_at,
        "updated_at": post.updated_at,
    }


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    post = (
        db.query(Post)
        .filter(Post.id == post_id, Post.deleted_at.is_(None))
        .first()
    )

    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="게시글을 찾을 수 없습니다.",
        )

    if post.author_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="게시글을 삭제할 권한이 없습니다.",
        )

    post.deleted_at = datetime.utcnow()

    db.commit()

    return None
