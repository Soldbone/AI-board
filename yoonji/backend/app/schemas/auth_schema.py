from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.user_schema import UserResponse, UserSummary


class SignupRequest(BaseModel):
    email: EmailStr
    login_id: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=72)
    nickname: str = Field(min_length=2, max_length=50)

    @field_validator("password")
    @classmethod
    def validate_password_bytes(cls, value: str) -> str:
        return validate_bcrypt_password(value)


class LoginRequest(BaseModel):
    login_id: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=72)

    @field_validator("password")
    @classmethod
    def validate_password_bytes(cls, value: str) -> str:
        return validate_bcrypt_password(value)


class TokenRefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int
    user: UserSummary


class TokenRefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int


class SignupResponse(UserResponse):
    pass


def validate_bcrypt_password(value: str) -> str:
    if len(value.encode("utf-8")) > 72:
        raise ValueError("비밀번호는 bcrypt 기준 72바이트 이하여야 합니다.")

    return value
