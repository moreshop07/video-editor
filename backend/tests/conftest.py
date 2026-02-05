"""Shared test fixtures for the backend test suite."""

from __future__ import annotations

import os
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Ensure models are registered on Base.metadata before table creation
import app.models  # noqa: F401
from app.core.database import Base, get_db
from app.main import app

# ---------------------------------------------------------------------------
# Test database URL
# ---------------------------------------------------------------------------
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://veditor:veditor_dev_pass@localhost:5432/video_editor_test",
)

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ---------------------------------------------------------------------------
# Session-scoped: create / drop all tables once per test session
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_database():
    """Create all tables at the start of the test session and drop them at the end."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()


# ---------------------------------------------------------------------------
# Per-test: transactional session with rollback
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield a test database session that rolls back after each test."""
    async with test_engine.connect() as conn:
        txn = await conn.begin()
        session = AsyncSession(bind=conn, expire_on_commit=False)
        try:
            yield session
        finally:
            await session.close()
            await txn.rollback()


# ---------------------------------------------------------------------------
# HTTP test client
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Yield an httpx AsyncClient wired to the FastAPI app with test DB."""

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Authenticated client helper
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def authenticated_client(
    client: AsyncClient,
) -> AsyncClient:
    """Register a test user and return the client with an auth header."""
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "testuser@example.com",
            "username": "testuser",
            "password": "testpassword123",
        },
    )
    assert resp.status_code == 201, resp.text
    token = resp.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client
