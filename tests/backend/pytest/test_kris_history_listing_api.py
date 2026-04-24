"""Tests for KRI history listing API endpoints."""

from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.kri_history import KRIValueHistory

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
async def test_get_history_offset_uses_exact_slice(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_kri_with_history_for_api,
    test_user_cro,
):
    """Canonical offset pagination should not be rounded down to a page boundary."""
    now = datetime.now(UTC)
    db_session.add_all(
        [
            KRIValueHistory(
                kri_id=test_kri_with_history_for_api.id,
                period_start=date.today() - timedelta(days=20),
                period_end=date.today() - timedelta(days=10),
                recorded_at=now - timedelta(days=1),
                recorded_by_id=test_user_cro.id,
                value=60.0,
                lower_limit=0.0,
                upper_limit=100.0,
                unit="%",
                breach_status="within",
            ),
            KRIValueHistory(
                kri_id=test_kri_with_history_for_api.id,
                period_start=date.today() - timedelta(days=10),
                period_end=date.today() - timedelta(days=1),
                recorded_at=now - timedelta(days=2),
                recorded_by_id=test_user_cro.id,
                value=55.0,
                lower_limit=0.0,
                upper_limit=100.0,
                unit="%",
                breach_status="within",
            ),
        ]
    )
    await db_session.commit()

    response = await auth_client.get(
        f"/api/v1/kris/{test_kri_with_history_for_api.id}/history",
        params={"offset": 1, "limit": 1},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["offset"] == 1
    assert data["limit"] == 1
    assert data["total"] >= 3
    assert len(data["items"]) == 1
    assert data["items"][0]["value"] == 55.0


@pytest.mark.asyncio
async def test_get_history_requires_auth(
    client: AsyncClient,
    test_kri_for_api,
):
    """Test GET /kris/{id}/history requires authentication."""
    response = await client.get(f"/api/v1/kris/{test_kri_for_api.id}/history")

    # Should be 401 or 403 without auth
    assert response.status_code in [401, 403]
