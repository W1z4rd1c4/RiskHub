"""Tests for KRI history API endpoints."""
import pytest
import pytest_asyncio
from datetime import datetime, UTC, timedelta, date
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.key_risk_indicator import KeyRiskIndicator, KRIFrequency
from app.models.kri_history import KRIValueHistory


@pytest_asyncio.fixture
async def test_kri_for_api(db_session: AsyncSession, test_risk):
    """Create a KRI for API testing."""
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="API Test KRI",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.quarterly.value,
        created_at=datetime.now(UTC) - timedelta(days=10),
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    return kri


@pytest_asyncio.fixture
async def test_kri_with_history_for_api(db_session: AsyncSession, test_risk, test_user_cro):
    """Create a KRI with existing history for API testing."""
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="KRI With History For API",
        current_value=45.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
        created_at=datetime.now(UTC) - timedelta(days=60),
        last_period_end=date.today() - timedelta(days=30),
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    
    # Add a history entry
    history = KRIValueHistory(
        kri_id=kri.id,
        period_start=date.today() - timedelta(days=60),
        period_end=date.today() - timedelta(days=30),
        recorded_at=datetime.now(UTC) - timedelta(days=25),
        recorded_by_id=test_user_cro.id,
        value=45.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        breach_status="within",
    )
    db_session.add(history)
    await db_session.commit()
    
    return kri


# Record Value Endpoint Tests

@pytest.mark.asyncio
async def test_record_value_success(
    auth_client: AsyncClient,
    test_kri_for_api,
):
    """Test POST /kris/{id}/values returns 200 and records value."""
    response = await auth_client.post(
        f"/api/v1/kris/{test_kri_for_api.id}/values",
        json={"value": 75.0}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["current_value"] == 75.0


@pytest.mark.asyncio
async def test_record_value_updates_kri(
    auth_client: AsyncClient,
    test_kri_for_api,
    db_session: AsyncSession,
):
    """Test recording value updates the KRI's current_value."""
    response = await auth_client.post(
        f"/api/v1/kris/{test_kri_for_api.id}/values",
        json={"value": 88.5}
    )
    
    assert response.status_code == 200
    
    # Verify KRI was updated
    await db_session.refresh(test_kri_for_api)
    assert test_kri_for_api.current_value == 88.5


# History Endpoint Tests

@pytest.mark.asyncio
async def test_get_history_returns_entries(
    auth_client: AsyncClient,
    test_kri_with_history_for_api,
):
    """Test GET /kris/{id}/history returns history entries."""
    response = await auth_client.get(
        f"/api/v1/kris/{test_kri_with_history_for_api.id}/history"
    )
    
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
    response = await auth_client.get(
        f"/api/v1/kris/{test_kri_for_api.id}/history"
    )
    
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
        f"/api/v1/kris/{test_kri_with_history_for_api.id}/history",
        params={"page": 1, "size": 10}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "page" in data
    assert "size" in data


# Overdue Endpoint Tests

@pytest.mark.asyncio
async def test_get_overdue_returns_list(auth_client: AsyncClient):
    """Test GET /kris/overdue returns a list."""
    response = await auth_client.get("/api/v1/kris/overdue")
    
    assert response.status_code == 200
    assert isinstance(response.json(), list)


# Permission Tests

@pytest.mark.asyncio
async def test_record_value_requires_auth(
    client: AsyncClient,
    test_kri_for_api,
):
    """Test POST /kris/{id}/values requires authentication."""
    response = await client.post(
        f"/api/v1/kris/{test_kri_for_api.id}/values",
        json={"value": 75.0}
    )
    
    # Should be 401 or 403 without auth
    assert response.status_code in [401, 403]


@pytest.mark.asyncio
async def test_get_history_requires_auth(
    client: AsyncClient,
    test_kri_for_api,
):
    """Test GET /kris/{id}/history requires authentication."""
    response = await client.get(
        f"/api/v1/kris/{test_kri_for_api.id}/history"
    )
    
    # Should be 401 or 403 without auth
    assert response.status_code in [401, 403]
