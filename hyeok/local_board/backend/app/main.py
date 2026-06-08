from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import check_db_connection, get_db

app = FastAPI(title="Local Board API")


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