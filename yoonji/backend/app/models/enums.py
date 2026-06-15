from enum import Enum

from sqlalchemy import Enum as SQLAlchemyEnum


class UserRole(str, Enum):
    USER = "USER"
    ADMIN = "ADMIN"


class UserStatus(str, Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    SUSPENDED = "SUSPENDED"
    DELETED = "DELETED"


class BoardCode(str, Enum):
    REVIEW = "REVIEW"
    INFO = "INFO"
    QUESTION = "QUESTION"
    PURCHASE_HELP = "PURCHASE_HELP"
    NOTICE = "NOTICE"
    FAQ = "FAQ"


class PostSourceType(str, Enum):
    USER = "USER"
    AI_DRAFT = "AI_DRAFT"
    AI_PUBLISHED = "AI_PUBLISHED"


class PostStatus(str, Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    PENDING_REVIEW = "PENDING_REVIEW"
    HIDDEN = "HIDDEN"
    DELETED = "DELETED"


class FigureType(str, Enum):
    SCALE = "SCALE"
    NENDOROID = "NENDOROID"
    FIGMA = "FIGMA"
    ACTION_FIGURE = "ACTION_FIGURE"
    PRIZE = "PRIZE"
    GARAGE_KIT = "GARAGE_KIT"
    OTHER = "OTHER"


class PriceRange(str, Enum):
    UNDER_30000 = "UNDER_30000"
    PRICE_30000_50000 = "30000_50000"
    PRICE_50000_100000 = "50000_100000"
    PRICE_100000_200000 = "100000_200000"
    OVER_200000 = "OVER_200000"
    UNKNOWN = "UNKNOWN"


class FigureTargetType(str, Enum):
    REVIEW_TARGET = "REVIEW_TARGET"
    RELATED_FIGURE = "RELATED_FIGURE"


class CommentStatus(str, Enum):
    PUBLISHED = "PUBLISHED"
    HIDDEN = "HIDDEN"
    DELETED = "DELETED"


class TagType(str, Enum):
    CHARACTER = "CHARACTER"
    WORK = "WORK"
    MANUFACTURER = "MANUFACTURER"
    TOPIC = "TOPIC"
    PRICE = "PRICE"
    GENERAL = "GENERAL"


class TagStatus(str, Enum):
    ACTIVE = "ACTIVE"
    MERGED = "MERGED"
    BLOCKED = "BLOCKED"
    DELETED = "DELETED"


class ImageStatus(str, Enum):
    TEMP = "TEMP"
    ATTACHED = "ATTACHED"
    DELETED = "DELETED"
    FAILED = "FAILED"


class ContentSourceType(str, Enum):
    POST = "POST"
    COMMENT = "COMMENT"
    NOTICE = "NOTICE"
    FAQ = "FAQ"


class ContentChunkStatus(str, Enum):
    PENDING = "PENDING"
    INDEXED = "INDEXED"
    FAILED = "FAILED"
    STALE = "STALE"
    DELETED = "DELETED"


class AiOutputType(str, Enum):
    QUESTION_REFERENCE_ANSWER = "QUESTION_REFERENCE_ANSWER"
    PURCHASE_SUMMARY = "PURCHASE_SUMMARY"
    AGENT_ANSWER = "AGENT_ANSWER"


class AiOutputStatus(str, Enum):
    REQUESTED = "REQUESTED"
    PROCESSING = "PROCESSING"
    GENERATED = "GENERATED"
    FAILED = "FAILED"


class GroundingStatus(str, Enum):
    GROUNDED = "GROUNDED"
    PARTIALLY_GROUNDED = "PARTIALLY_GROUNDED"
    NO_EVIDENCE = "NO_EVIDENCE"


class ProductEnrichmentStatus(str, Enum):
    REQUESTED = "REQUESTED"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class ProductMatchStatus(str, Enum):
    VERIFIED = "VERIFIED"
    CANDIDATES_ONLY = "CANDIDATES_ONLY"
    NO_MATCH = "NO_MATCH"


def enum_column_type(enum_class: type[Enum], name: str) -> SQLAlchemyEnum:
    return SQLAlchemyEnum(
        enum_class,
        name=name,
        native_enum=False,
        validate_strings=True,
        values_callable=lambda values: [item.value for item in values],
    )
