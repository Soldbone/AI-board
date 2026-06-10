from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import Base, check_db_connection, engine, get_db
from app.models import comment, post, user, tag
from app.routers import auth, comments, posts, users, tags

app = FastAPI(title="Local Board API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(posts.router)
app.include_router(comments.router)
app.include_router(tags.router)

@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/db-health")
def db_health_check():
    try:
        check_db_connection()
        return {"database": "ok"}
    except Exception:
        raise HTTPException(status_code=500, detail="Database connection failed")


@app.get("/db-session-health")
def db_session_health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"database_session": "ok"}
    except Exception:
        raise HTTPException(status_code=500, detail="Database session failed")