"""Tests for KRI history listing API endpoints."""

import pytest
from httpx import AsyncClient

pytest_plugins = ("tests.backend.pytest.kri_history_api_support",)


@pytest.mark.asyncio
async def test_get_history_returns_entries(
    auth_client: AsyncClient,
    test_kri_with_history_for_api,
):
    """Test GET /kris/{id}/history returns history entries."""
    response = await auth_client.get(f"/api/v1/kris/{test_kri_with_history_for_api.id}/history")

    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] >= 1


@pytest.mark.asyncio
async def test_get_history_empty_for_new_kri(
    auth_client: AsyncClient,
    test_kri_for_api,
):
    """Test GET /kris/{id}/history returns empty for KRI without history."""
    response = await auth_client.get(f"/api/v1/kris/{test_kri_for_api.id}/history")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert len(data["items"]) == 0


@pytest.mark.asyncio
async def test_get_history_pagination(
    auth_client: AsyncClient,
    test_kri_with_history_for_api,
):
    """Test GET /kris/{id}/history supports pagination."""
    response = await auth_client.get(
        f"/api/v1/kris/{test_kri_with_history_for_api.id}/history", params={"page": 1, "size": 10}
    )

    assert response.status_code == 200
    data = response.json()
    assert "page" in data
    assert "size" in data


@pytest.mark.asyncio
async def test_get_history_requires_auth(
    client: AsyncClient,
    test_kri_for_api,
):
    """Test GET /kris/{id}/history requires authentication."""
    response = await client.get(f"/api/v1/kris/{test_kri_for_api.id}/history")

    # Should be 401 or 403 without auth
    assert response.status_code in [401, 403]
