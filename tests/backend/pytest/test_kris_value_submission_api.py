"""Tests for KRI value submission API endpoints."""

from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
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
async def test_privileged_record_value_rejects_duplicate_period(
    auth_client: AsyncClient,
    test_kri_for_api,
    db_session: AsyncSession,
):
    """POST /values must not create parallel history rows for the same KRI period."""
    period_end = date(2026, 3, 31)

    first = await auth_client.post(
        f"/api/v1/kris/{test_kri_for_api.id}/values",
        json={"value": 77.5, "period_end": period_end.isoformat()},
    )
    assert first.status_code == 200

    duplicate = await auth_client.post(
        f"/api/v1/kris/{test_kri_for_api.id}/values",
        json={"value": 78.5, "period_end": period_end.isoformat()},
    )

    assert duplicate.status_code == 409
    assert "already recorded" in duplicate.json()["detail"]
    count = await db_session.scalar(
        select(func.count()).select_from(KRIValueHistory).where(
            KRIValueHistory.kri_id == test_kri_for_api.id,
            KRIValueHistory.period_end == period_end,
        )
    )
    assert count == 1


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
    from app.models import Department, Permission, RolePermission, User

    kri_submit = Permission(resource="kri", action="submit", description="Submit KRI values")
    db_session.add(kri_submit)
    await db_session.commit()

    db_session.add(RolePermission(role_id=test_role_employee.id, permission_id=kri_submit.id))
    await db_session.commit()

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
async def test_non_privileged_value_submission_uses_kri_history_clock(
    client: AsyncClient,
    db_session: AsyncSession,
    test_role_employee,
    monkeypatch: pytest.MonkeyPatch,
):
    """Latest closed period for non-privileged submissions should be driven by the injectable KRI clock."""
    from app.models import Department, Permission, Risk, RolePermission, User
    from app.models.risk import RiskStatus
    from app.models.user import AccessScope

    import app.services._kri_history.clock as kri_clock

    monkeypatch.setattr(kri_clock, "today", lambda: date(2026, 4, 10))

    kri_submit = Permission(resource="kri", action="submit", description="Submit KRI values")
    db_session.add(kri_submit)
    await db_session.commit()
    db_session.add(RolePermission(role_id=test_role_employee.id, permission_id=kri_submit.id))
    await db_session.commit()

    dept = Department(name="Clock Dept", code="CLOCK", is_active=True)
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    employee = User(
        name="Clock Employee",
        email="clock-employee@example.com",
        role_id=test_role_employee.id,
        department_id=dept.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(employee)
    await db_session.commit()
    await db_session.refresh(employee)

    risk = Risk(
        risk_id_code="RISK-CLOCK-KRI",
        name="Clock Risk",
        process="Test Process",
        description="Clock Risk",
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
        metric_name="Clock KRI",
        description="Clock KRI description",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.quarterly.value,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    response = await client.post(
        f"/api/v1/kris/{kri.id}/values",
        headers={"X-Mock-User-Id": str(employee.id)},
        json={"value": 75.0},
    )

    assert response.status_code == 202
    assert response.json()["pending_changes"]["period_end"] == "2026-03-31"


@pytest.mark.asyncio
async def test_non_privileged_cannot_specify_period_end(
    client: AsyncClient,
    db_session: AsyncSession,
    test_risk,
    test_role_employee,
):
    """Test non-privileged users cannot specify custom period_end."""
    from app.models import Department, Permission, RolePermission, User

    kri_submit = Permission(resource="kri", action="submit", description="Submit KRI values")
    db_session.add(kri_submit)
    await db_session.commit()

    db_session.add(RolePermission(role_id=test_role_employee.id, permission_id=kri_submit.id))
    await db_session.commit()

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
