"""라우터에서 재사용할 Pydantic 스키마를 모아 노출한다."""

from backend.app.schemas.ai import RagRecommendRequest, RagRecommendResponse, RagRecommendationItem
from backend.app.schemas.common import MessageResponse, PageResponse, PaginationParams
from backend.app.schemas.posts import (
    CommentCreateRequest,
    CommentRead,
    CommentUpdateRequest,
    PostCreateRequest,
    PostListItem,
    PostMediaRead,
    PostRead,
    PostUpdateRequest,
    TagCreateRequest,
    TagRead,
)
from backend.app.schemas.users import (
    ApiKeyStatusResponse,
    ApiKeyUpsertRequest,
    LoginRequest,
    NicknameUpdateRequest,
    RegisterCodeRequest,
    RegisterVerifyRequest,
    TokenResponse,
    TokenUser,
    UserRead,
    UserSummary,
)

__all__ = [
    "ApiKeyStatusResponse",
    "ApiKeyUpsertRequest",
    "CommentCreateRequest",
    "CommentRead",
    "CommentUpdateRequest",
    "LoginRequest",
    "MessageResponse",
    "NicknameUpdateRequest",
    "PageResponse",
    "PaginationParams",
    "PostCreateRequest",
    "PostListItem",
    "PostMediaRead",
    "PostRead",
    "PostUpdateRequest",
    "RagRecommendRequest",
    "RagRecommendResponse",
    "RagRecommendationItem",
    "RegisterCodeRequest",
    "RegisterVerifyRequest",
    "TagCreateRequest",
    "TagRead",
    "TokenResponse",
    "TokenUser",
    "UserRead",
    "UserSummary",
]
