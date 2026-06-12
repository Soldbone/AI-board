from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserRead(BaseModel):
    """인증 이후 화면과 API에서 보여줄 사용자 공개 정보다."""

    id: int
    email: str
    nickname: str | None = None
    is_email_verified: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserSummary(BaseModel):
    """게시글 작성자처럼 작은 사용자 정보만 필요할 때 사용한다."""

    id: int
    nickname: str | None = None

    model_config = ConfigDict(from_attributes=True)


class RegisterCodeRequest(BaseModel):
    """회원가입 시작 시 이메일과 비밀번호를 받아 인증코드 생성을 요청한다."""

    email: str
    password: str = Field(min_length=8, max_length=128)


class RegisterVerifyRequest(BaseModel):
    """사용자가 입력한 이메일 인증코드를 검증할 때 사용한다."""

    email: str
    code: str = Field(min_length=4, max_length=20)


class LoginRequest(BaseModel):
    """로그인 요청에서 이메일과 비밀번호를 받는다."""

    email: str
    password: str = Field(min_length=1, max_length=128)


class NicknameUpdateRequest(BaseModel):
    """이메일은 고정하고 닉네임만 수정하기 위한 요청 스키마다."""

    nickname: str | None = Field(default=None, max_length=50)


class TokenUser(BaseModel):
    """JWT 발급 응답 안에 포함할 최소 사용자 정보다."""

    id: int
    email: str
    nickname: str | None = None

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    """로그인과 이메일 인증 완료 후 같은 형태의 토큰 응답을 반환한다."""

    access_token: str
    token_type: str = "bearer"
    user: TokenUser


class ApiKeyUpsertRequest(BaseModel):
    """사용자 API Key 등록/수정 요청에서 provider와 원문 키를 받는다."""

    provider: str = "openai"
    api_key: str = Field(min_length=1, max_length=500)


class ApiKeyStatusResponse(BaseModel):
    """API Key 원문 없이 등록 여부와 마지막 4자리만 화면에 알려준다."""

    provider: str
    has_api_key: bool
    api_key_last4: str | None = None
