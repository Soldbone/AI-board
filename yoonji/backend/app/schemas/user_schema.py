from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.enums import UserRole, UserStatus


class UserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    login_id: str
    nickname: str
    profile_image_url: str | None = None
    role: UserRole


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    login_id: str
    nickname: str
    profile_image_url: str | None = None
    role: UserRole
    status: UserStatus
    last_login_at: datetime | None = None
    created_at: datetime
