"""Tests for KRI value submission API endpoints."""

import logging
from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ActivityAction,
    ActivityEntityType,
    ActivityLog,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalScenario,
    Department,
    Permission,
    Risk,
    Role,
    RolePermission,
    User,
    Vendor,
    VendorKRILink,
)
from app.models.key_risk_indicator import KeyRiskIndicator, KRIFrequency
from app.models.kri_history import KRIValueHistory
from app.models.risk import RiskStatus
from app.models.user import AccessScope
from app.services._riskhub_config.approval_scenario_roles import set_approval_scenario_roles
from app.services.kri_history_service import KRIHistoryService

pytest_plugins = ("tests.backend.pytest.kri_history_api_support",)


async def _upsert_kri_value_submit_scenario(
    db_session: AsyncSession,
    *,
    requires_approval: bool,
) -> ApprovalScenario:
    scenario = await db_session.scalar(select(ApprovalScenario).where(ApprovalScenario.key == "kri_value_submit"))
    if scenario is None:
        scenario = ApprovalScenario(
            key="kri_value_submit",
            display_name="Submit KRI Value",
            description="Approval required when submitting a new KRI measurement value",
        )
        db_session.add(scenario)
    scenario.requires_approval = requires_approval
    set_approval_scenario_roles(scenario, ["risk_owner", "risk_manager", "cro"])
    await db_session.commit()
    await db_session.refresh(scenario)
    return scenario


async def _create_non_privileged_submitter_with_kri(
    db_session: AsyncSession,
    test_role_employee,
    *,
    suffix: str,
) -> tuple[User, KeyRiskIndicator]:
    kri_submit = await db_session.scalar(
        select(Permission).where(Permission.resource == "kri", Permission.action == "submit")
    )
    if kri_submit is None:
        kri_submit = Permission(resource="kri", action="submit", description="Submit KRI values")
        db_session.add(kri_submit)
        await db_session.flush()

    role_permission = await db_session.scalar(
        select(RolePermission).where(
            RolePermission.role_id == test_role_employee.id,
            RolePermission.permission_id == kri_submit.id,
        )
    )
    if role_permission is None:
        db_session.add(RolePermission(role_id=test_role_employee.id, permission_id=kri_submit.id))

    dept = Department(name=f"Disabled Approval Dept {suffix}", code=f"DIS-KRI-{suffix}", is_active=True)
    db_session.add(dept)
    await db_session.flush()

    employee = User(
        name=f"Disabled Approval Employee {suffix}",
        email=f"disabled-kri-{suffix.lower()}@example.com",
        role_id=test_role_employee.id,
        department_id=dept.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(employee)
    await db_session.flush()

    risk = Risk(
        risk_id_code=f"RISK-DIS-KRI-{suffix}",
        name=f"Disabled Approval Risk {suffix}",
        process="Test Process",
        description="Risk for disabled KRI submission approval",
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
    await db_session.flush()

    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name=f"Disabled Approval KRI {suffix}",
        description="KRI for disabled approval submission tests",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.quarterly.value,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(employee)
    await db_session.refresh(kri)
    return employee, kri


async def _ensure_permission(db_session: AsyncSession, resource: str, action: str) -> Permission:
    permission = await db_session.scalar(
        select(Permission).where(Permission.resource == resource, Permission.action == action)
    )
    if permission is None:
        permission = Permission(resource=resource, action=action, description=f"{resource}:{action}")
        db_session.add(permission)
        await db_session.flush()
    return permission


async def _create_submitter_with_linked_vendor(
    db_session: AsyncSession,
    *,
    suffix: str,
    can_read_vendors: bool,
) -> tuple[User, KeyRiskIndicator, Vendor]:
    permissions = [
        await _ensure_permission(db_session, "risks", "read"),
        await _ensure_permission(db_session, "kri", "submit"),
    ]
    if can_read_vendors:
        permissions.append(await _ensure_permission(db_session, "vendors", "read"))

    role = Role(
        name=f"kri-submit-{suffix.lower()}",
        display_name=f"KRI Submit {suffix}",
        description="Test role for KRI submission vendor visibility",
        is_system=False,
        is_active=True,
    )
    db_session.add(role)
    await db_session.flush()
    db_session.add_all(RolePermission(role_id=role.id, permission_id=permission.id) for permission in permissions)

    dept = Department(name=f"KRI Vendor Visibility Dept {suffix}", code=f"KRI-VEND-{suffix}", is_active=True)
    db_session.add(dept)
    await db_session.flush()

    employee = User(
        name=f"KRI Vendor Visibility User {suffix}",
        email=f"kri-vendor-visibility-{suffix.lower()}@example.com",
        role_id=role.id,
        department_id=dept.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(employee)
    await db_session.flush()

    risk = Risk(
        risk_id_code=f"RISK-KRI-VEND-{suffix}",
        name=f"KRI Vendor Visibility Risk {suffix}",
        process="Test Process",
        description="Risk for KRI vendor visibility tests",
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
    await db_session.flush()

    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name=f"KRI Vendor Visibility {suffix}",
        description="KRI for linked vendor response tests",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.quarterly.value,
    )
    db_session.add(kri)
    await db_session.flush()

    vendor = Vendor(
        name=f"Linked Vendor {suffix}",
        process="Vendor Process",
        department_id=dept.id,
        outsourcing_owner_user_id=employee.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    db_session.add(vendor)
    await db_session.flush()
    db_session.add(VendorKRILink(vendor_id=vendor.id, kri_id=kri.id))
    await db_session.commit()
    await db_session.refresh(employee)
    await db_session.refresh(kri)
    await db_session.refresh(vendor)
    return employee, kri, vendor


async def _count_kri_submission_approvals(db_session: AsyncSession, kri_id: int) -> int:
    count = await db_session.scalar(
        select(func.count())
        .select_from(ApprovalRequest)
        .where(
            ApprovalRequest.resource_type == ApprovalResourceType.KRI,
            ApprovalRequest.resource_id == kri_id,
        )
    )
    return int(count or 0)


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
async def test_direct_record_value_creates_kri_value_activity(
    auth_client: AsyncClient,
    test_kri_for_api,
    db_session: AsyncSession,
    frozen_clock,
):
    response = await auth_client.post(f"/api/v1/kris/{test_kri_for_api.id}/values", json={"value": 78.5})

    assert response.status_code == 200
    history_entry = await db_session.scalar(
        select(KRIValueHistory).where(KRIValueHistory.kri_id == test_kri_for_api.id)
    )
    assert history_entry is not None

    activity = await db_session.scalar(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.KRI_VALUE.value,
            ActivityLog.entity_id == history_entry.id,
            ActivityLog.action == ActivityAction.CREATE.value,
        )
    )
    assert activity is not None
    assert activity.created_at.date().isoformat() == "2026-05-07"
    assert activity.changes["value"] == {"old": None, "new": 78.5}
    assert activity.changes["period_end"]["new"] == history_entry.period_end.isoformat()

    kri_update = await db_session.scalar(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.KRI.value,
            ActivityLog.entity_id == test_kri_for_api.id,
            ActivityLog.action == ActivityAction.UPDATE.value,
        )
    )
    assert kri_update is not None
    assert kri_update.changes["current_value"]["new"] == 78.5
    assert kri_update.changes["last_period_end"]["new"] == "[REDACTED]"


@pytest.mark.asyncio
async def test_direct_record_value_persists_when_breach_notification_flush_fails(
    auth_client: AsyncClient,
    test_kri_for_api,
    test_user: User,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
):
    """Best-effort breach notification failures must not roll back the recorded KRI value."""
    from app.models.notification import Notification

    test_kri_for_api.reporting_owner_id = test_user.id
    test_kri_for_api.lower_limit = 0.0
    test_kri_for_api.upper_limit = 100.0
    await db_session.commit()

    async def poison_notification_flush(**kwargs):
        db = kwargs["db"]
        db.add(
            Notification(
                user_id=None,
                type=kwargs["notification_type"],
                title="Poisoned notification",
                message="This intentionally violates the notification user_id constraint.",
                resource_type=kwargs.get("resource_type"),
                resource_id=kwargs.get("resource_id"),
            )
        )
        await db.flush()

    monkeypatch.setattr(
        "app.services.notification_service.NotificationService.create_notification",
        poison_notification_flush,
    )

    with caplog.at_level(logging.WARNING, logger="app.services._kri_history.direct_application"):
        response = await auth_client.post(f"/api/v1/kris/{test_kri_for_api.id}/values", json={"value": 150.0})

    assert response.status_code == 200
    warning_messages = "\n".join(record.getMessage() for record in caplog.records)
    assert "Failed to notify KRI reporting owner about breach" in warning_messages
    assert "Failed to notify Risk owner about KRI breach" in warning_messages
    await db_session.refresh(test_kri_for_api)
    assert test_kri_for_api.current_value == 150.0
    history_entry = await db_session.scalar(
        select(KRIValueHistory).where(
            KRIValueHistory.kri_id == test_kri_for_api.id,
            KRIValueHistory.value == 150.0,
        )
    )
    assert history_entry is not None


@pytest.mark.asyncio
async def test_direct_kri_value_recording_uses_utc_today_for_default_period(
    db_session: AsyncSession,
    test_risk,
    test_user,
    monkeypatch: pytest.MonkeyPatch,
):
    """Default period selection must follow UTC, not the host-local date."""
    utc_instant = datetime(2026, 5, 1, 0, 30, tzinfo=UTC)

    class HostLocalDate(date):
        @classmethod
        def today(cls):
            return cls(2026, 4, 30)

    monkeypatch.setattr("app.services._kri_history.clock.date", HostLocalDate)
    monkeypatch.setattr("app.services._kri_history.clock.utc_now", lambda: utc_instant, raising=False)
    monkeypatch.setattr("app.services._kri_history.recording.utc_now", lambda: utc_instant)

    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="UTC Period KRI",
        description="KRI used to verify UTC period selection",
        current_value=10.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.daily.value,
    )
    db_session.add(kri)
    await db_session.flush()

    history_entry = await KRIHistoryService.record_value(
        db=db_session,
        kri=kri,
        value=25.0,
        recorded_by_id=test_user.id,
        is_privileged=True,
    )

    assert history_entry.period_end == date(2026, 5, 1)


@pytest.mark.asyncio
async def test_privileged_record_value_rejects_future_recorded_at(
    auth_client: AsyncClient,
    test_kri_for_api,
    db_session: AsyncSession,
):
    """Direct privileged submissions must not future-date recorded_at."""
    future_recorded_at = datetime.now(UTC) + timedelta(days=1)

    response = await auth_client.post(
        f"/api/v1/kris/{test_kri_for_api.id}/values",
        json={"value": 77.5, "recorded_at": future_recorded_at.isoformat()},
    )

    assert response.status_code == 400
    assert "recorded_at cannot be in the future" in response.json()["detail"]
    count = await db_session.scalar(
        select(func.count()).select_from(KRIValueHistory).where(KRIValueHistory.kri_id == test_kri_for_api.id)
    )
    assert count == 0


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
    assert data["pending_changes"]["period_end"]["old"] is None
    assert data["pending_changes"]["period_end"]["new"] == "2026-04-30"
    assert data["pending_changes"]["recorded_at"]["old"] is None
    assert data["pending_changes"]["recorded_at"]["new"]

    approval = await db_session.get(ApprovalRequest, data["approval_id"])
    assert approval is not None
    assert approval.primary_approver_id is None

    # Verify KRI was NOT updated
    await db_session.refresh(kri)
    assert kri.current_value == 50.0  # Still original value


@pytest.mark.asyncio
async def test_disabled_kri_value_submit_scenario_applies_with_non_privileged_window_rules(
    client: AsyncClient,
    db_session: AsyncSession,
    test_role_employee,
    monkeypatch: pytest.MonkeyPatch,
):
    """Disabling value-submit approval applies immediately without upgrading requester authority."""
    import app.services._kri_history.clock as kri_clock

    monkeypatch.setattr(kri_clock, "today", lambda: date(2026, 4, 10))
    await _upsert_kri_value_submit_scenario(db_session, requires_approval=False)
    employee, kri = await _create_non_privileged_submitter_with_kri(
        db_session,
        test_role_employee,
        suffix="WINDOW",
    )

    response = await client.post(
        f"/api/v1/kris/{kri.id}/values",
        headers={"X-Mock-User-Id": str(employee.id)},
        json={"value": 75.0},
    )

    assert response.status_code == 200
    assert response.json()["current_value"] == 75.0
    await db_session.refresh(kri)
    assert kri.current_value == 75.0
    assert kri.last_period_end == date(2026, 3, 31)
    assert await _count_kri_submission_approvals(db_session, kri.id) == 0

    history_count = await db_session.scalar(
        select(func.count()).select_from(KRIValueHistory).where(KRIValueHistory.kri_id == kri.id)
    )
    assert history_count == 1

    activity_count = await db_session.scalar(
        select(func.count())
        .select_from(ActivityLog)
        .where(
            ActivityLog.entity_id.in_([kri.id]),
            ActivityLog.entity_type == ActivityEntityType.KRI.value,
            ActivityLog.action == ActivityAction.UPDATE.value,
        )
    )
    assert activity_count == 1


@pytest.mark.asyncio
async def test_disabled_kri_value_submit_scenario_preserves_closed_window_rejection(
    client: AsyncClient,
    db_session: AsyncSession,
    test_role_employee,
    monkeypatch: pytest.MonkeyPatch,
):
    import app.services._kri_history.clock as kri_clock

    monkeypatch.setattr(kri_clock, "today", lambda: date(2026, 4, 20))
    await _upsert_kri_value_submit_scenario(db_session, requires_approval=False)
    employee, kri = await _create_non_privileged_submitter_with_kri(
        db_session,
        test_role_employee,
        suffix="CLOSED",
    )

    response = await client.post(
        f"/api/v1/kris/{kri.id}/values",
        headers={"X-Mock-User-Id": str(employee.id)},
        json={"value": 75.0},
    )

    assert response.status_code == 400
    assert "Reporting window closed" in response.json()["detail"]
    await db_session.refresh(kri)
    assert kri.current_value == 50.0
    assert await _count_kri_submission_approvals(db_session, kri.id) == 0
    history_count = await db_session.scalar(
        select(func.count()).select_from(KRIValueHistory).where(KRIValueHistory.kri_id == kri.id)
    )
    assert history_count == 0


@pytest.mark.asyncio
async def test_disabled_kri_value_submit_scenario_still_rejects_custom_period_end(
    client: AsyncClient,
    db_session: AsyncSession,
    test_role_employee,
    monkeypatch: pytest.MonkeyPatch,
):
    import app.services._kri_history.clock as kri_clock

    monkeypatch.setattr(kri_clock, "today", lambda: date(2026, 4, 10))
    await _upsert_kri_value_submit_scenario(db_session, requires_approval=False)
    employee, kri = await _create_non_privileged_submitter_with_kri(
        db_session,
        test_role_employee,
        suffix="CUSTOM",
    )

    response = await client.post(
        f"/api/v1/kris/{kri.id}/values",
        headers={"X-Mock-User-Id": str(employee.id)},
        json={"value": 75.0, "period_end": "2025-12-31"},
    )

    assert response.status_code == 400
    assert "cannot specify custom period_end" in response.json()["detail"]
    assert await _count_kri_submission_approvals(db_session, kri.id) == 0
    history_count = await db_session.scalar(
        select(func.count()).select_from(KRIValueHistory).where(KRIValueHistory.kri_id == kri.id)
    )
    assert history_count == 0


@pytest.mark.asyncio
async def test_disabled_kri_value_submit_scenario_redacts_unreadable_linked_vendors(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    import app.services._kri_history.clock as kri_clock

    monkeypatch.setattr(kri_clock, "today", lambda: date(2026, 4, 10))
    await _upsert_kri_value_submit_scenario(db_session, requires_approval=False)
    employee, kri, _vendor = await _create_submitter_with_linked_vendor(
        db_session,
        suffix="REDACT",
        can_read_vendors=False,
    )

    response = await client.post(
        f"/api/v1/kris/{kri.id}/values",
        headers={"X-Mock-User-Id": str(employee.id)},
        json={"value": 75.0},
    )

    assert response.status_code == 200
    assert response.json()["linked_vendors"] == []
    assert await _count_kri_submission_approvals(db_session, kri.id) == 0


@pytest.mark.asyncio
async def test_disabled_kri_value_submit_scenario_returns_readable_linked_vendors(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    import app.services._kri_history.clock as kri_clock

    monkeypatch.setattr(kri_clock, "today", lambda: date(2026, 4, 10))
    await _upsert_kri_value_submit_scenario(db_session, requires_approval=False)
    employee, kri, vendor = await _create_submitter_with_linked_vendor(
        db_session,
        suffix="VISIBLE",
        can_read_vendors=True,
    )

    response = await client.post(
        f"/api/v1/kris/{kri.id}/values",
        headers={"X-Mock-User-Id": str(employee.id)},
        json={"value": 75.0},
    )

    assert response.status_code == 200
    assert response.json()["linked_vendors"] == [
        {"id": vendor.id, "name": vendor.name, "is_archived": False}
    ]


@pytest.mark.asyncio
async def test_privileged_record_value_returns_readable_linked_vendors(
    auth_client: AsyncClient,
    test_kri_for_api: KeyRiskIndicator,
    test_user: User,
    db_session: AsyncSession,
):
    vendor = Vendor(
        name="Privileged Visible KRI Vendor",
        process="Vendor Process",
        department_id=test_user.department_id,
        outsourcing_owner_user_id=test_user.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
    )
    db_session.add(vendor)
    await db_session.flush()
    db_session.add(VendorKRILink(vendor_id=vendor.id, kri_id=test_kri_for_api.id))
    await db_session.commit()
    await db_session.refresh(vendor)

    response = await auth_client.post(f"/api/v1/kris/{test_kri_for_api.id}/values", json={"value": 82.0})

    assert response.status_code == 200
    assert response.json()["linked_vendors"] == [
        {"id": vendor.id, "name": vendor.name, "is_archived": False}
    ]


@pytest.mark.asyncio
async def test_non_privileged_value_submission_uses_kri_history_clock(
    client: AsyncClient,
    db_session: AsyncSession,
    test_role_employee,
    monkeypatch: pytest.MonkeyPatch,
):
    """Latest closed period for non-privileged submissions should be driven by the injectable KRI clock."""
    import app.services._kri_history.clock as kri_clock
    from app.models import Department, Permission, Risk, RolePermission, User
    from app.models.risk import RiskStatus
    from app.models.user import AccessScope

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
    assert response.json()["pending_changes"]["period_end"]["new"] == "2026-03-31"


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
