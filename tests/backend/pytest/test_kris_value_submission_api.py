"""Tests for KRI value submission API endpoints."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.key_risk_indicator import KeyRiskIndicator, KRIFrequency
from app.models.kri_history import KRIValueHistory

pytest_plugins = ("tests.backend.pytest.kri_history_api_support",)


@pytest.mark.asyncio
async def test_record_value_success(
    auth_client: AsyncClient,
    test_kri_for_api,
):
    """Test POST /kris/{id}/values returns 200 and records value."""
    response = await auth_client.post(f"/api/v1/kris/{test_kri_for_api.id}/values", json={"value": 75.0})

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
    response = await auth_client.post(f"/api/v1/kris/{test_kri_for_api.id}/values", json={"value": 88.5})

    assert response.status_code == 200

    # Verify KRI was updated
    await db_session.refresh(test_kri_for_api)
    assert test_kri_for_api.current_value == 88.5


@pytest.mark.asyncio
async def test_update_kri_rejects_current_value_updates(
    auth_client: AsyncClient,
    test_kri_for_api,
    db_session: AsyncSession,
):
    """PUT /kris/{id} must not allow current_value updates (use /values)."""
    response = await auth_client.put(f"/api/v1/kris/{test_kri_for_api.id}", json={"current_value": 77.5})

    assert response.status_code == 400
    assert "Use POST /kris/{id}/values" in response.json()["detail"]

    result = await db_session.execute(select(KRIValueHistory).where(KRIValueHistory.kri_id == test_kri_for_api.id))
    entries = result.scalars().all()
    assert len(entries) == 0


@pytest.mark.asyncio
async def test_record_value_creates_history_entry(
    auth_client: AsyncClient,
    test_kri_for_api,
    db_session: AsyncSession,
):
    """POST /kris/{id}/values creates a history entry for privileged users."""
    response = await auth_client.post(f"/api/v1/kris/{test_kri_for_api.id}/values", json={"value": 77.5})

    assert response.status_code == 200

    result = await db_session.execute(select(KRIValueHistory).where(KRIValueHistory.kri_id == test_kri_for_api.id))
    entries = result.scalars().all()
    assert len(entries) >= 1


@pytest.mark.asyncio
async def test_record_value_requires_auth(
    client: AsyncClient,
    test_kri_for_api,
):
    """Test POST /kris/{id}/values requires authentication."""
    response = await client.post(f"/api/v1/kris/{test_kri_for_api.id}/values", json={"value": 75.0})

    # Should be 401 or 403 without auth
    assert response.status_code in [401, 403]


@pytest.mark.asyncio
async def test_non_privileged_value_submission_returns_202(
    client: AsyncClient,
    db_session: AsyncSession,
    test_risk,
    test_role_employee,
):
    """Test POST /kris/{id}/values by non-privileged user returns 202 with approval."""
    from app.models import Department, User

    # Create a non-privileged user
    dept = Department(name="Test Dept", code="TEST-DEPT")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    employee = User(
        name="Employee",
        email="employee-test@example.com",
        role_id=test_role_employee.id,
        department_id=dept.id,
        is_active=True,
    )
    db_session.add(employee)
    await db_session.commit()
    await db_session.refresh(employee)

    # Create a KRI in the employee's department
    from app.models import Risk
    from app.models.risk import RiskStatus

    risk = Risk(
        risk_id_code="RISK-EMP-TEST",
        name="Employee Test Risk",
        process="Test Process",
        description="Employee Test Risk",
        category="Test",
        department_id=dept.id,
        owner_id=employee.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=3,
        net_probability=2,
        net_impact=3,
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name="Employee Test KRI",
        description="Employee Test KRI description",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    # Submit value as non-privileged user
    response = await client.post(
        f"/api/v1/kris/{kri.id}/values", headers={"X-Mock-User-Id": str(employee.id)}, json={"value": 75.0}
    )

    assert response.status_code == 202
    data = response.json()
    assert "approval_id" in data
    assert data["action_type"] == "edit"
    assert data["pending_changes"]["current_value"]["new"] == 75.0
    assert "period_end" in data["pending_changes"]

    # Verify KRI was NOT updated
    await db_session.refresh(kri)
    assert kri.current_value == 50.0  # Still original value


@pytest.mark.asyncio
async def test_non_privileged_cannot_specify_period_end(
    client: AsyncClient,
    db_session: AsyncSession,
    test_risk,
    test_role_employee,
):
    """Test non-privileged users cannot specify custom period_end."""
    from app.models import Department, User

    # Create a non-privileged user
    dept = Department(name="Test Dept 2", code="TEST-DEPT-2")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    employee = User(
        name="Employee 2",
        email="employee-test-2@example.com",
        role_id=test_role_employee.id,
        department_id=dept.id,
        is_active=True,
    )
    db_session.add(employee)
    await db_session.commit()
    await db_session.refresh(employee)

    # Create a KRI in the employee's department
    from app.models import Risk
    from app.models.risk import RiskStatus

    risk = Risk(
        risk_id_code="RISK-EMP-TEST-2",
        name="Employee Test Risk 2",
        process="Test Process",
        description="Employee Test Risk 2",
        category="Test",
        department_id=dept.id,
        owner_id=employee.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=3,
        net_probability=2,
        net_impact=3,
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name="Employee Test KRI 2",
        description="Employee Test KRI 2 description",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    # Try to submit value with custom period_end as non-privileged user
    response = await client.post(
        f"/api/v1/kris/{kri.id}/values",
        headers={"X-Mock-User-Id": str(employee.id)},
        json={"value": 75.0, "period_end": "2024-12-31"},
    )

    assert response.status_code == 400
    assert "cannot specify custom period_end" in response.json()["detail"]
