from sqlalchemy.types import UserDefinedType


class Vector(UserDefinedType):
    """PostgreSQL pgvector 컬럼을 SQLAlchemy 모델에서 표현한다."""

    cache_ok = True

    def __init__(self, dimensions: int) -> None:
        self.dimensions = dimensions

    def get_col_spec(self, **kw: object) -> str:
        return f"vector({self.dimensions})"
