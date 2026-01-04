"""Tests for approval request endpoints."""
import pytest
from datetime import datetime, UTC, date
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ApprovalRequest, ApprovalStatus, ApprovalResourceType, ApprovalActionType,
    KeyRiskIndicator,
)
from app.models.kri_history import KRIValueHistory
from app.models.key_risk_indicator import KRIFrequency
from app.services.kri_history_service import KRIHistoryService


@pytest.mark.asyncio
async def test_list_approvals_empty(auth_client: AsyncClient):
    """Test listing approval requests returns paginated response."""
    response = await auth_client.get("/api/v1/approvals")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "skip" in data
    assert "limit" in data


@pytest.mark.asyncio
async def test_list_approvals_with_status_filter(auth_client: AsyncClient):
    """Test filtering approval requests by status."""
    response = await auth_client.get("/api/v1/approvals?status=pending")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data


@pytest.mark.asyncio
async def test_get_pending_count(auth_client: AsyncClient):
    """Test getting pending approval count for badge."""
    response = await auth_client.get("/api/v1/approvals/pending/count")
    assert response.status_code == 200
    data = response.json()
    assert "count" in data
    assert isinstance(data["count"], int)


@pytest.mark.asyncio
async def test_create_approval_requires_reason(auth_client: AsyncClient, test_risk):
    """Test creating approval request requires mandatory reason."""
    # Missing reason should fail validation
    response = await auth_client.post(
        "/api/v1/approvals",
        json={"resource_type": "risk", "resource_id": test_risk.id}
    )
    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_create_approval_with_reason(auth_client: AsyncClient, test_risk):
    """Test creating approval request with reason succeeds."""
    response = await auth_client.post(
        "/api/v1/approvals",
        json={
            "resource_type": "risk",
            "resource_id": test_risk.id,
            "reason": "No longer applicable to business"
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "pending"
    assert data["resource_type"] == "risk"
    assert data["reason"] == "No longer applicable to business"


@pytest.mark.asyncio
async def test_duplicate_pending_request_rejected(auth_client: AsyncClient, test_risk):
    """Test cannot create duplicate pending request for same resource."""
    # Create first request
    response = await auth_client.post(
        "/api/v1/approvals",
        json={
            "resource_type": "risk",
            "resource_id": test_risk.id,
            "reason": "First request"
        }
    )
    assert response.status_code == 201
    
    # Try to create second request - should fail
    response = await auth_client.post(
        "/api/v1/approvals",
        json={
            "resource_type": "risk",
            "resource_id": test_risk.id,
            "reason": "Second request"
        }
    )
    assert response.status_code == 400
    assert "already pending" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_approval_by_id(auth_client: AsyncClient, test_risk):
    """Test getting single approval request by ID."""
    # Create request first
    create_response = await auth_client.post(
        "/api/v1/approvals",
        json={
            "resource_type": "risk",
            "resource_id": test_risk.id,
            "reason": "Test reason"
        }
    )
    approval_id = create_response.json()["id"]
    
    # Get by ID
    response = await auth_client.get(f"/api/v1/approvals/{approval_id}")
    assert response.status_code == 200
    assert response.json()["id"] == approval_id


@pytest.mark.asyncio
async def test_cancel_own_request(auth_client: AsyncClient, test_risk):
    """Test user can cancel their own pending request."""
    # Create request
    create_response = await auth_client.post(
        "/api/v1/approvals",
        json={
            "resource_type": "risk",
            "resource_id": test_risk.id,
            "reason": "Test reason"
        }
    )
    approval_id = create_response.json()["id"]
    
    # Cancel it
    response = await auth_client.post(f"/api/v1/approvals/{approval_id}/cancel")
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_cannot_cancel_already_resolved_request(auth_client: AsyncClient, test_risk):
    """Test cannot cancel an already-approved request."""
    # Create request
    create_response = await auth_client.post(
        "/api/v1/approvals",
        json={
            "resource_type": "risk",
            "resource_id": test_risk.id,
            "reason": "Test reason"
        }
    )
    approval_id = create_response.json()["id"]
    
    # Approve it (auth_client has admin role)
    await auth_client.post(
        f"/api/v1/approvals/{approval_id}/approve",
        json={"resolution_notes": "Approved"}
    )
    
    # Try to cancel - should fail
    response = await auth_client.post(f"/api/v1/approvals/{approval_id}/cancel")
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_cannot_approve_already_resolved_request(auth_client: AsyncClient, test_risk):
    """Test cannot approve an already-rejected request."""
    # Create request
    create_response = await auth_client.post(
        "/api/v1/approvals",
        json={
            "resource_type": "risk",
            "resource_id": test_risk.id,
            "reason": "Test reason"
        }
    )
    approval_id = create_response.json()["id"]
    
    # Reject it first
    await auth_client.post(
        f"/api/v1/approvals/{approval_id}/reject",
        json={"resolution_notes": "Rejected"}
    )
    
    # Try to approve - should fail
    response = await auth_client.post(
        f"/api/v1/approvals/{approval_id}/approve",
        json={"resolution_notes": "Try again"}
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_update_blocked_during_pending_delete(auth_client: AsyncClient, test_risk):
    """Test that PATCH is blocked when a delete approval is pending."""
    # Create a delete request
    await auth_client.post(
        "/api/v1/approvals",
        json={
            "resource_type": "risk",
            "resource_id": test_risk.id,
            "reason": "Pending delete"
        }
    )
    
    # Try to update the risk - should get 409 Conflict
    response = await auth_client.patch(
        f"/api/v1/risks/{test_risk.id}",
        json={"description": "Trying to edit while delete pending"}
    )
    assert response.status_code == 409
    assert "pending" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_approval_cross_department_forbidden(
    client: AsyncClient,
    db_session,
    test_role_employee,
):
    """
    Users should not be able to create approval requests for resources
    in departments they don't have access to.
    """
    from app.models import User, Department, Risk
    from app.models.risk import RiskStatus as RiskStatusEnum
    
    # Create two departments
    dept_a = Department(name="Department A", code="DEPT-A")
    dept_b = Department(name="Department B", code="DEPT-B")
    db_session.add_all([dept_a, dept_b])
    await db_session.commit()
    await db_session.refresh(dept_a)
    await db_session.refresh(dept_b)
    
    # Create user in Department A
    user_in_a = User(
        name="User A",
        email="user-a@example.com",
        role_id=test_role_employee.id,
        department_id=dept_a.id,
        is_active=True,
    )
    db_session.add(user_in_a)
    await db_session.commit()
    await db_session.refresh(user_in_a)
    
    # Create risk in Department B
    risk_in_b = Risk(
        risk_id_code="RISK-CROSS-DEPT",
        name="Cross-Department Risk",
        process="Cross-department test",
        description="Risk in department B",
        category="Test",
        department_id=dept_b.id,
        owner_id=user_in_a.id,  # Owner doesn't matter, testing dept access
        risk_type="operational",
        gross_probability=2,
        gross_impact=3,
        net_probability=2,
        net_impact=3,
        status=RiskStatusEnum.active.value,
    )
    db_session.add(risk_in_b)
    await db_session.commit()
    await db_session.refresh(risk_in_b)
    
    # Try to create approval request as user_in_a for risk_in_b
    response = await client.post(
        "/api/v1/approvals",
        headers={"X-Mock-User-Id": str(user_in_a.id)},
        json={
            "resource_type": "risk",
            "resource_id": risk_in_b.id,
            "reason": "Should not be allowed"
        }
    )
    
    # Should get 403 Forbidden
    assert response.status_code == 403
    assert "department" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_approve_kri_history_correction_applies_change(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_risk,
    test_user,
):
    """Test approving a KRI history correction updates the entry and current value."""
    period_start, period_end = KRIHistoryService.latest_closed_period_for_date(
        date.today(), KRIFrequency.monthly.value
    )
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="Approval KRI",
        description="KRI used to test approval history correction",
        current_value=45.0,
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
        period_start=period_start,
        period_end=period_end,
        recorded_at=datetime.now(UTC),
        recorded_by_id=test_user.id,
        value=45.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        breach_status="within",
    )
    db_session.add(history_entry)
    await db_session.commit()
    await db_session.refresh(history_entry)
    
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.KRI,
        resource_id=kri.id,
        resource_name="Approval KRI (history correction)",
        requested_by_id=test_user.id,
        reason="Correction required",
        action_type=ApprovalActionType.EDIT,
        pending_changes={
            "history_entry_id": history_entry.id,
            "old_value": 45.0,
            "new_value": 60.0,
            "reason": "Fix misreported value",
            "period_end": period_end.isoformat(),
        },
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval)
    await db_session.commit()
    await db_session.refresh(approval)
    
    response = await auth_client.post(
        f"/api/v1/approvals/{approval.id}/approve",
        json={"resolution_notes": "Approved correction"}
    )
    assert response.status_code == 200
    
    await db_session.refresh(history_entry)
    await db_session.refresh(kri)
    assert history_entry.value == 60.0
    assert kri.current_value == 60.0


@pytest.mark.asyncio
async def test_approve_kri_value_submission_with_period_end(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_risk,
    test_user,
):
    """Test approving a KRI value submission records history with period_end."""
    today = date.today()
    _, current_period_end = KRIHistoryService.period_bounds_for_date(
        today, KRIFrequency.monthly.value
    )
    
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="Value Submission KRI",
        description="KRI used to test value submission approvals",
        current_value=30.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    
    # Create an approval request that simulates a value submission
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.KRI,
        resource_id=kri.id,
        resource_name="Value Submission KRI (value submission)",
        requested_by_id=test_user.id,
        reason="KRI value submission: 55.0",
        action_type=ApprovalActionType.EDIT,
        pending_changes={
            "current_value": {"old": 30.0, "new": 55.0},
            "period_end": current_period_end.isoformat(),
            "recorded_at": datetime.now(UTC).isoformat(),
        },
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval)
    await db_session.commit()
    await db_session.refresh(approval)
    
    # Approve the request
    response = await auth_client.post(
        f"/api/v1/approvals/{approval.id}/approve",
        json={"resolution_notes": "Approved value submission"}
    )
    assert response.status_code == 200
    
    # Verify KRI value was updated
    await db_session.refresh(kri)
    assert kri.current_value == 55.0
    assert kri.last_period_end == current_period_end
    
    # Verify history entry was created
    from sqlalchemy import select
    result = await db_session.execute(
        select(KRIValueHistory).where(
            KRIValueHistory.kri_id == kri.id,
            KRIValueHistory.period_end == current_period_end,
        )
    )
    entry = result.scalar_one_or_none()
    assert entry is not None
    assert entry.value == 55.0


@pytest.mark.asyncio
async def test_kri_approval_cross_department_denied(
    client: AsyncClient,
    db_session: AsyncSession,
    test_role_employee,
):
    """
    Test that KRI approval creation is denied for cross-department requests,
    and that admin can create with correct resource_name (metric_name).
    """
    from app.models import User, Department, Risk, KeyRiskIndicator
    from app.models.risk import RiskStatus as RiskStatusEnum
    from app.models.user import AccessScope
    from app.models.role import Role
    
    # Create two departments
    dept_a = Department(name="Dept Alpha", code="DEPT-ALPHA")
    dept_b = Department(name="Dept Beta", code="DEPT-BETA")
    db_session.add_all([dept_a, dept_b])
    await db_session.commit()
    await db_session.refresh(dept_a)
    await db_session.refresh(dept_b)
    
    # Create employee user in Department A (department scope)
    user_in_a = User(
        name="KRI User A",
        email="kri-user-a@example.com",
        role_id=test_role_employee.id,
        department_id=dept_a.id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    db_session.add(user_in_a)
    await db_session.commit()
    await db_session.refresh(user_in_a)
    
    # Find an existing admin role or create one with required fields
    admin_role = await db_session.execute(
        select(Role).where(Role.name == "admin")
    )
    admin_role = admin_role.scalar_one_or_none()
    if not admin_role:
        from app.models.role import RoleType
        admin_role = Role(name=RoleType.ADMIN, display_name="Administrator")
        db_session.add(admin_role)
        await db_session.commit()
        await db_session.refresh(admin_role)
    
    admin_user = User(
        name="KRI Admin",
        email="kri-admin@example.com",
        role_id=admin_role.id,
        department_id=dept_b.id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    db_session.add(admin_user)
    await db_session.commit()
    await db_session.refresh(admin_user)
    
    # Create risk in Department B
    risk_in_b = Risk(
        risk_id_code="RISK-KRI-TEST",
        name="Risk for KRI Approval",
        process="KRI Test Process",
        description="Risk for KRI approval test",
        category="Test",
        department_id=dept_b.id,
        owner_id=admin_user.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=3,
        net_probability=2,
        net_impact=3,
        status=RiskStatusEnum.active.value,
    )
    db_session.add(risk_in_b)
    await db_session.commit()
    await db_session.refresh(risk_in_b)
    
    # Create KRI linked to that risk
    kri = KeyRiskIndicator(
        risk_id=risk_in_b.id,
        metric_name="Cross-Department KRI Metric",
        description="KRI metric for cross-department approval test",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    
    # Employee from dept A tries to create KRI approval → 403
    response = await client.post(
        "/api/v1/approvals",
        headers={"X-Mock-User-Id": str(user_in_a.id)},
        json={
            "resource_type": "kri",
            "resource_id": kri.id,
            "reason": "Should be blocked",
        },
    )
    assert response.status_code == 403
    assert "department" in response.json()["detail"].lower()
    
    # Admin can create the approval and resource_name uses metric_name
    admin_resp = await client.post(
        "/api/v1/approvals",
        headers={"X-Mock-User-Id": str(admin_user.id)},
        json={
            "resource_type": "kri",
            "resource_id": kri.id,
            "reason": "Valid admin request",
        },
    )
    assert admin_resp.status_code == 201
    data = admin_resp.json()
    # Verify resource_name uses metric_name, not non-existent 'name'
    assert data["resource_name"] == "Cross-Department KRI Metric"
