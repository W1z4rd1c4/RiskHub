"""Tests for KRI submission RBAC and approval flows."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.key_risk_indicator import KeyRiskIndicator, KRIFrequency

pytest_plugins = ("tests.backend.pytest.kri_history_api_support",)


@pytest.mark.asyncio
async def test_user_with_risks_write_without_kri_submit_is_denied(
    client: AsyncClient,
    db_session: AsyncSession,
    test_department,
):
    """
    FULL MODALITY TEST: User with risks:write but WITHOUT kri:submit is denied (403)
    unless they are the reporting owner.

    This proves that kri:submit is independent from risks:write.
    """
    from app.models import Permission, Role, RolePermission, User

    # Create a role with risks:write but NOT kri:submit
    role = Role(
        name="risk_editor_no_submit", display_name="Risk Editor", description="Can edit risks but not submit KRI values"
    )
    db_session.add(role)
    await db_session.commit()

    # Grant risks:write, risks:read only
    perms = [
        Permission(resource="risks", action="read", description="Read risks"),
        Permission(resource="risks", action="write", description="Edit risks"),
    ]
    for p in perms:
        db_session.add(p)
    await db_session.commit()

    for p in perms:
        db_session.add(RolePermission(role_id=role.id, permission_id=p.id))
    await db_session.commit()

    # Create user with this role
    user = User(
        name="Risk Editor No Submit",
        email="risk-editor-no-submit@example.com",
        role_id=role.id,
        department_id=test_department.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    # Create a KRI in the user's department (user is NOT reporting owner)
    from app.models import Risk
    from app.models.risk import RiskStatus

    risk = Risk(
        risk_id_code="RISK-NO-SUBMIT-TEST",
        process="Test Process",
        description="Risk for no-submit test",
        name="No Submit Test Risk",
        category="Test",
        department_id=test_department.id,
        owner_id=user.id,
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
        metric_name="No Submit KRI",
        description="No Submit KRI description",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
        reporting_owner_id=None,  # No reporting owner set
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    # Try to submit value - should be denied (403)
    response = await client.post(
        f"/api/v1/kris/{kri.id}/values", headers={"X-Mock-User-Id": str(user.id)}, json={"value": 75.0}
    )

    assert response.status_code == 403
    assert "kri:submit" in response.json()["detail"] or "Permission denied" in response.json()["detail"]


@pytest.mark.asyncio
async def test_user_with_kri_submit_can_submit_returns_202(
    client: AsyncClient,
    db_session: AsyncSession,
    test_department,
):
    """
    FULL MODALITY TEST: User with kri:submit (but not privileged) can submit
    and receives 202 with approval request.
    """
    from app.models import Permission, Role, RolePermission, User

    # Create a role with kri:submit only
    role = Role(name="kri_submitter", display_name="KRI Submitter", description="Can submit KRI values")
    db_session.add(role)
    await db_session.commit()

    # Grant kri:submit only
    kri_submit = Permission(resource="kri", action="submit", description="Submit KRI values")
    db_session.add(kri_submit)
    await db_session.commit()

    db_session.add(RolePermission(role_id=role.id, permission_id=kri_submit.id))
    await db_session.commit()

    # Create user with this role
    user = User(
        name="KRI Submitter",
        email="kri-submitter@example.com",
        role_id=role.id,
        department_id=test_department.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    # Create a KRI in the user's department
    from app.models import Risk
    from app.models.risk import RiskStatus

    risk = Risk(
        risk_id_code="RISK-SUBMIT-TEST",
        process="Test Process",
        description="Risk for submit test",
        name="Submit Test Risk",
        category="Test",
        department_id=test_department.id,
        owner_id=user.id,
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
        metric_name="Submit Test KRI",
        description="Submit Test KRI description",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    # Submit value - should succeed with 202 (creates approval)
    response = await client.post(
        f"/api/v1/kris/{kri.id}/values", headers={"X-Mock-User-Id": str(user.id)}, json={"value": 75.0}
    )

    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "approval_required"
    assert "approval_id" in data
    assert data["action_type"] == "edit"
    assert data["pending_fields"] == ["current_value", "period_end", "recorded_at"]

    # Verify KRI was NOT updated yet (pending approval)
    await db_session.refresh(kri)
    assert kri.current_value == 50.0


@pytest.mark.asyncio
async def test_reporting_owner_without_kri_submit_can_submit(
    client: AsyncClient,
    db_session: AsyncSession,
    test_department,
):
    """
    FULL MODALITY TEST: KRI reporting owner can submit values even without
    kri:submit permission. This is the cross-department exception.
    """
    from app.models import Department, Permission, Role, RolePermission, User

    # Create second department
    other_dept = Department(name="Other Department", code="OTHER-DEPT")
    db_session.add(other_dept)
    await db_session.commit()
    await db_session.refresh(other_dept)

    # Create a role with NO kri:submit (just basic read)
    role = Role(name="no_kri_perms", display_name="No KRI Perms", description="No KRI submission permissions")
    db_session.add(role)
    await db_session.commit()

    # Grant only risks:read (NOT kri:submit)
    read_perm = Permission(resource="risks", action="read", description="Read risks")
    db_session.add(read_perm)
    await db_session.commit()

    db_session.add(RolePermission(role_id=role.id, permission_id=read_perm.id))
    await db_session.commit()

    # Create user in OTHER department with this role
    user = User(
        name="Reporting Owner No Perms",
        email="reporting-owner@example.com",
        role_id=role.id,
        department_id=other_dept.id,  # Different department!
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    # Create a KRI in TEST department (different from user's department)
    # but user IS the reporting owner
    from app.models import Risk
    from app.models.risk import RiskStatus

    risk = Risk(
        risk_id_code="RISK-REPORTING-OWNER-TEST",
        process="Test Process",
        description="Risk for reporting owner test",
        name="Reporting Owner Test Risk",
        category="Test",
        department_id=test_department.id,  # Different department from user
        owner_id=None,
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
        metric_name="Reporting Owner KRI",
        description="Reporting Owner KRI description",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
        reporting_owner_id=user.id,  # User IS the reporting owner
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    # Submit value - should succeed (202) because user is reporting owner (non-privileged)
    response = await client.post(
        f"/api/v1/kris/{kri.id}/values", headers={"X-Mock-User-Id": str(user.id)}, json={"value": 75.0}
    )

    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "approval_required"
    assert "approval_id" in data


@pytest.mark.asyncio
async def test_approvals_write_without_kri_submit_is_denied(
    client: AsyncClient,
    db_session: AsyncSession,
    test_department,
):
    """
    FULL MODALITY TEST: User with ONLY approvals:write (but not kri:submit)
    should be DENIED from submitting KRI values.

    This proves approvals:write does not imply kri:submit.
    """
    from app.models import Permission, Role, RolePermission, User

    # Create a role with approvals:write but NOT kri:submit
    role = Role(name="approver_only", display_name="Approver Only", description="Can approve but not submit")
    db_session.add(role)
    await db_session.commit()

    # Grant approvals:write only
    approvals_perm = Permission(resource="approvals", action="write", description="Approve/reject requests")
    db_session.add(approvals_perm)
    await db_session.commit()

    db_session.add(RolePermission(role_id=role.id, permission_id=approvals_perm.id))
    await db_session.commit()

    # Create user with this role
    user = User(
        name="Approver Only",
        email="approver-only@example.com",
        role_id=role.id,
        department_id=test_department.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    # Create a KRI (user is not reporting owner)
    from app.models import Risk
    from app.models.risk import RiskStatus

    risk = Risk(
        risk_id_code="RISK-APPROVER-TEST",
        process="Test Process",
        description="Risk for approver test",
        name="Approver Test Risk",
        category="Test",
        department_id=test_department.id,
        owner_id=user.id,
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
        metric_name="Approver Test KRI",
        description="Approver Test KRI description",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
        reporting_owner_id=None,  # User is NOT reporting owner
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    # Try to submit value - should be DENIED (403)
    response = await client.post(
        f"/api/v1/kris/{kri.id}/values", headers={"X-Mock-User-Id": str(user.id)}, json={"value": 75.0}
    )

    assert response.status_code == 403
    assert "kri:submit" in response.json()["detail"] or "Permission denied" in response.json()["detail"]
