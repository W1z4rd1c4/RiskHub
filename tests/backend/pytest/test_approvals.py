"""Tests for approval request endpoints."""
from __future__ import annotations

from datetime import UTC, date, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Control,
    KeyRiskIndicator,
    Permission,
    Role,
    RolePermission,
    OutboxEvent,
    User,
)
from app.models.key_risk_indicator import KRIFrequency
from app.models.kri_history import KRIValueHistory
from app.models.user import AccessScope
from app.services.kri_history_service import KRIHistoryService


async def _count_outbox_events(db_session: AsyncSession) -> int:
    return int(await db_session.scalar(select(func.count()).select_from(OutboxEvent)) or 0)


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
    response = await auth_client.post("/api/v1/approvals", json={"resource_type": "risk", "resource_id": test_risk.id})
    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_create_approval_with_reason(auth_client: AsyncClient, test_risk):
    """Test creating approval request with reason succeeds."""
    response = await auth_client.post(
        "/api/v1/approvals",
        json={"resource_type": "risk", "resource_id": test_risk.id, "reason": "No longer applicable to business"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "pending"
    assert data["resource_type"] == "risk"
    assert data["reason"] == "No longer applicable to business"
    assert data["can_approve"] is False
    assert data["can_reject"] is True


@pytest.mark.asyncio
async def test_pending_queue_and_count_use_combined_non_privileged_predicate(
    client: AsyncClient,
    db_session: AsyncSession,
    test_risk,
    test_user: User,
    test_user_employee: User,
):
    own_pending_privileged = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=test_risk.id,
        resource_name=test_risk.name,
        requested_by_id=test_user_employee.id,
        reason="Own privileged pending",
        status=ApprovalStatus.PENDING_PRIVILEGED,
    )
    primary_pending = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=test_risk.id,
        resource_name=test_risk.name,
        requested_by_id=test_user.id,
        primary_approver_id=test_user_employee.id,
        reason="Primary pending",
        status=ApprovalStatus.PENDING,
    )
    unrelated_pending = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=test_risk.id,
        resource_name=test_risk.name,
        requested_by_id=test_user.id,
        primary_approver_id=test_user.id,
        reason="Unrelated pending",
        status=ApprovalStatus.PENDING,
    )
    db_session.add_all([own_pending_privileged, primary_pending, unrelated_pending])
    await db_session.commit()

    headers = {"X-Mock-User-Id": str(test_user_employee.id)}

    list_response = await client.get("/api/v1/approvals?status=pending", headers=headers)
    assert list_response.status_code == 200
    items = list_response.json()["items"]
    item_ids = {item["id"] for item in items}
    assert own_pending_privileged.id in item_ids
    assert primary_pending.id in item_ids
    assert unrelated_pending.id not in item_ids

    own_item = next(item for item in items if item["id"] == own_pending_privileged.id)
    assert own_item["can_approve"] is False
    assert own_item["can_reject"] is False

    primary_item = next(item for item in items if item["id"] == primary_pending.id)
    assert primary_item["can_approve"] is True
    assert primary_item["can_reject"] is False

    count_response = await client.get("/api/v1/approvals/pending/count", headers=headers)
    assert count_response.status_code == 200
    assert count_response.json()["count"] == 2


@pytest.mark.asyncio
async def test_self_approval_is_forbidden_for_approve(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_risk,
    test_user: User,
):
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=test_risk.id,
        resource_name=test_risk.name,
        requested_by_id=test_user.id,
        primary_approver_id=test_user.id,
        reason="Own request",
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval)
    await db_session.commit()

    response = await auth_client.post(
        f"/api/v1/approvals/{approval.id}/approve",
        json={"resolution_notes": "Attempted self approval"},
    )
    assert response.status_code == 403
    assert "cannot approve their own requests" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_approve_sanitizes_500_detail_on_commit_failure(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_risk,
    test_user_employee: User,
    monkeypatch: pytest.MonkeyPatch,
):
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=test_risk.id,
        resource_name=test_risk.name,
        requested_by_id=test_user_employee.id,
        reason="Trigger failure",
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval)
    await db_session.commit()

    async def _raise_enqueue(*args, **kwargs):
        raise RuntimeError("db exploded sensitive details")

    monkeypatch.setattr("app.api.v1.endpoints.approvals.resolve.OutboxService.enqueue", _raise_enqueue)

    response = await auth_client.post(
        f"/api/v1/approvals/{approval.id}/approve",
        json={"resolution_notes": "Approve"},
    )
    assert response.status_code == 500
    detail = response.json()["detail"]
    assert detail == "Failed to process approval request"
    assert "db exploded" not in detail.lower()


@pytest.mark.asyncio
async def test_approve_risk_owner_change_rejects_stale_inactive_target_and_rolls_back(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_risk,
    test_role_employee: Role,
    test_user_employee: User,
):
    stale_owner = User(
        name="Stale Risk Owner",
        email="stale-risk-owner@example.com",
        role_id=test_role_employee.id,
        department_id=test_risk.department_id,
        is_active=False,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(stale_owner)
    await db_session.commit()
    await db_session.refresh(stale_owner)

    original_owner_id = test_risk.owner_id
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=test_risk.id,
        resource_name=test_risk.name,
        requested_by_id=test_user_employee.id,
        reason="Stale owner target",
        action_type=ApprovalActionType.EDIT,
        pending_changes={"owner_id": {"old": original_owner_id, "new": stale_owner.id}},
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval)
    await db_session.commit()

    response = await auth_client.post(
        f"/api/v1/approvals/{approval.id}/approve",
        json={"resolution_notes": "Approve stale owner change"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Risk owner is inactive"
    await db_session.refresh(approval)
    await db_session.refresh(test_risk)
    assert approval.status == ApprovalStatus.PENDING
    assert approval.resolved_by_id is None
    assert approval.resolved_at is None
    assert test_risk.owner_id == original_owner_id
    assert await _count_outbox_events(db_session) == 0


@pytest.mark.asyncio
async def test_approve_control_owner_change_rejects_stale_inactive_target_and_rolls_back(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department,
    test_role_employee: Role,
    test_user_employee: User,
):
    control = Control(
        name="Approval Control Owner Rollback",
        description="Control for stale owner approval test",
        department_id=test_department.id,
        control_owner_id=test_user_employee.id,
        control_form="manual",
        frequency="monthly",
        status="active",
    )
    stale_owner = User(
        name="Stale Control Owner",
        email="stale-control-owner@example.com",
        role_id=test_role_employee.id,
        department_id=test_department.id,
        is_active=False,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add_all([control, stale_owner])
    await db_session.commit()
    await db_session.refresh(control)
    await db_session.refresh(stale_owner)

    original_owner_id = control.control_owner_id
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.CONTROL,
        resource_id=control.id,
        resource_name=control.name,
        requested_by_id=test_user_employee.id,
        reason="Stale control owner target",
        action_type=ApprovalActionType.EDIT,
        pending_changes={"control_owner_id": {"old": original_owner_id, "new": stale_owner.id}},
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval)
    await db_session.commit()

    response = await auth_client.post(
        f"/api/v1/approvals/{approval.id}/approve",
        json={"resolution_notes": "Approve stale control owner change"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Control owner is inactive"
    await db_session.refresh(approval)
    await db_session.refresh(control)
    assert approval.status == ApprovalStatus.PENDING
    assert approval.resolved_by_id is None
    assert approval.resolved_at is None
    assert control.control_owner_id == original_owner_id
    assert await _count_outbox_events(db_session) == 0


@pytest.mark.asyncio
async def test_approve_kri_reporting_owner_change_rejects_stale_inactive_target_and_rolls_back(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_risk,
    test_role_employee: Role,
    test_user_employee: User,
):
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="Approval KRI Owner Rollback",
        description="KRI for stale owner approval test",
        current_value=20.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
        reporting_owner_id=test_user_employee.id,
    )
    stale_owner = User(
        name="Stale Reporting Owner",
        email="stale-reporting-owner@example.com",
        role_id=test_role_employee.id,
        department_id=test_risk.department_id,
        is_active=False,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add_all([kri, stale_owner])
    await db_session.commit()
    await db_session.refresh(kri)
    await db_session.refresh(stale_owner)

    original_owner_id = kri.reporting_owner_id
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.KRI,
        resource_id=kri.id,
        resource_name=kri.metric_name,
        requested_by_id=test_user_employee.id,
        reason="Stale reporting owner target",
        action_type=ApprovalActionType.EDIT,
        pending_changes={"reporting_owner_id": {"old": original_owner_id, "new": stale_owner.id}},
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval)
    await db_session.commit()

    response = await auth_client.post(
        f"/api/v1/approvals/{approval.id}/approve",
        json={"resolution_notes": "Approve stale reporting owner change"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Reporting owner is inactive"
    await db_session.refresh(approval)
    await db_session.refresh(kri)
    assert approval.status == ApprovalStatus.PENDING
    assert approval.resolved_by_id is None
    assert approval.resolved_at is None
    assert kri.reporting_owner_id == original_owner_id
    assert await _count_outbox_events(db_session) == 0


@pytest.mark.asyncio
async def test_approve_risk_owner_change_rejects_deleted_target_and_rolls_back(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_risk,
    test_role_employee: Role,
    test_user_employee: User,
):
    deleted_owner = User(
        name="Deleted Risk Owner",
        email="deleted-risk-owner@example.com",
        role_id=test_role_employee.id,
        department_id=test_risk.department_id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(deleted_owner)
    await db_session.commit()
    await db_session.refresh(deleted_owner)

    original_owner_id = test_risk.owner_id
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=test_risk.id,
        resource_name=test_risk.name,
        requested_by_id=test_user_employee.id,
        reason="Deleted owner target",
        action_type=ApprovalActionType.EDIT,
        pending_changes={"owner_id": {"old": original_owner_id, "new": deleted_owner.id}},
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval)
    await db_session.commit()

    await db_session.delete(deleted_owner)
    await db_session.commit()

    response = await auth_client.post(
        f"/api/v1/approvals/{approval.id}/approve",
        json={"resolution_notes": "Approve deleted owner change"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Risk owner not found"
    await db_session.refresh(approval)
    await db_session.refresh(test_risk)
    assert approval.status == ApprovalStatus.PENDING
    assert approval.resolved_by_id is None
    assert approval.resolved_at is None
    assert test_risk.owner_id == original_owner_id
    assert await _count_outbox_events(db_session) == 0


@pytest.mark.asyncio
async def test_duplicate_pending_request_rejected(auth_client: AsyncClient, test_risk):
    """Test cannot create duplicate pending request for same resource."""
    # Create first request
    response = await auth_client.post(
        "/api/v1/approvals", json={"resource_type": "risk", "resource_id": test_risk.id, "reason": "First request"}
    )
    assert response.status_code == 201

    # Try to create second request - should fail
    response = await auth_client.post(
        "/api/v1/approvals", json={"resource_type": "risk", "resource_id": test_risk.id, "reason": "Second request"}
    )
    assert response.status_code == 400
    assert "already pending" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_approval_by_id(auth_client: AsyncClient, test_risk):
    """Test getting single approval request by ID."""
    # Create request first
    create_response = await auth_client.post(
        "/api/v1/approvals", json={"resource_type": "risk", "resource_id": test_risk.id, "reason": "Test reason"}
    )
    approval_id = create_response.json()["id"]

    # Get by ID
    response = await auth_client.get(f"/api/v1/approvals/{approval_id}")
    assert response.status_code == 200
    assert response.json()["id"] == approval_id


@pytest.mark.asyncio
async def test_primary_approver_can_get_approval_by_id(
    client_employee: AsyncClient,
    db_session: AsyncSession,
    test_risk,
    test_user: User,
    test_user_employee: User,
):
    """Primary approver can read approval detail and receives row action booleans."""
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=test_risk.id,
        resource_name=test_risk.name,
        requested_by_id=test_user.id,
        primary_approver_id=test_user_employee.id,
        reason="Primary approval detail visibility",
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval)
    await db_session.commit()

    response = await client_employee.get(f"/api/v1/approvals/{approval.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == approval.id
    assert data["can_approve"] is True
    assert data["can_reject"] is False


@pytest.mark.asyncio
async def test_non_privileged_non_requester_non_primary_cannot_get_approval_by_id(
    client: AsyncClient,
    db_session: AsyncSession,
    test_risk,
    test_user: User,
    test_user_employee: User,
    test_role_employee: Role,
):
    """Non-privileged users who are neither requester nor primary approver cannot read detail."""
    from app.models.user import AccessScope

    outsider = User(
        name="Approval Outsider",
        email="approval-outsider@test.com",
        role_id=test_role_employee.id,
        department_id=test_user.department_id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(outsider)
    await db_session.commit()
    await db_session.refresh(outsider)

    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=test_risk.id,
        resource_name=test_risk.name,
        requested_by_id=test_user.id,
        primary_approver_id=test_user_employee.id,
        reason="Restricted detail visibility",
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval)
    await db_session.commit()

    response = await client.get(
        f"/api/v1/approvals/{approval.id}",
        headers={"X-Mock-User-Id": str(outsider.id)},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_cancel_own_request(auth_client: AsyncClient, test_risk):
    """Test user can cancel their own pending request."""
    # Create request
    create_response = await auth_client.post(
        "/api/v1/approvals", json={"resource_type": "risk", "resource_id": test_risk.id, "reason": "Test reason"}
    )
    approval_id = create_response.json()["id"]

    # Cancel it
    response = await auth_client.post(f"/api/v1/approvals/{approval_id}/cancel")
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_cannot_cancel_already_resolved_request(
    client_cro: AsyncClient,
    client_approval_requester: AsyncClient,
    test_risk,
):
    """Test cannot cancel an already-approved request."""
    # Create request as a non-privileged user
    create_response = await client_approval_requester.post(
        "/api/v1/approvals", json={"resource_type": "risk", "resource_id": test_risk.id, "reason": "Test reason"}
    )
    approval_id = create_response.json()["id"]

    # Approve it (CRO role)
    approve_response = await client_cro.post(
        f"/api/v1/approvals/{approval_id}/approve",
        json={"resolution_notes": "Approved"},
    )
    assert approve_response.status_code == 200

    # Try to cancel - should fail
    response = await client_cro.post(f"/api/v1/approvals/{approval_id}/cancel")
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_cannot_approve_already_resolved_request(
    client_cro: AsyncClient,
    client_approval_requester: AsyncClient,
    test_risk,
):
    """Test cannot approve an already-rejected request."""
    # Create request
    create_response = await client_approval_requester.post(
        "/api/v1/approvals", json={"resource_type": "risk", "resource_id": test_risk.id, "reason": "Test reason"}
    )
    approval_id = create_response.json()["id"]

    # Reject it first
    reject_response = await client_cro.post(
        f"/api/v1/approvals/{approval_id}/reject",
        json={"resolution_notes": "Rejected"},
    )
    assert reject_response.status_code == 200

    # Try to approve - should fail
    response = await client_cro.post(
        f"/api/v1/approvals/{approval_id}/approve", json={"resolution_notes": "Try again"}
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_update_blocked_during_pending_delete(auth_client: AsyncClient, test_risk):
    """Test that PATCH is blocked when a delete approval is pending."""
    # Create a delete request
    await auth_client.post(
        "/api/v1/approvals", json={"resource_type": "risk", "resource_id": test_risk.id, "reason": "Pending delete"}
    )

    # Try to update the risk - should get 409 Conflict
    response = await auth_client.patch(
        f"/api/v1/risks/{test_risk.id}", json={"description": "Trying to edit while delete pending"}
    )
    assert response.status_code == 409
    assert "pending" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_approval_cross_department_forbidden(
    client: AsyncClient,
    db_session,
    test_role_approval_requester,
    test_user: User,
):
    """
    Users should not be able to create approval requests for resources
    in departments they don't have access to.
    """
    from app.models import Department, Risk, User
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
        role_id=test_role_approval_requester.id,
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
        owner_id=test_user.id,
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
        json={"resource_type": "risk", "resource_id": risk_in_b.id, "reason": "Should not be allowed"},
    )

    # Should get 403 Forbidden
    assert response.status_code == 403
    assert "department" in response.json()["detail"].lower()


async def _create_same_department_read_only_user(
    db_session: AsyncSession,
    *,
    department_id: int,
    granted_permissions: list[tuple[str, str, str]],
    email: str,
    name: str,
) -> User:
    role = Role(name=email.replace("@", "_").replace(".", "_"), display_name=name, description="Read-only test role")
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)

    permissions: list[Permission] = []
    for resource, action, description in granted_permissions:
        permission = Permission(resource=resource, action=action, description=description)
        db_session.add(permission)
        permissions.append(permission)
    await db_session.commit()

    for permission in permissions:
        db_session.add(RolePermission(role_id=role.id, permission_id=permission.id))
    await db_session.commit()

    user = User(
        name=name,
        email=email,
        department_id=department_id,
        role_id=role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.mark.asyncio
async def test_same_department_read_only_user_cannot_open_risk_delete_approval(
    client: AsyncClient,
    db_session: AsyncSession,
    test_department,
    test_risk,
):
    user = await _create_same_department_read_only_user(
        db_session,
        department_id=test_department.id,
        granted_permissions=[("risks", "read", "Read risks")],
        email="readonly-risk@example.com",
        name="Read Only Risk User",
    )
    headers = {"X-Mock-User-Id": str(user.id)}

    delete_response = await client.delete(
        f"/api/v1/risks/{test_risk.id}",
        headers=headers,
        params={"reason": "No delete authority"},
    )
    assert delete_response.status_code == 403

    approval_response = await client.post(
        "/api/v1/approvals",
        headers=headers,
        json={"resource_type": "risk", "resource_id": test_risk.id, "reason": "No delete authority"},
    )
    assert approval_response.status_code == 403
    assert approval_response.json()["detail"] == "Permission denied: risks:delete"


@pytest.mark.asyncio
async def test_same_department_read_only_user_cannot_open_control_delete_approval(
    client: AsyncClient,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
):
    control = Control(
        name="Approval Guard Control",
        description="Control for delete-approval authorization test",
        department_id=test_department.id,
        control_owner_id=test_user_cro.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status="active",
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)

    user = await _create_same_department_read_only_user(
        db_session,
        department_id=test_department.id,
        granted_permissions=[("controls", "read", "Read controls")],
        email="readonly-control@example.com",
        name="Read Only Control User",
    )
    headers = {"X-Mock-User-Id": str(user.id)}

    delete_response = await client.delete(
        f"/api/v1/controls/{control.id}",
        headers=headers,
        params={"reason": "No delete authority"},
    )
    assert delete_response.status_code == 403

    approval_response = await client.post(
        "/api/v1/approvals",
        headers=headers,
        json={"resource_type": "control", "resource_id": control.id, "reason": "No delete authority"},
    )
    assert approval_response.status_code == 403
    assert approval_response.json()["detail"] == "Permission denied: controls:delete"


@pytest.mark.asyncio
async def test_same_department_read_only_user_cannot_open_kri_delete_approval(
    client: AsyncClient,
    db_session: AsyncSession,
    test_department,
    test_risk,
):
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="Approval Guard KRI",
        description="KRI for delete-approval authorization test",
        current_value=1.0,
        lower_limit=0.0,
        upper_limit=5.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    user = await _create_same_department_read_only_user(
        db_session,
        department_id=test_department.id,
        granted_permissions=[("risks", "read", "Read risks")],
        email="readonly-kri@example.com",
        name="Read Only KRI User",
    )
    headers = {"X-Mock-User-Id": str(user.id)}

    delete_response = await client.delete(
        f"/api/v1/kris/{kri.id}",
        headers=headers,
        params={"reason": "No delete authority"},
    )
    assert delete_response.status_code == 403

    approval_response = await client.post(
        "/api/v1/approvals",
        headers=headers,
        json={"resource_type": "kri", "resource_id": kri.id, "reason": "No delete authority"},
    )
    assert approval_response.status_code == 403
    assert approval_response.json()["detail"] == "Permission denied: risks:delete"


@pytest.mark.asyncio
async def test_approve_kri_history_correction_applies_change(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_risk,
    test_user,
    test_user_employee,
):
    """Test approving a KRI history correction updates the entry and current value."""
    period_start, period_end = KRIHistoryService.latest_closed_period_for_date(date.today(), KRIFrequency.monthly.value)
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
        requested_by_id=test_user_employee.id,
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
        f"/api/v1/approvals/{approval.id}/approve", json={"resolution_notes": "Approved correction"}
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
    test_user_employee,
):
    """Test approving a KRI value submission records history with period_end."""
    today = date.today()
    # Use closed period - after 152-03, future/open periods are rejected
    _, closed_period_end = KRIHistoryService.latest_closed_period_for_date(today, KRIFrequency.monthly.value)

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
        requested_by_id=test_user_employee.id,
        reason="KRI value submission: 55.0",
        action_type=ApprovalActionType.EDIT,
        pending_changes={
            "current_value": {"old": 30.0, "new": 55.0},
            "period_end": closed_period_end.isoformat(),
            "recorded_at": datetime.now(UTC).isoformat(),
        },
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval)
    await db_session.commit()
    await db_session.refresh(approval)

    # Approve the request
    response = await auth_client.post(
        f"/api/v1/approvals/{approval.id}/approve", json={"resolution_notes": "Approved value submission"}
    )
    assert response.status_code == 200

    # Verify KRI value was updated
    await db_session.refresh(kri)
    assert kri.current_value == 55.0
    assert kri.last_period_end == closed_period_end

    # Verify history entry was created
    from sqlalchemy import select

    result = await db_session.execute(
        select(KRIValueHistory).where(
            KRIValueHistory.kri_id == kri.id,
            KRIValueHistory.period_end == closed_period_end,
        )
    )
    entry = result.scalar_one_or_none()
    assert entry is not None
    assert entry.value == 55.0


@pytest.mark.asyncio
async def test_approve_kri_value_submission_sanitizes_internal_500_detail(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_risk,
    test_user_employee: User,
    monkeypatch: pytest.MonkeyPatch,
):
    today = date.today()
    _, closed_period_end = KRIHistoryService.latest_closed_period_for_date(today, KRIFrequency.monthly.value)

    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="Value Submission KRI Failure",
        description="KRI used to test sanitized internal failures",
        current_value=30.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.KRI,
        resource_id=kri.id,
        resource_name="Value Submission KRI Failure (value submission)",
        requested_by_id=test_user_employee.id,
        reason="KRI value submission failure",
        action_type=ApprovalActionType.EDIT,
        pending_changes={
            "current_value": {"old": 30.0, "new": 55.0},
            "period_end": closed_period_end.isoformat(),
            "recorded_at": datetime.now(UTC).isoformat(),
        },
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval)
    await db_session.commit()
    await db_session.refresh(approval)

    async def _raise_runtime_error(*args, **kwargs):
        raise RuntimeError("super-sensitive database internals")

    monkeypatch.setattr("app.services.kri_history_service.KRIHistoryService.record_value", _raise_runtime_error)

    response = await auth_client.post(
        f"/api/v1/approvals/{approval.id}/approve",
        json={"resolution_notes": "Approve value submission"},
    )
    assert response.status_code == 500
    detail = response.json()["detail"]
    assert detail == "Internal server error during KRI approval execution"
    assert "super-sensitive" not in detail.lower()


@pytest.mark.asyncio
async def test_kri_approval_cross_department_denied(
    client: AsyncClient,
    db_session: AsyncSession,
    test_role_approval_requester,
    test_user_cro: User,
):
    """
    Test that KRI approval creation is denied for cross-department requests,
    and that admin can create with correct resource_name (metric_name).
    """
    from app.models import Department, KeyRiskIndicator, Risk, User
    from app.models.risk import RiskStatus as RiskStatusEnum
    from app.models.role import Role
    from app.models.user import AccessScope

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
        role_id=test_role_approval_requester.id,
        department_id=dept_a.id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    db_session.add(user_in_a)
    await db_session.commit()
    await db_session.refresh(user_in_a)

    # Create risk in Department B
    risk_in_b = Risk(
        risk_id_code="RISK-KRI-TEST",
        name="Risk for KRI Approval",
        process="KRI Test Process",
        description="Risk for KRI approval test",
        category="Test",
        department_id=dept_b.id,
        owner_id=test_user_cro.id,
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

    # Privileged business user can create the approval and resource_name uses metric_name
    admin_resp = await client.post(
        "/api/v1/approvals",
        headers={"X-Mock-User-Id": str(test_user_cro.id)},
        json={
            "resource_type": "kri",
            "resource_id": kri.id,
            "reason": "Valid privileged request",
        },
    )
    assert admin_resp.status_code == 201
    data = admin_resp.json()
    # Verify resource_name uses metric_name, not non-existent 'name'
    assert data["resource_name"] == "Cross-Department KRI Metric"


# ============================================================
# §5.5 Privileged Cancellation Tests - Plan 157-01
# ============================================================


@pytest.mark.asyncio
async def test_privileged_user_cro_can_cancel_other_users_pending_request(
    client_cro: AsyncClient,
    client_approval_requester: AsyncClient,
    db_session: AsyncSession,
    test_risk,
):
    """Test CRO can cancel another user's pending request per §5.5."""
    # Employee creates a request
    create_response = await client_approval_requester.post(
        "/api/v1/approvals",
        json={"resource_type": "risk", "resource_id": test_risk.id, "reason": "Employee request to delete"},
    )
    assert create_response.status_code == 201
    approval_id = create_response.json()["id"]

    # CRO cancels it
    cancel_response = await client_cro.post(f"/api/v1/approvals/{approval_id}/cancel")
    assert cancel_response.status_code == 200
    assert cancel_response.json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_privileged_user_risk_manager_can_cancel_other_users_pending_request(
    client_risk_manager: AsyncClient,
    client_approval_requester: AsyncClient,
    db_session: AsyncSession,
    test_risk,
):
    """Test Risk Manager can cancel another user's pending request per §5.5."""
    # Employee creates a request
    create_response = await client_approval_requester.post(
        "/api/v1/approvals", json={"resource_type": "risk", "resource_id": test_risk.id, "reason": "Employee request"}
    )
    assert create_response.status_code == 201
    approval_id = create_response.json()["id"]

    # Risk Manager cancels it
    cancel_response = await client_risk_manager.post(f"/api/v1/approvals/{approval_id}/cancel")
    assert cancel_response.status_code == 200
    assert cancel_response.json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_non_privileged_cannot_cancel_other_users_request(
    client: AsyncClient,
    db_session: AsyncSession,
    test_role_approval_requester: Role,
    test_role_employee: Role,
):
    """Test non-privileged user cannot cancel other user's request per §5.5."""
    from app.models import Department, Risk, User
    from app.models.risk import RiskStatus as RiskStatusEnum
    from app.models.user import AccessScope

    # Create a department and two employees in the same department
    dept = Department(name="Dept Cancel Test", code="CANCEL-TEST")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    user_a = User(
        name="User A",
        email="user-cancel-a@test.com",
        role_id=test_role_approval_requester.id,
        department_id=dept.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    user_b = User(
        name="User B",
        email="user-cancel-b@test.com",
        role_id=test_role_employee.id,
        department_id=dept.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add_all([user_a, user_b])
    await db_session.commit()
    await db_session.refresh(user_a)
    await db_session.refresh(user_b)

    # Create a risk in the same department as the employees
    risk_in_dept = Risk(
        risk_id_code="RISK-CANCEL-TEST",
        name="Risk for Cancel Test",
        process="Cancel test process",
        description="Risk in same department as employees",
        category="Test",
        department_id=dept.id,
        owner_id=user_a.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=3,
        net_probability=2,
        net_impact=3,
        status=RiskStatusEnum.active.value,
    )
    db_session.add(risk_in_dept)
    await db_session.commit()
    await db_session.refresh(risk_in_dept)

    # User A creates request (now in same department as risk)
    create_response = await client.post(
        "/api/v1/approvals",
        headers={"X-Mock-User-Id": str(user_a.id)},
        json={"resource_type": "risk", "resource_id": risk_in_dept.id, "reason": "User A's request"},
    )
    assert create_response.status_code == 201
    approval_id = create_response.json()["id"]

    # User B tries to cancel → 403
    cancel_response = await client.post(
        f"/api/v1/approvals/{approval_id}/cancel",
        headers={"X-Mock-User-Id": str(user_b.id)},
    )
    assert cancel_response.status_code == 403
    assert "privileged" in cancel_response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_privileged_user_cannot_cancel_already_resolved(
    client_cro: AsyncClient,
    client_risk_manager: AsyncClient,
    client_approval_requester: AsyncClient,
    db_session: AsyncSession,
    test_risk,
):
    """Test privileged user cannot cancel an already approved/rejected request."""
    # Create request
    create_response = await client_approval_requester.post(
        "/api/v1/approvals", json={"resource_type": "risk", "resource_id": test_risk.id, "reason": "Test request"}
    )
    assert create_response.status_code == 201
    approval_id = create_response.json()["id"]

    # Risk manager approves it
    approve_response = await client_risk_manager.post(
        f"/api/v1/approvals/{approval_id}/approve",
        json={"resolution_notes": "Approved"},
    )
    assert approve_response.status_code == 200

    # CRO tries to cancel → 400
    cancel_response = await client_cro.post(f"/api/v1/approvals/{approval_id}/cancel")
    assert cancel_response.status_code == 400
    assert "cannot cancel" in cancel_response.json()["detail"].lower()
