"""Tests for KRI due-soon and overdue API endpoints."""

from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.key_risk_indicator import KeyRiskIndicator, KRIFrequency

pytest_plugins = ("tests.backend.pytest.kri_history_api_support",)


@pytest.mark.asyncio
async def test_get_overdue_returns_list(auth_client: AsyncClient):
    """Test GET /kris/overdue returns a list."""
    response = await auth_client.get("/api/v1/kris/overdue")

    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_get_due_soon_returns_list(auth_client: AsyncClient):
    """Test GET /kris/due-soon returns a list."""
    response = await auth_client.get("/api/v1/kris/due-soon")

    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_due_soon_response_format(auth_client: AsyncClient):
    """Test GET /kris/due-soon response has correct format."""
    response = await auth_client.get("/api/v1/kris/due-soon")

    assert response.status_code == 200
    data = response.json()

    # If there are items, verify format
    if len(data) > 0:
        item = data[0]
        assert "kri_id" in item
        assert "metric_name" in item
        assert "frequency" in item
        assert "period_end" in item
        assert "due_date" in item
        assert "days_until_due" in item
        assert "risk_id" in item


@pytest.mark.asyncio
async def test_due_soon_excludes_already_reported(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_risk,
):
    """Test GET /kris/due-soon excludes KRIs already reported for current period."""
    from app.services._kri_history.service import KRIHistoryService

    today = date.today()
    _, current_period_end = KRIHistoryService.period_bounds_for_date(today, "monthly")

    # Create a KRI that's already reported for current period
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="Already Reported KRI",
        description="Already reported KRI description",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
        last_period_end=current_period_end,  # Already reported for this period
    )
    db_session.add(kri)
    await db_session.commit()

    response = await auth_client.get("/api/v1/kris/due-soon")

    assert response.status_code == 200
    data = response.json()

    # The already-reported KRI should NOT be in the due-soon list
    kri_ids = [item["kri_id"] for item in data]
    assert kri.id not in kri_ids
