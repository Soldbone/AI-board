from collections.abc import Generator
from pathlib import Path
import sys

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import backend.app.models  # noqa: F401
from backend.app.core.config import Settings, get_settings
from backend.app.db.session import Base, get_db
from backend.app.main import create_app
from backend.app.models.user import EmailVerificationCode


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    """테스트마다 새 인메모리 DB를 만들고 FastAPI 의존성에 주입한다."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()

    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture
def test_settings() -> Settings:
    """JWT와 API Key 암호화가 동작하도록 테스트 전용 설정을 만든다."""
    return Settings(
        database_url="sqlite://",
        jwt_secret="test-jwt-secret-for-potato-maker-suite",
        api_key_encryption_secret=Fernet.generate_key().decode("utf-8"),
        cors_allowed_origins="http://testserver",
    )


@pytest.fixture
def client(db_session: Session, test_settings: Settings) -> Generator[TestClient, None, None]:
    """실제 FastAPI 앱에 테스트 DB와 설정 의존성을 덮어씌운 클라이언트다."""
    app = create_app()

    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    def override_get_settings() -> Settings:
        return test_settings

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_settings] = override_get_settings

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


def register_verified_user(
    client: TestClient,
    db_session: Session,
    email: str,
    password: str = "password123",
) -> tuple[str, dict]:
    """회원가입 요청 후 DB의 MVP 인증코드를 읽어 검증까지 끝낸다."""
    response = client.post(
        "/auth/register/request-code",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200

    code_row = db_session.execute(
        select(EmailVerificationCode)
        .where(EmailVerificationCode.email == email.lower())
        .order_by(EmailVerificationCode.id.desc())
    ).scalar_one()

    verify_response = client.post(
        "/auth/register/verify",
        json={"email": email, "code": code_row.code},
    )
    assert verify_response.status_code == 200
    data = verify_response.json()
    return data["access_token"], data["user"]


def auth_headers(token: str) -> dict[str, str]:
    """인증이 필요한 API에서 재사용할 Bearer 헤더를 만든다."""
    return {"Authorization": f"Bearer {token}"}
