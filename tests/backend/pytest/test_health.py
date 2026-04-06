import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import SQLAlchemyError

from app.db.session import get_db
from app.main import app


@pytest.mark.asyncio
async def test_health_check(db_session):
    """Test the health check endpoint."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/health")
            assert response.status_code == 200
            data = response.json()
            assert data == {
                "status": "healthy",
                "database": "connected",
                "redis": "disabled",
                "scheduler": "disabled",
            }
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_health_check_returns_degraded_for_database_errors():
    class _BrokenDbSession:
        async def execute(self, *_args, **_kwargs):
            raise SQLAlchemyError("db offline")

    async def override_get_db():
        yield _BrokenDbSession()

    app.dependency_overrides[get_db] = override_get_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/health")
            assert response.status_code == 200
            assert response.json() == {
                "status": "degraded",
                "database": "disconnected",
                "redis": "disabled",
                "scheduler": "disabled",
            }
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_health_check_does_not_swallow_unexpected_errors():
    class _UnexpectedBrokenDbSession:
        async def execute(self, *_args, **_kwargs):
            raise ValueError("unexpected db failure")

    async def override_get_db():
        yield _UnexpectedBrokenDbSession()

    app.dependency_overrides[get_db] = override_get_db
    try:
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/health")
            assert response.status_code == 500
    finally:
        app.dependency_overrides.clear()
