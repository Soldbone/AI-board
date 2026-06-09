from datetime import datetime

from pydantic import BaseModel


class UserCreate(BaseModel):
    email: str
    nickname: str
    password: str

class UserUpdate(BaseModel):
    nickname: str | None = None
    bio: str | None = None

class UserRead(BaseModel):
    id: int
    email: str
    nickname: str
    bio: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes" : True
    }