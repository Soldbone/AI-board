"""SQLAlchemy 모델을 한 번에 import해 Alembic metadata에 등록한다."""

from backend.app.models.ai import AiAnalysisResult, PostEmbedding
from backend.app.models.comment import Comment
from backend.app.models.post import Post, PostMedia, PostTag, Tag
from backend.app.models.user import EmailVerificationCode, User, UserApiKey

__all__ = [
    "AiAnalysisResult",
    "Comment",
    "EmailVerificationCode",
    "Post",
    "PostEmbedding",
    "PostMedia",
    "PostTag",
    "Tag",
    "User",
    "UserApiKey",
]
