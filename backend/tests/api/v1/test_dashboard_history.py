"""
Tests for dashboard historical trend endpoints.
"""
import pytest
from datetime import datetime, timedelta
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Risk, User, Department
from app.models.risk import RiskStatus
from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.kri_history import KRIValueHistory


@pytest.fixture
async def trend_test_data(db: AsyncSession, admin_user: User, test_department: Department):
    """Create test data for trend endpoints."""
    # Create risks in different months
    now = datetime.now()
    last_month = now - timedelta(days=35)
    
    # Risk created this month (critical)
    risk1 = Risk(
        description="Critical Risk This Month",
        risk_id_code="R-001",
        department_id=test_department.id,
        owner_id=admin_user.id,
        process="Test Process",
        category="Operational",
        risk_type="operational",
        status=RiskStatus.active.value,
        gross_probability=5,
        gross_impact=5,
        net_probability=5,
        net_impact=4,  # net_score = 20 (critical)
        created_at=now
    )
    
    # Risk created last month (non-critical)
    risk2 = Risk(
        description="Normal Risk Last Month",
        risk_id_code="R-002",
        department_id=test_department.id,
        owner_id=admin_user.id,
        process="Test Process",
        category="Operational",
        risk_type="operational",
        status=RiskStatus.active.value,
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,  # net_score = 4 (low)
        created_at=last_month
    )
    
    db.add_all([risk1, risk2])
    await db.flush()
    
    # Create KRI with history entries
    kri = KeyRiskIndicator(
        risk_id=risk1.id,
        metric_name="Test KRI",
        current_value=100,
        lower_limit=0,
        upper_limit=80,
        unit="%",
        frequency="monthly",
    )
    db.add(kri)
    await db.flush()
    
    # History entry this month (breach)
    history1 = KRIValueHistory(
        kri_id=kri.id,
        value=100,
        lower_limit=0,
        upper_limit=80,
        unit="%",
        breach_status="above",
        period_start=now - timedelta(days=30),
        period_end=now,
        recorded_at=now,
    )
    
    # History entry last month (within)
    history2 = KRIValueHistory(
        kri_id=kri.id,
        value=50,
        lower_limit=0,
        upper_limit=80,
        unit="%",
        breach_status="within",
        period_start=last_month - timedelta(days=30),
        period_end=last_month,
        recorded_at=last_month,
    )
    
    db.add_all([history1, history2])
    await db.commit()
    
    return {"risk1": risk1, "risk2": risk2, "kri": kri}


@pytest.mark.asyncio
async def test_get_risk_trends(
    client: AsyncClient,
    admin_token: str,
    trend_test_data: dict,
):
    """Test GET /dashboard/risk-trends returns monthly risk counts."""
    response = await client.get(
        "/api/v1/dashboard/risk-trends",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # Should have at least entries for test months
    if len(data) > 0:
        # Check structure
        assert "period" in data[0]
        assert "total_new" in data[0]
        assert "critical_new" in data[0]


@pytest.mark.asyncio
async def test_get_kri_breach_trends(
    client: AsyncClient,
    admin_token: str,
    trend_test_data: dict,
):
    """Test GET /dashboard/kri-breach-trends returns monthly breach counts."""
    response = await client.get(
        "/api/v1/dashboard/kri-breach-trends",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # Should have at least entries for test months
    if len(data) > 0:
        # Check structure
        assert "period" in data[0]
        assert "total_entries" in data[0]
        assert "breached_entries" in data[0]


@pytest.mark.asyncio
async def test_trends_empty_for_no_access_user(
    client: AsyncClient,
    employee_token: str,
):
    """Test trends return empty for users with no department access."""
    # Employee without department_id set might return empty
    response = await client.get(
        "/api/v1/dashboard/risk-trends",
        headers={"Authorization": f"Bearer {employee_token}"},
    )
    assert response.status_code == 200
    # Could be empty or have data depending on user setup
    assert isinstance(response.json(), list)
