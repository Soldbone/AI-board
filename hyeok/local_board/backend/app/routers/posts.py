from sqlalchemy import or_
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.post import Post
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.post import PostCreate, PostListItem, PostRead, PostUpdate
from app.models.tag import Tag, post_tags

router = APIRouter(prefix="/posts", tags=["posts"])


def normalize_tag_names(tag_names: list[str]) -> list[str]:
    normalized_names = []

    for tag_name in tag_names:
        cleaned_name = tag_name.strip()

        if cleaned_name and cleaned_name not in normalized_names:
            normalized_names.append(cleaned_name)

    return normalized_names


@router.post("", response_model=PostRead, status_code=status.HTTP_201_CREATED)
def create_post(
    post_data: PostCreate,
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

    return new_post


@router.get("", response_model=list[PostListItem])
def read_posts(
    keyword: str | None = None,
    tag: str | None = None,
    page: int = 1,
    size: int = 10,
    db: Session = Depends(get_db),
):
    query = db.query(Post).filter(Post.deleted_at.is_(None))

    if keyword and keyword.strip():
        search_keyword = f"%{keyword.strip()}%"

        query = query.filter(
            or_(
                Post.title.ilike(search_keyword),
                Post.content.ilike(search_keyword),
                Post.region.ilike(search_keyword),
                Post.store_name.ilike(search_keyword),
                Post.category.ilike(search_keyword),
            )
        )
    
    if tag and tag.strip():
        tag_name = tag.strip()

        query = (
            query
            .join(post_tags, Post.id == post_tags.c.post_id)
            .join(Tag, Tag.id == post_tags.c.tag_id)
            .filter(Tag.name == tag_name)
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

    offset = (page - 1) * size

    posts = (
        query
        .order_by(Post.created_at.desc())
        .offset(offset)
        .limit(size)
        .all()
    )

    return posts


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

    return post


@router.patch("/{post_id}", response_model=PostRead)
def update_post(
    post_id: int,
    post_data: PostUpdate,
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

    return post


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
