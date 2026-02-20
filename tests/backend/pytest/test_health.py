"""
Tests for Health API endpoint.
"""

import pytest
from httpx import ASGITransport, AsyncClient

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
            assert data["status"] == "healthy"
    finally:
        app.dependency_overrides.clear()
