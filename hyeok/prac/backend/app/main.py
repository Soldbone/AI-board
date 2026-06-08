from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import Base, engine, get_db
from app.models import Post
from app.schemas import PostCreate, PostRead

app = FastAPI(title="Prac Board API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def create_tables() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/posts", response_model=list[PostRead])
def list_posts(db: Session = Depends(get_db)) -> list[Post]:
    stmt = select(Post).order_by(Post.created_at.desc())
    return list(db.scalars(stmt))


@app.post("/posts", response_model=PostRead, status_code=201)
def create_post(payload: PostCreate, db: Session = Depends(get_db)) -> Post:
    post = Post(content=payload.content)
    db.add(post)
    db.commit()
    db.refresh(post)
    return post

