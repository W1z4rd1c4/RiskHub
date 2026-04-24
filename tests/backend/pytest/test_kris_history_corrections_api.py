"""Tests for KRI history correction approval flows."""

from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.key_risk_indicator import KeyRiskIndicator, KRIFrequency
from app.models.kri_history import KRIValueHistory

pytest_plugins = ("tests.backend.pytest.kri_history_api_support",)


@pytest.mark.asyncio
async def test_kri_correction_requires_privileged_approval(
    client: AsyncClient,
    db_session: AsyncSession,
    test_risk,
    test_role_employee,
    test_user_cro,
):
    """Test PATCH /kris/{id}/history/{entry_id} sets requires_privileged_approval=True per §5.3."""
    from app.models import ApprovalRequest, Permission, RolePermission, User
    from app.models.user import AccessScope
    from app.services.kri_history_service import KRIHistoryService

    risks_write = Permission(resource="risks", action="write", description="Edit risks")
    db_session.add(risks_write)
    await db_session.commit()

    db_session.add(RolePermission(role_id=test_role_employee.id, permission_id=risks_write.id))
    await db_session.commit()

    # Create employee user with risks:write permission
    employee = User(
        name="Correction Test Employee",
        email="correction-test@example.com",
        role_id=test_role_employee.id,
        department_id=test_risk.department_id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(employee)
    await db_session.commit()
    await db_session.refresh(employee)

    # Create KRI with history entry
    _, period_end = KRIHistoryService.latest_closed_period_for_date(date.today(), KRIFrequency.monthly.value)

    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="Correction Approval KRI",
        description="KRI for correction approval test",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
        last_period_end=period_end,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    history_entry = KRIValueHistory(
        kri_id=kri.id,
        period_start=period_end - timedelta(days=30),
        period_end=period_end,
        recorded_at=datetime.now(UTC),
        recorded_by_id=test_user_cro.id,
        value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        breach_status="within",
    )
    db_session.add(history_entry)
    await db_session.commit()
    await db_session.refresh(history_entry)

    # Employee attempts to correct the value
    response = await client.patch(
        f"/api/v1/kris/{kri.id}/history/{history_entry.id}",
        headers={"X-Mock-User-Id": str(employee.id)},
        json={"value": 60.0, "reason": "Correcting misreported value"},
    )

    assert response.status_code == 202
    data = response.json()
    assert data["requires_privileged_approval"] is True
    assert "CRO" in data["message"] or "§5.3" in data["message"]

    # Verify the approval request was created with requires_privileged_approval=True
    result = await db_session.execute(select(ApprovalRequest).where(ApprovalRequest.id == data["approval_id"]))
    approval = result.scalar_one()
    assert approval.requires_privileged_approval is True
    assert approval.primary_approver_id == test_risk.owner_id


@pytest.mark.asyncio
async def test_privileged_user_can_directly_correct_kri(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_risk,
    test_user_cro,
):
    """Test privileged user (CRO) can correct KRI value immediately without approval."""
    from app.services.kri_history_service import KRIHistoryService

    # Create KRI with history entry
    _, period_end = KRIHistoryService.latest_closed_period_for_date(date.today(), KRIFrequency.monthly.value)

    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="Direct Correction KRI",
        description="KRI for direct correction test",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
        last_period_end=period_end,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    history_entry = KRIValueHistory(
        kri_id=kri.id,
        period_start=period_end - timedelta(days=30),
        period_end=period_end,
        recorded_at=datetime.now(UTC),
        recorded_by_id=test_user_cro.id,
        value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        breach_status="within",
    )
    db_session.add(history_entry)
    await db_session.commit()
    await db_session.refresh(history_entry)

    # Privileged user corrects the value directly
    response = await auth_client.patch(
        f"/api/v1/kris/{kri.id}/history/{history_entry.id}", json={"value": 75.0, "reason": "Privileged correction"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["value"] == 75.0

    # Verify history entry was updated
    await db_session.refresh(history_entry)
    assert history_entry.value == 75.0


@pytest.mark.asyncio
async def test_cross_department_risk_owner_with_write_can_request_history_correction(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user_approval_requester,
    test_user_cro,
):
    """Risk owners with write permission can correct KRI history even when the risk is outside their department."""
    from app.models import Department, Risk
    from app.models.risk import RiskStatus

    other_dept = Department(name="Correction Other Dept", code="CORR-OTHER", is_active=True)
    db_session.add(other_dept)
    await db_session.commit()
    await db_session.refresh(other_dept)

    risk = Risk(
        risk_id_code="RISK-CORR-XDEPT",
        name="Cross Department Correction Risk",
        process="Test Process",
        description="Cross department risk",
        category="Test",
        department_id=other_dept.id,
        owner_id=test_user_approval_requester.id,
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

    period_end = date(2026, 1, 31)
    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name="Cross Department Correction KRI",
        description="KRI for cross-department correction",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
        last_period_end=period_end,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    history_entry = KRIValueHistory(
        kri_id=kri.id,
        period_start=date(2026, 1, 1),
        period_end=period_end,
        recorded_at=datetime.now(UTC),
        recorded_by_id=test_user_cro.id,
        value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        breach_status="within",
    )
    db_session.add(history_entry)
    await db_session.commit()
    await db_session.refresh(history_entry)

    response = await client.patch(
        f"/api/v1/kris/{kri.id}/history/{history_entry.id}",
        headers={"X-Mock-User-Id": str(test_user_approval_requester.id)},
        json={"value": 60.0, "reason": "Correcting cross-department owned KRI history"},
    )

    assert response.status_code == 202
    assert response.json()["requires_privileged_approval"] is True


@pytest.mark.asyncio
async def test_reporting_owner_without_write_can_read_but_not_correct_history(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user_employee,
    test_user_cro,
):
    """Reporting-owner visibility is read-only unless the user also has risks:write."""
    from app.models import Department, Risk
    from app.models.risk import RiskStatus

    other_dept = Department(name="Reporting Owner Other Dept", code="REPORT-OTHER", is_active=True)
    db_session.add(other_dept)
    await db_session.commit()
    await db_session.refresh(other_dept)

    risk = Risk(
        risk_id_code="RISK-REPORT-XDEPT",
        name="Reporting Owner Cross Department Risk",
        process="Test Process",
        description="Cross department risk",
        category="Test",
        department_id=other_dept.id,
        owner_id=test_user_cro.id,
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

    period_end = date(2026, 2, 28)
    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name="Reporting Owner Read Only KRI",
        description="KRI for reporting-owner read-only correction test",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
        reporting_owner_id=test_user_employee.id,
        last_period_end=period_end,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    history_entry = KRIValueHistory(
        kri_id=kri.id,
        period_start=date(2026, 2, 1),
        period_end=period_end,
        recorded_at=datetime.now(UTC),
        recorded_by_id=test_user_cro.id,
        value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        breach_status="within",
    )
    db_session.add(history_entry)
    await db_session.commit()
    await db_session.refresh(history_entry)

    read_response = await client.get(
        f"/api/v1/kris/{kri.id}/history",
        headers={"X-Mock-User-Id": str(test_user_employee.id)},
    )
    assert read_response.status_code == 200
    assert read_response.json()["capabilities"]["can_request_correction"] is False

    correction_response = await client.patch(
        f"/api/v1/kris/{kri.id}/history/{history_entry.id}",
        headers={"X-Mock-User-Id": str(test_user_employee.id)},
        json={"value": 60.0, "reason": "Trying to correct without write permission"},
    )
    assert correction_response.status_code == 403


@pytest.mark.asyncio
async def test_kri_initial_submission_non_priority_doesnt_require_privileged(
    client: AsyncClient,
    db_session: AsyncSession,
    test_role_employee,
    test_department,
):
    """Test initial submission to non-priority risk doesn't require privileged approval (only correction does)."""
    from app.models import Permission, Risk, RolePermission, User
    from app.models.risk import RiskStatus
    from app.models.user import AccessScope

    # Create employee user with kri:submit permission
    kri_submit = Permission(resource="kri", action="submit", description="Submit KRI values")
    db_session.add(kri_submit)
    await db_session.commit()

    db_session.add(RolePermission(role_id=test_role_employee.id, permission_id=kri_submit.id))
    await db_session.commit()

    employee = User(
        name="Initial Submission Employee",
        email="initial-submission-test@example.com",
        role_id=test_role_employee.id,
        department_id=test_department.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(employee)
    await db_session.commit()
    await db_session.refresh(employee)

    # Create non-priority risk
    risk = Risk(
        risk_id_code="RISK-NON-PRIORITY",
        name="Non-Priority Risk",
        process="Test Process",
        description="Non-priority risk for submission test",
        category="Test",
        department_id=test_department.id,
        owner_id=employee.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,  # Low scores = not priority
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
        is_priority=False,  # Explicitly non-priority
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    # Create KRI linked to non-priority risk
    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name="Non-Priority KRI",
        description="KRI for non-priority submission test",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    # Initial submission (not correction)
    response = await client.post(
        f"/api/v1/kris/{kri.id}/values", headers={"X-Mock-User-Id": str(employee.id)}, json={"value": 75.0}
    )

    assert response.status_code == 202
    data = response.json()
    # Initial submission for non-priority should NOT require privileged
    assert data.get("requires_privileged_approval") is False
