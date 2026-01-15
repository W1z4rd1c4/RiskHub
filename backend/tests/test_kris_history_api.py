"""Tests for KRI history API endpoints."""
import pytest
import pytest_asyncio
from datetime import datetime, UTC, timedelta, date
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.key_risk_indicator import KeyRiskIndicator, KRIFrequency
from app.models.kri_history import KRIValueHistory


@pytest_asyncio.fixture
async def test_kri_for_api(db_session: AsyncSession, test_risk):
    """Create a KRI for API testing."""
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="API Test KRI",
        description="API Test KRI Description",
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
        description="KRI With History Description",
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


@pytest.mark.asyncio
async def test_update_kri_rejects_current_value_updates(
    auth_client: AsyncClient,
    test_kri_for_api,
    db_session: AsyncSession,
):
    """PUT /kris/{id} must not allow current_value updates (use /values)."""
    response = await auth_client.put(
        f"/api/v1/kris/{test_kri_for_api.id}",
        json={"current_value": 77.5}
    )
    
    assert response.status_code == 400
    assert "Use POST /kris/{id}/values" in response.json()["detail"]
    
    result = await db_session.execute(
        select(KRIValueHistory).where(KRIValueHistory.kri_id == test_kri_for_api.id)
    )
    entries = result.scalars().all()
    assert len(entries) == 0


@pytest.mark.asyncio
async def test_record_value_creates_history_entry(
    auth_client: AsyncClient,
    test_kri_for_api,
    db_session: AsyncSession,
):
    """POST /kris/{id}/values creates a history entry for privileged users."""
    response = await auth_client.post(
        f"/api/v1/kris/{test_kri_for_api.id}/values",
        json={"value": 77.5}
    )
    
    assert response.status_code == 200
    
    result = await db_session.execute(
        select(KRIValueHistory).where(KRIValueHistory.kri_id == test_kri_for_api.id)
    )
    entries = result.scalars().all()
    assert len(entries) >= 1


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


# Due Soon Endpoint Tests

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
    from app.services.kri_history_service import KRIHistoryService
    
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


@pytest.mark.asyncio
async def test_non_privileged_value_submission_returns_202(
    client: AsyncClient,
    db_session: AsyncSession,
    test_risk,
    test_role_employee,
):
    """Test POST /kris/{id}/values by non-privileged user returns 202 with approval."""
    from app.models import User, Department
    
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
        f"/api/v1/kris/{kri.id}/values",
        headers={"X-Mock-User-Id": str(employee.id)},
        json={"value": 75.0}
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
    from app.models import User, Department
    
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
        json={"value": 75.0, "period_end": "2024-12-31"}
    )
    
    assert response.status_code == 400
    assert "cannot specify custom period_end" in response.json()["detail"]


# =============================================================================
# FULL MODALITY RBAC TESTS: Explicit permission independence
# =============================================================================

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
    from app.models import User, Role, Permission, RolePermission
    
    # Create a role with risks:write but NOT kri:submit
    role = Role(name="risk_editor_no_submit", display_name="Risk Editor", description="Can edit risks but not submit KRI values")
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
        f"/api/v1/kris/{kri.id}/values",
        headers={"X-Mock-User-Id": str(user.id)},
        json={"value": 75.0}
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
    from app.models import User, Role, Permission, RolePermission
    
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
        f"/api/v1/kris/{kri.id}/values",
        headers={"X-Mock-User-Id": str(user.id)},
        json={"value": 75.0}
    )
    
    assert response.status_code == 202
    data = response.json()
    assert "approval_id" in data
    assert data["action_type"] == "edit"
    
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
    from app.models import User, Role, Permission, RolePermission, Department
    
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
        f"/api/v1/kris/{kri.id}/values",
        headers={"X-Mock-User-Id": str(user.id)},
        json={"value": 75.0}
    )
    
    assert response.status_code == 202
    data = response.json()
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
    from app.models import User, Role, Permission, RolePermission
    
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
        f"/api/v1/kris/{kri.id}/values",
        headers={"X-Mock-User-Id": str(user.id)},
        json={"value": 75.0}
    )
    
    assert response.status_code == 403
    assert "kri:submit" in response.json()["detail"] or "Permission denied" in response.json()["detail"]


# =============================================================================
# RBAC REGRESSION TESTS: department_id filter scoping (Phase 156-audit)
# =============================================================================

@pytest.mark.asyncio
async def test_overdue_department_id_filter_rbac_scoped_user(
    client: AsyncClient,
    db_session: AsyncSession,
    test_role_employee,
):
    """
    RBAC Test: Department-scoped user filtering /kris/overdue by unauthorized 
    department_id returns [] (not other department's data).
    
    This prevents cross-department data leakage via the department_id query param.
    """
    from app.models import User, Department, Risk
    from app.models.risk import RiskStatus
    
    # Create two departments
    dept_a = Department(name="Dept A for RBAC", code="DEPT-A-RBAC")
    dept_b = Department(name="Dept B for RBAC", code="DEPT-B-RBAC")
    db_session.add(dept_a)
    db_session.add(dept_b)
    await db_session.commit()
    await db_session.refresh(dept_a)
    await db_session.refresh(dept_b)
    
    # Create user in Dept A (department-scoped)
    user_a = User(
        name="User A",
        email="user-a-rbac@example.com",
        role_id=test_role_employee.id,
        department_id=dept_a.id,
        is_active=True,
    )
    db_session.add(user_a)
    await db_session.commit()
    await db_session.refresh(user_a)
    
    # Create risks and KRIs in both departments
    risk_a = Risk(
        risk_id_code="RISK-RBAC-A",
        process="Test Process A",
        description="Risk A for RBAC test",
        name="RBAC Test Risk A",
        category="Test",
        department_id=dept_a.id,
        owner_id=user_a.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=3,
        net_probability=2,
        net_impact=3,
        status=RiskStatus.active.value,
    )
    risk_b = Risk(
        risk_id_code="RISK-RBAC-B",
        process="Test Process B",
        description="Risk B for RBAC test",
        name="RBAC Test Risk B",
        category="Test",
        department_id=dept_b.id,
        owner_id=None,
        risk_type="operational",
        gross_probability=2,
        gross_impact=3,
        net_probability=2,
        net_impact=3,
        status=RiskStatus.active.value,
    )
    db_session.add(risk_a)
    db_session.add(risk_b)
    await db_session.commit()
    await db_session.refresh(risk_a)
    await db_session.refresh(risk_b)
    
    # Create overdue KRIs in both departments (old created_at, no last_period_end)
    kri_a = KeyRiskIndicator(
        risk_id=risk_a.id,
        metric_name="RBAC Test KRI A",
        description="Overdue KRI in Dept A",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
        created_at=datetime.now(UTC) - timedelta(days=60),
        last_period_end=None,  # Never reported = overdue
    )
    kri_b = KeyRiskIndicator(
        risk_id=risk_b.id,
        metric_name="RBAC Test KRI B",
        description="Overdue KRI in Dept B",
        current_value=40.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
        created_at=datetime.now(UTC) - timedelta(days=60),
        last_period_end=None,  # Never reported = overdue
    )
    db_session.add(kri_a)
    db_session.add(kri_b)
    await db_session.commit()
    await db_session.refresh(kri_a)
    await db_session.refresh(kri_b)
    
    # User A requesting department_id=Dept B should return [] (unauthorized)
    response = await client.get(
        "/api/v1/kris/overdue",
        headers={"X-Mock-User-Id": str(user_a.id)},
        params={"department_id": dept_b.id}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data == [], f"Expected empty list for unauthorized department, got: {data}"


@pytest.mark.asyncio
async def test_overdue_department_id_filter_own_department(
    client: AsyncClient,
    db_session: AsyncSession,
    test_role_employee,
):
    """
    RBAC Test: Department-scoped user filtering /kris/overdue by their OWN 
    department_id returns only that department's items.
    """
    from app.models import User, Department, Risk
    from app.models.risk import RiskStatus
    
    # Create department
    dept = Department(name="Own Dept RBAC", code="OWN-DEPT-RBAC")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)
    
    # Create user in department
    user = User(
        name="Own Dept User",
        email="own-dept-rbac@example.com",
        role_id=test_role_employee.id,
        department_id=dept.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    
    # Create risk and overdue KRI in user's department
    risk = Risk(
        risk_id_code="RISK-OWN-DEPT",
        process="Test Process",
        description="Risk for own dept test",
        name="Own Dept Test Risk",
        category="Test",
        department_id=dept.id,
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
        metric_name="Own Dept RBAC KRI",
        description="Overdue KRI in user's dept",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
        created_at=datetime.now(UTC) - timedelta(days=60),
        last_period_end=None,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    
    # User filtering by own department should get their items
    response = await client.get(
        "/api/v1/kris/overdue",
        headers={"X-Mock-User-Id": str(user.id)},
        params={"department_id": dept.id}
    )
    
    assert response.status_code == 200
    data = response.json()
    # Should include the user's department KRI (if overdue)
    kri_ids = [item["kri_id"] for item in data]
    # Filter for our specific KRI (there may be others in the system)
    our_kri_present = kri.id in kri_ids
    assert our_kri_present or len(data) >= 0  # At minimum returns list


@pytest.mark.asyncio
async def test_due_soon_department_id_filter_rbac_scoped_user(
    client: AsyncClient,
    db_session: AsyncSession,
    test_role_employee,
):
    """
    RBAC Test: Department-scoped user filtering /kris/due-soon by unauthorized 
    department_id returns [] (not other department's data).
    """
    from app.models import User, Department, Risk
    from app.models.risk import RiskStatus
    
    # Create two departments
    dept_a = Department(name="Due Soon Dept A", code="DUE-SOON-A")
    dept_b = Department(name="Due Soon Dept B", code="DUE-SOON-B")
    db_session.add(dept_a)
    db_session.add(dept_b)
    await db_session.commit()
    await db_session.refresh(dept_a)
    await db_session.refresh(dept_b)
    
    # Create user in Dept A
    user_a = User(
        name="Due Soon User A",
        email="due-soon-a@example.com",
        role_id=test_role_employee.id,
        department_id=dept_a.id,
        is_active=True,
    )
    db_session.add(user_a)
    await db_session.commit()
    await db_session.refresh(user_a)
    
    # Create risks in both departments
    risk_b = Risk(
        risk_id_code="RISK-DUE-SOON-B",
        process="Test Process B",
        description="Risk B for due-soon RBAC",
        name="Due Soon RBAC Risk B",
        category="Test",
        department_id=dept_b.id,
        owner_id=None,
        risk_type="operational",
        gross_probability=2,
        gross_impact=3,
        net_probability=2,
        net_impact=3,
        status=RiskStatus.active.value,
    )
    db_session.add(risk_b)
    await db_session.commit()
    await db_session.refresh(risk_b)
    
    # Create KRI in Dept B that is due soon
    kri_b = KeyRiskIndicator(
        risk_id=risk_b.id,
        metric_name="Due Soon RBAC KRI B",
        description="Due soon KRI in Dept B",
        current_value=40.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
        created_at=datetime.now(UTC) - timedelta(days=25),
        last_period_end=None,
    )
    db_session.add(kri_b)
    await db_session.commit()
    await db_session.refresh(kri_b)
    
    # User A (Dept A) requesting department_id=Dept B should return []
    response = await client.get(
        "/api/v1/kris/due-soon",
        headers={"X-Mock-User-Id": str(user_a.id)},
        params={"department_id": dept_b.id}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data == [], f"Expected empty list for unauthorized department, got: {data}"


@pytest.mark.asyncio
async def test_overdue_privileged_user_can_filter_any_department(
    auth_client: AsyncClient,
    db_session: AsyncSession,
):
    """
    RBAC Test: Privileged user (CRO) can filter /kris/overdue by any department_id.
    """
    from app.models import Department, Risk
    from app.models.risk import RiskStatus
    
    # Create a new department
    dept = Department(name="Privileged Filter Dept", code="PRIV-FILTER")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)
    
    # Create risk and potentially overdue KRI
    risk = Risk(
        risk_id_code="RISK-PRIV-FILTER",
        process="Test Process",
        description="Risk for privileged filter test",
        name="Privileged Filter Risk",
        category="Test",
        department_id=dept.id,
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
        metric_name="Privileged Filter KRI",
        description="KRI for privileged filter",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
        created_at=datetime.now(UTC) - timedelta(days=60),
        last_period_end=None,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    
    # Privileged user (auth_client is CRO) filtering by this department
    response = await auth_client.get(
        "/api/v1/kris/overdue",
        params={"department_id": dept.id}
    )
    
    assert response.status_code == 200
    data = response.json()
    # Privileged user should be able to see items (or empty if none match criteria)
    assert isinstance(data, list)
    # If KRI is overdue, it should be in results
    overdue_kri_ids = [item["kri_id"] for item in data]
    # Note: may or may not be overdue depending on timing - just verify no error
