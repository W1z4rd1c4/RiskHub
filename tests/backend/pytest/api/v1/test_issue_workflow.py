from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.models import (
    Department,
    Issue,
    IssueException,
    IssueRemediationPlan,
    Notification,
    NotificationType,
    OutboxEvent,
    Permission,
    Role,
    RolePermission,
    User,
    Vendor,
)
from app.models.issue import IssueExceptionStatus
from app.models.user import AccessScope
from app.services.outbox import dispatch_pending_outbox_events
from app.services.outbox.handlers.issues import handle_issue_assigned, handle_issue_exception_approved
from app.services.outbox.payloads import IssueAssignedPayload, IssueExceptionApprovedPayload


async def _dispatch_outbox(async_engine: AsyncEngine) -> int:
    sessionmaker = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
    return await dispatch_pending_outbox_events(sessionmaker, lock_owner="test")


async def _grant(db: AsyncSession, role_id: int, resource: str, action: str) -> None:
    perm = (
        await db.execute(select(Permission).where(Permission.resource == resource, Permission.action == action))
    ).scalar_one_or_none()
    if perm is None:
        perm = Permission(resource=resource, action=action, description=f"{resource}:{action}")
        db.add(perm)
        await db.flush()

    existing = (
        await db.execute(
            select(RolePermission).where(RolePermission.role_id == role_id, RolePermission.permission_id == perm.id)
        )
    ).scalar_one_or_none()
    if existing is None:
        db.add(RolePermission(role_id=role_id, permission_id=perm.id))
        await db.flush()

    await db.commit()
    db.expire_all()


async def _create_global_user_without_issue_access(
    db: AsyncSession,
    *,
    email: str,
    name: str,
    role_id: int,
    department_id: int,
) -> User:
    user = User(
        email=email,
        name=name,
        role_id=role_id,
        department_id=department_id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _create_manager_scoped_user(
    db: AsyncSession,
    *,
    email: str,
    name: str,
    role_id: int,
    manager_id: int,
) -> User:
    user = User(
        email=email,
        name=name,
        role_id=role_id,
        department_id=None,
        manager_id=manager_id,
        access_scope=AccessScope.MANAGER,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.mark.asyncio
async def test_issue_workflow_happy_path(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department,
    test_user: User,
    test_user_employee: User,
):
    create_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Workflow issue",
            "description": "Issue for workflow test",
            "severity": "high",
            "source_type": "manual",
            "department_id": test_department.id,
            "owner_user_id": test_user_employee.id,
            "due_at": (datetime.now(UTC) + timedelta(days=5)).isoformat(),
        },
    )
    assert create_resp.status_code == 201
    created = create_resp.json()
    issue_id = created["id"]
    assert created["department_name"] == test_department.name
    assert created["owner_user_name"] == test_user_employee.name
    assert created["created_by_name"] == test_user.name
    assert created["remediation_plan"]["owner_user_name"] == test_user_employee.name
    assert created["capabilities"]["can_start_remediation"] is True
    assert created["capabilities"]["can_update_remediation_progress"] is False
    assert created["capabilities"]["can_mark_remediation_blocked"] is False
    assert created["capabilities"]["can_mark_remediation_completed"] is False
    assert created["capabilities"]["can_close"] is False

    assign_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/assign",
        json={
            "owner_user_id": test_user_employee.id,
            "due_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
            "target_date": (datetime.now(UTC) + timedelta(days=6)).isoformat(),
        },
    )
    assert assign_resp.status_code == 200
    assert assign_resp.json()["status"] == "triaged"
    assert assign_resp.json()["owner_user_name"] == test_user_employee.name
    assert assign_resp.json()["department_name"] == test_department.name
    assert assign_resp.json()["capabilities"]["can_start_remediation"] is True
    assert assign_resp.json()["capabilities"]["can_update_remediation_progress"] is False
    assert assign_resp.json()["capabilities"]["can_close"] is False

    start_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/start-remediation",
        json={},
    )
    assert start_resp.status_code == 200
    assert start_resp.json()["status"] == "in_progress"
    assert start_resp.json()["remediation_plan"]["status"] == "active"
    assert start_resp.json()["department_name"] == test_department.name
    assert start_resp.json()["capabilities"]["can_start_remediation"] is False
    assert start_resp.json()["capabilities"]["can_update_remediation_progress"] is True
    assert start_resp.json()["capabilities"]["can_mark_remediation_blocked"] is True
    assert start_resp.json()["capabilities"]["can_mark_remediation_completed"] is True
    assert start_resp.json()["capabilities"]["can_close"] is False

    progress_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/update-progress",
        json={"progress_percent": 100, "completion_notes": "Done"},
    )
    assert progress_resp.status_code == 200
    assert progress_resp.json()["status"] == "ready_for_validation"
    assert progress_resp.json()["remediation_plan"]["status"] == "completed"
    assert progress_resp.json()["owner_user_name"] == test_user_employee.name
    assert progress_resp.json()["capabilities"]["can_start_remediation"] is False
    assert progress_resp.json()["capabilities"]["can_update_remediation_progress"] is True
    assert progress_resp.json()["capabilities"]["can_mark_remediation_blocked"] is True
    assert progress_resp.json()["capabilities"]["can_mark_remediation_completed"] is False
    assert progress_resp.json()["capabilities"]["can_close"] is True

    exception_request_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/request-exception",
        json={"reason": "Need temporary exception"},
    )
    assert exception_request_resp.status_code == 201
    exception_id = exception_request_resp.json()["id"]
    assert exception_request_resp.json()["status"] == "requested"
    assert exception_request_resp.json()["requested_by_name"] == test_user.name

    approve_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/approve-exception",
        json={
            "exception_id": exception_id,
            "expires_at": (datetime.now(UTC) + timedelta(days=30)).isoformat(),
        },
    )
    assert approve_resp.status_code == 200
    assert approve_resp.json()["status"] == "approved"
    assert approve_resp.json()["approved_by_name"] == test_user.name

    close_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/close",
        json={"validation_note": "Validated remediation", "completion_notes": "Verified"},
    )
    assert close_resp.status_code == 200
    assert close_resp.json()["status"] == "closed"
    assert close_resp.json()["validation_note"] == "Validated remediation"
    assert close_resp.json()["department_name"] == test_department.name
    assert close_resp.json()["owner_user_name"] == test_user_employee.name
    assert close_resp.json()["capabilities"]["can_start_remediation"] is False
    assert close_resp.json()["capabilities"]["can_update_remediation_progress"] is False
    assert close_resp.json()["capabilities"]["can_mark_remediation_blocked"] is False
    assert close_resp.json()["capabilities"]["can_mark_remediation_completed"] is False
    assert close_resp.json()["capabilities"]["can_close"] is False


@pytest.mark.asyncio
async def test_issue_assignment_validation_errors_remain_http_stable(
    db_session: AsyncSession,
    client_factory,
    test_department: Department,
    test_role_employee: Role,
    test_user: User,
    test_user_cro: User,
):
    other_department = Department(
        name="Issue Assignment Other",
        code="IAO",
        description="Other department for issue owner validation",
    )
    db_session.add(other_department)
    await db_session.flush()
    other_owner = User(
        email="issue.assignment.other.owner@test.com",
        name="Issue Assignment Other Owner",
        role_id=test_role_employee.id,
        department_id=other_department.id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    archived_vendor = Vendor(
        name="Archived Issue Assignment Vendor",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
        is_archived=True,
    )
    db_session.add_all([other_owner, archived_vendor])
    await db_session.commit()
    await db_session.refresh(other_owner)
    await db_session.refresh(archived_vendor)

    async with client_factory(user=test_user_cro) as client:
        missing_owner = await client.post(
            "/api/v1/issues",
            json={
                "title": "Missing owner validation issue",
                "severity": "medium",
                "source_type": "manual",
                "department_id": test_department.id,
                "owner_user_id": 999_999_999,
            },
        )
        assert missing_owner.status_code == 400
        assert missing_owner.json()["detail"] == "User 999999999 not found"

        cross_department_owner = await client.post(
            "/api/v1/issues",
            json={
                "title": "Cross department owner validation issue",
                "severity": "medium",
                "source_type": "manual",
                "department_id": test_department.id,
                "owner_user_id": other_owner.id,
            },
        )
        assert cross_department_owner.status_code == 403
        assert (
            cross_department_owner.json()["detail"]
            == "Owner user must have global scope or belong to the issue department"
        )

        archived_vendor_context = await client.post(
            "/api/v1/issues/contextual",
            json={
                "entity_type": "vendor",
                "entity_id": archived_vendor.id,
                "title": "Archived vendor contextual issue",
                "severity": "high",
            },
        )
        assert archived_vendor_context.status_code == 409
        assert archived_vendor_context.json()["detail"] == "Cannot link archived vendor"


@pytest.mark.asyncio
async def test_request_exception_rejects_when_active_exception_exists(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department,
    test_user: User,
):
    now = datetime.now(UTC).replace(microsecond=0)
    issue = Issue(
        title="Duplicate exception blocked",
        description="Issue already has an active exception",
        severity="high",
        status="open",
        source_type="manual",
        department_id=test_department.id,
        owner_user_id=test_user.id,
        created_by_id=test_user.id,
        opened_at=now - timedelta(days=3),
        due_at=now + timedelta(days=7),
    )
    db_session.add(issue)
    await db_session.flush()
    db_session.add(IssueRemediationPlan(issue_id=issue.id, status="active", progress_percent=30))
    active_exception = IssueException(
        issue_id=issue.id,
        status=IssueExceptionStatus.approved.value,
        reason="Existing accepted exception",
        requested_by_id=test_user.id,
        approved_by_id=test_user.id,
        requested_at=now - timedelta(days=2),
        approved_at=now - timedelta(days=1),
        expires_at=now + timedelta(days=20),
    )
    db_session.add(active_exception)
    await db_session.commit()

    response = await auth_client.post(
        f"/api/v1/issues/{issue.id}/request-exception",
        json={"reason": "Second exception should be rejected"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Issue already has an active approved exception"
    requested_count = (
        await db_session.execute(
            select(IssueException).where(
                IssueException.issue_id == issue.id,
                IssueException.status == IssueExceptionStatus.requested.value,
            )
        )
    ).scalars().all()
    assert requested_count == []
    outbox_event = (
        await db_session.execute(
            select(OutboxEvent).where(
                OutboxEvent.event_type == "issue.exception_requested",
                OutboxEvent.aggregate_type == "issue_exception",
            )
        )
    ).scalar_one_or_none()
    assert outbox_event is None


@pytest.mark.asyncio
async def test_close_requires_completed_remediation(
    auth_client: AsyncClient,
    test_department,
):
    create_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Cannot close yet",
            "severity": "medium",
            "source_type": "manual",
            "department_id": test_department.id,
        },
    )
    assert create_resp.status_code == 201
    issue_id = create_resp.json()["id"]

    start_resp = await auth_client.post(f"/api/v1/issues/{issue_id}/start-remediation", json={})
    assert start_resp.status_code == 200

    close_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/close",
        json={"validation_note": "Trying too early"},
    )
    assert close_resp.status_code == 409


@pytest.mark.asyncio
async def test_status_only_completion_normalizes_remediation_and_allows_close(
    auth_client: AsyncClient,
    test_department,
    test_user_employee: User,
):
    create_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Status-only completion",
            "severity": "high",
            "source_type": "manual",
            "department_id": test_department.id,
            "owner_user_id": test_user_employee.id,
            "due_at": (datetime.now(UTC) + timedelta(days=5)).isoformat(),
        },
    )
    assert create_resp.status_code == 201
    issue_id = create_resp.json()["id"]

    start_resp = await auth_client.post(f"/api/v1/issues/{issue_id}/start-remediation", json={})
    assert start_resp.status_code == 200

    progress_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/update-progress",
        json={"remediation_status": "completed"},
    )
    assert progress_resp.status_code == 200
    payload = progress_resp.json()
    assert payload["status"] == "ready_for_validation"
    assert payload["remediation_plan"]["status"] == "completed"
    assert payload["remediation_plan"]["progress_percent"] == 100
    assert payload["remediation_plan"]["completed_at"] is not None

    close_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/close",
        json={"validation_note": "Validated status-only completion"},
    )
    assert close_resp.status_code == 200
    assert close_resp.json()["status"] == "closed"


@pytest.mark.asyncio
async def test_full_progress_completion_without_status_normalizes_remediation(
    auth_client: AsyncClient,
    test_department,
    test_user_employee: User,
):
    create_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Progress-only completion",
            "severity": "high",
            "source_type": "manual",
            "department_id": test_department.id,
            "owner_user_id": test_user_employee.id,
            "due_at": (datetime.now(UTC) + timedelta(days=5)).isoformat(),
        },
    )
    assert create_resp.status_code == 201
    issue_id = create_resp.json()["id"]

    await auth_client.post(f"/api/v1/issues/{issue_id}/start-remediation", json={})
    progress_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/update-progress",
        json={"progress_percent": 100},
    )

    assert progress_resp.status_code == 200
    payload = progress_resp.json()
    assert payload["status"] == "ready_for_validation"
    assert payload["remediation_plan"]["status"] == "completed"
    assert payload["remediation_plan"]["progress_percent"] == 100
    assert payload["remediation_plan"]["completed_at"] is not None


@pytest.mark.asyncio
async def test_closed_issue_assignment_returns_conflict(
    auth_client: AsyncClient,
    test_department,
    test_user_employee: User,
):
    create_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Closed assignment conflict",
            "severity": "high",
            "source_type": "manual",
            "department_id": test_department.id,
            "owner_user_id": test_user_employee.id,
            "due_at": (datetime.now(UTC) + timedelta(days=5)).isoformat(),
        },
    )
    issue_id = create_resp.json()["id"]

    await auth_client.post(f"/api/v1/issues/{issue_id}/start-remediation", json={})
    await auth_client.post(f"/api/v1/issues/{issue_id}/update-progress", json={"progress_percent": 100})
    close_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/close",
        json={"validation_note": "Closed"},
    )
    assert close_resp.status_code == 200

    assign_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/assign",
        json={
            "owner_user_id": test_user_employee.id,
            "due_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
        },
    )
    assert assign_resp.status_code == 409


@pytest.mark.asyncio
async def test_contradictory_completion_payloads_return_conflict(
    auth_client: AsyncClient,
    test_department,
    test_user_employee: User,
):
    create_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Contradictory completion payload",
            "severity": "high",
            "source_type": "manual",
            "department_id": test_department.id,
            "owner_user_id": test_user_employee.id,
            "due_at": (datetime.now(UTC) + timedelta(days=5)).isoformat(),
        },
    )
    issue_id = create_resp.json()["id"]
    await auth_client.post(f"/api/v1/issues/{issue_id}/start-remediation", json={})

    blocked_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/update-progress",
        json={"progress_percent": 100, "remediation_status": "blocked"},
    )
    completed_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/update-progress",
        json={"progress_percent": 50, "remediation_status": "completed"},
    )

    assert blocked_resp.status_code == 409
    assert completed_resp.status_code == 409


@pytest.mark.asyncio
async def test_ready_for_validation_issue_can_return_to_active_remediation(
    auth_client: AsyncClient,
    test_department,
    test_user_employee: User,
):
    create_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Return to active remediation",
            "severity": "high",
            "source_type": "manual",
            "department_id": test_department.id,
            "owner_user_id": test_user_employee.id,
            "due_at": (datetime.now(UTC) + timedelta(days=5)).isoformat(),
        },
    )
    issue_id = create_resp.json()["id"]
    await auth_client.post(f"/api/v1/issues/{issue_id}/start-remediation", json={})
    complete_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/update-progress",
        json={"progress_percent": 100},
    )
    completed_at = complete_resp.json()["remediation_plan"]["completed_at"]

    active_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/update-progress",
        json={"progress_percent": 80, "remediation_status": "active"},
    )

    assert active_resp.status_code == 200
    payload = active_resp.json()
    assert payload["status"] == "in_progress"
    assert payload["remediation_plan"]["status"] == "active"
    assert payload["remediation_plan"]["progress_percent"] == 80
    assert payload["remediation_plan"]["completed_at"].rstrip("Z") == completed_at.rstrip("Z")


@pytest.mark.asyncio
async def test_ready_for_validation_issue_returns_to_progress_when_progress_drops_below_complete(
    auth_client: AsyncClient,
    test_department,
    test_user_employee: User,
):
    create_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Return to progress on lower percent",
            "severity": "high",
            "source_type": "manual",
            "department_id": test_department.id,
            "owner_user_id": test_user_employee.id,
            "due_at": (datetime.now(UTC) + timedelta(days=5)).isoformat(),
        },
    )
    issue_id = create_resp.json()["id"]
    await auth_client.post(f"/api/v1/issues/{issue_id}/start-remediation", json={})
    complete_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/update-progress",
        json={"progress_percent": 100},
    )
    completed_at = complete_resp.json()["remediation_plan"]["completed_at"]

    lower_progress_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/update-progress",
        json={"progress_percent": 80},
    )

    assert lower_progress_resp.status_code == 200
    payload = lower_progress_resp.json()
    assert payload["status"] == "in_progress"
    assert payload["remediation_plan"]["status"] == "completed"
    assert payload["remediation_plan"]["progress_percent"] == 80
    assert payload["remediation_plan"]["completed_at"].rstrip("Z") == completed_at.rstrip("Z")

    close_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/close",
        json={"validation_note": "Cannot close incomplete progress"},
    )
    assert close_resp.status_code == 409


@pytest.mark.asyncio
async def test_approve_exception_requires_issues_approve_permission(
    db_session: AsyncSession,
    client_cro: AsyncClient,
    client_employee: AsyncClient,
    test_role_employee: Role,
    test_department,
):
    role_id = test_role_employee.id
    department_id = test_department.id
    await _grant(db_session, role_id, "issues", "read")
    await _grant(db_session, role_id, "issues", "write")

    create_resp = await client_cro.post(
        "/api/v1/issues",
        json={
            "title": "Approval permission check",
            "severity": "high",
            "source_type": "manual",
            "department_id": department_id,
        },
    )
    assert create_resp.status_code == 201
    issue_id = create_resp.json()["id"]

    request_resp = await client_employee.post(
        f"/api/v1/issues/{issue_id}/request-exception",
        json={"reason": "Need exception"},
    )
    assert request_resp.status_code == 201
    exception_id = request_resp.json()["id"]

    deny_resp = await client_employee.post(
        f"/api/v1/issues/{issue_id}/approve-exception",
        json={
            "exception_id": exception_id,
            "expires_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
        },
    )
    assert deny_resp.status_code == 403


@pytest.mark.asyncio
async def test_issue_workflow_notifications(
    db_session: AsyncSession,
    async_engine: AsyncEngine,
    client_cro: AsyncClient,
    test_department,
    test_user_employee: User,
    test_role_employee: Role,
):
    department_id = test_department.id
    owner_user_id = test_user_employee.id
    await _grant(db_session, test_role_employee.id, "issues", "read")

    create_resp = await client_cro.post(
        "/api/v1/issues",
        json={
            "title": "Notification flow issue",
            "severity": "high",
            "source_type": "manual",
            "department_id": department_id,
            "owner_user_id": owner_user_id,
            "due_at": (datetime.now(UTC) + timedelta(days=3)).isoformat(),
        },
    )
    assert create_resp.status_code == 201
    issue_id = create_resp.json()["id"]

    await client_cro.post(
        f"/api/v1/issues/{issue_id}/assign",
        json={
            "owner_user_id": owner_user_id,
            "due_at": (datetime.now(UTC) + timedelta(days=4)).isoformat(),
        },
    )

    await client_cro.post(
        f"/api/v1/issues/{issue_id}/request-exception",
        json={"reason": "Need exception for release"},
    )
    await _dispatch_outbox(async_engine)

    notifications = (
        (
            await db_session.execute(
                select(Notification).where(Notification.resource_type == "issue", Notification.resource_id == issue_id)
            )
        )
        .scalars()
        .all()
    )

    types = {n.type for n in notifications}
    assert NotificationType.ISSUE_ASSIGNED in types
    assert NotificationType.ISSUE_EXCEPTION_REQUESTED in types


@pytest.mark.asyncio
async def test_direct_issue_notifications_support_manager_scoped_recipients(
    db_session: AsyncSession,
    test_department,
    test_role_employee: Role,
    test_user_cro: User,
) -> None:
    role_id = test_role_employee.id
    manager_id = test_user_cro.id
    department_id = test_department.id
    await _grant(db_session, role_id, "issues", "read")
    recipient = await _create_manager_scoped_user(
        db_session,
        email="issue.direct.manager.scope@test.com",
        name="Manager Scoped Direct Issue Recipient",
        role_id=role_id,
        manager_id=manager_id,
    )
    assigned_issue = Issue(
        title="Direct manager scoped assignment",
        severity="medium",
        status="open",
        source_type="manual",
        department_id=department_id,
        owner_user_id=recipient.id,
        created_by_id=manager_id,
    )
    exception_issue = Issue(
        title="Direct manager scoped exception",
        severity="high",
        status="open",
        source_type="manual",
        department_id=department_id,
        owner_user_id=manager_id,
        created_by_id=manager_id,
    )
    db_session.add_all([assigned_issue, exception_issue])
    await db_session.commit()
    recipient_id = recipient.id
    assigned_issue_id = assigned_issue.id
    exception_issue_id = exception_issue.id
    db_session.expunge_all()
    reloaded_assigned_issue = await db_session.get(Issue, assigned_issue_id)
    reloaded_exception_issue = await db_session.get(Issue, exception_issue_id)
    actor = User(id=manager_id, name="Detached Actor")
    assert reloaded_assigned_issue is not None
    assert reloaded_exception_issue is not None

    await handle_issue_assigned(
        db_session,
        IssueAssignedPayload(
            issue_id=reloaded_assigned_issue.id,
            owner_user_id=recipient_id,
            actor_user_id=actor.id,
        ),
    )
    await handle_issue_exception_approved(
        db_session,
        IssueExceptionApprovedPayload(
            issue_id=reloaded_exception_issue.id,
            requested_by_id=recipient_id,
            owner_user_id=None,
            actor_user_id=actor.id,
        ),
    )

    notifications = (
        (
            await db_session.execute(
                select(Notification).where(
                    Notification.user_id == recipient_id,
                    Notification.resource_type == "issue",
                    Notification.resource_id.in_([assigned_issue_id, exception_issue_id]),
                )
            )
        )
        .scalars()
        .all()
    )
    types = {notification.type for notification in notifications}
    assert NotificationType.ISSUE_ASSIGNED in types
    assert NotificationType.ISSUE_EXCEPTION_APPROVED in types


@pytest.mark.asyncio
async def test_issue_outbox_handler_supports_manager_scoped_recipient(
    db_session: AsyncSession,
    test_department,
    test_role_employee: Role,
    test_user_cro: User,
) -> None:
    role_id = test_role_employee.id
    manager_id = test_user_cro.id
    department_id = test_department.id
    await _grant(db_session, role_id, "issues", "read")
    recipient = await _create_manager_scoped_user(
        db_session,
        email="issue.outbox.manager.scope@test.com",
        name="Manager Scoped Outbox Issue Recipient",
        role_id=role_id,
        manager_id=manager_id,
    )
    issue = Issue(
        title="Outbox manager scoped assignment",
        severity="medium",
        status="open",
        source_type="manual",
        department_id=department_id,
        owner_user_id=recipient.id,
        created_by_id=manager_id,
    )
    db_session.add(issue)
    await db_session.commit()
    recipient_id = recipient.id
    issue_id = issue.id
    actor_id = manager_id
    db_session.expunge_all()

    await handle_issue_assigned(
        db_session,
        IssueAssignedPayload(issue_id=issue_id, owner_user_id=recipient_id, actor_user_id=actor_id),
    )

    notification = (
        await db_session.execute(
            select(Notification).where(
                Notification.user_id == recipient_id,
                Notification.resource_type == "issue",
                Notification.resource_id == issue_id,
                Notification.type == NotificationType.ISSUE_ASSIGNED,
            )
        )
    ).scalar_one_or_none()
    assert notification is not None


@pytest.mark.asyncio
async def test_issue_outbox_exception_handler_supports_manager_scoped_recipient(
    db_session: AsyncSession,
    test_department,
    test_role_employee: Role,
    test_user_employee: User,
    test_user_cro: User,
) -> None:
    role_id = test_role_employee.id
    manager_id = test_user_cro.id
    department_id = test_department.id
    actor_id = test_user_employee.id
    await _grant(db_session, role_id, "issues", "read")
    recipient = await _create_manager_scoped_user(
        db_session,
        email="issue.outbox.exception.manager.scope@test.com",
        name="Manager Scoped Outbox Exception Recipient",
        role_id=role_id,
        manager_id=manager_id,
    )
    issue = Issue(
        title="Outbox manager scoped exception approval",
        severity="high",
        status="open",
        source_type="manual",
        department_id=department_id,
        owner_user_id=manager_id,
        created_by_id=actor_id,
    )
    db_session.add(issue)
    await db_session.commit()
    recipient_id = recipient.id
    issue_id = issue.id
    db_session.expunge_all()

    await handle_issue_exception_approved(
        db_session,
        IssueExceptionApprovedPayload(
            issue_id=issue_id,
            requested_by_id=recipient_id,
            owner_user_id=None,
            actor_user_id=actor_id,
        ),
    )

    notification = (
        await db_session.execute(
            select(Notification).where(
                Notification.user_id == recipient_id,
                Notification.resource_type == "issue",
                Notification.resource_id == issue_id,
                Notification.type == NotificationType.ISSUE_EXCEPTION_APPROVED,
            )
        )
    ).scalar_one_or_none()
    assert notification is not None


@pytest.mark.asyncio
async def test_revoke_exception_happy_path(
    auth_client: AsyncClient,
    test_department,
):
    create_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Revoke exception issue",
            "severity": "high",
            "source_type": "manual",
            "department_id": test_department.id,
        },
    )
    assert create_resp.status_code == 201
    issue_id = create_resp.json()["id"]

    request_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/request-exception",
        json={"reason": "Temporary operational allowance"},
    )
    assert request_resp.status_code == 201
    exception_id = request_resp.json()["id"]

    approve_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/approve-exception",
        json={
            "exception_id": exception_id,
            "expires_at": (datetime.now(UTC) + timedelta(days=10)).isoformat(),
        },
    )
    assert approve_resp.status_code == 200
    assert approve_resp.json()["status"] == "approved"

    revoke_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/revoke-exception",
        json={"exception_id": exception_id},
    )
    assert revoke_resp.status_code == 200
    assert revoke_resp.json()["status"] == "revoked"


@pytest.mark.asyncio
async def test_revoke_exception_requires_issues_approve_permission(
    client_cro: AsyncClient,
    client_employee: AsyncClient,
    test_department,
):
    create_resp = await client_cro.post(
        "/api/v1/issues",
        json={
            "title": "Revoke permission check",
            "severity": "high",
            "source_type": "manual",
            "department_id": test_department.id,
        },
    )
    assert create_resp.status_code == 201
    issue_id = create_resp.json()["id"]

    request_resp = await client_cro.post(
        f"/api/v1/issues/{issue_id}/request-exception",
        json={"reason": "Need time-bound allowance"},
    )
    assert request_resp.status_code == 201
    exception_id = request_resp.json()["id"]

    approve_resp = await client_cro.post(
        f"/api/v1/issues/{issue_id}/approve-exception",
        json={
            "exception_id": exception_id,
            "expires_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
        },
    )
    assert approve_resp.status_code == 200

    revoke_resp = await client_employee.post(
        f"/api/v1/issues/{issue_id}/revoke-exception",
        json={"exception_id": exception_id},
    )
    assert revoke_resp.status_code == 403


@pytest.mark.asyncio
async def test_revoke_exception_reopens_closed_issue_with_incomplete_remediation(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department,
):
    create_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Reopen on revoke",
            "severity": "high",
            "source_type": "manual",
            "department_id": test_department.id,
        },
    )
    assert create_resp.status_code == 201
    issue_id = create_resp.json()["id"]

    request_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/request-exception",
        json={"reason": "Temporary exception"},
    )
    assert request_resp.status_code == 201
    exception_id = request_resp.json()["id"]

    approve_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/approve-exception",
        json={
            "exception_id": exception_id,
            "expires_at": (datetime.now(UTC) + timedelta(days=14)).isoformat(),
        },
    )
    assert approve_resp.status_code == 200

    issue = (await db_session.execute(select(Issue).where(Issue.id == issue_id))).scalar_one()
    remediation = (
        await db_session.execute(select(IssueRemediationPlan).where(IssueRemediationPlan.issue_id == issue_id))
    ).scalar_one()
    issue.status = "closed"
    issue.closed_at = datetime.now(UTC)
    remediation.status = "active"
    remediation.progress_percent = 55
    await db_session.commit()

    revoke_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/revoke-exception",
        json={"exception_id": exception_id},
    )
    assert revoke_resp.status_code == 200
    assert revoke_resp.json()["status"] == "revoked"

    refreshed_issue = (await db_session.execute(select(Issue).where(Issue.id == issue_id))).scalar_one()
    assert refreshed_issue.status == "in_progress"
    assert refreshed_issue.closed_at is None


@pytest.mark.asyncio
async def test_revoke_exception_does_not_reopen_closed_issue_with_completed_remediation(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department,
):
    create_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Keep closed on revoke",
            "severity": "high",
            "source_type": "manual",
            "department_id": test_department.id,
        },
    )
    assert create_resp.status_code == 201
    issue_id = create_resp.json()["id"]

    request_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/request-exception",
        json={"reason": "Temporary exception"},
    )
    assert request_resp.status_code == 201
    exception_id = request_resp.json()["id"]

    approve_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/approve-exception",
        json={
            "exception_id": exception_id,
            "expires_at": (datetime.now(UTC) + timedelta(days=14)).isoformat(),
        },
    )
    assert approve_resp.status_code == 200

    issue = (await db_session.execute(select(Issue).where(Issue.id == issue_id))).scalar_one()
    remediation = (
        await db_session.execute(select(IssueRemediationPlan).where(IssueRemediationPlan.issue_id == issue_id))
    ).scalar_one()
    issue.status = "closed"
    issue.closed_at = datetime.now(UTC)
    remediation.status = "completed"
    remediation.progress_percent = 100
    remediation.completed_at = datetime.now(UTC)
    await db_session.commit()

    revoke_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/revoke-exception",
        json={"exception_id": exception_id},
    )
    assert revoke_resp.status_code == 200

    refreshed_issue = (await db_session.execute(select(Issue).where(Issue.id == issue_id))).scalar_one()
    assert refreshed_issue.status == "closed"
    assert refreshed_issue.closed_at is not None


@pytest.mark.asyncio
async def test_issue_assigned_notification_skips_unreadable_recipient(
    db_session: AsyncSession,
    async_engine: AsyncEngine,
    client_cro: AsyncClient,
    test_department,
    test_role_employee: Role,
):
    unreadable_owner = await _create_global_user_without_issue_access(
        db_session,
        email="issue.notify.assign.no.read@test.com",
        name="Unreadable Assign Recipient",
        role_id=test_role_employee.id,
        department_id=test_department.id,
    )

    create_resp = await client_cro.post(
        "/api/v1/issues",
        json={
            "title": "Assignment notification guard",
            "severity": "medium",
            "source_type": "manual",
            "department_id": test_department.id,
        },
    )
    assert create_resp.status_code == 201
    issue_id = create_resp.json()["id"]

    assign_resp = await client_cro.post(
        f"/api/v1/issues/{issue_id}/assign",
        json={
            "owner_user_id": unreadable_owner.id,
            "due_at": (datetime.now(UTC) + timedelta(days=5)).isoformat(),
        },
    )
    assert assign_resp.status_code == 200
    await _dispatch_outbox(async_engine)

    notification = (
        await db_session.execute(
            select(Notification).where(
                Notification.user_id == unreadable_owner.id,
                Notification.resource_type == "issue",
                Notification.resource_id == issue_id,
                Notification.type == NotificationType.ISSUE_ASSIGNED,
            )
        )
    ).scalar_one_or_none()
    assert notification is None


@pytest.mark.asyncio
async def test_issue_exception_approved_notification_skips_unreadable_recipient(
    db_session: AsyncSession,
    async_engine: AsyncEngine,
    client_cro: AsyncClient,
    test_department,
    test_role_employee: Role,
):
    unreadable_owner = await _create_global_user_without_issue_access(
        db_session,
        email="issue.notify.exception.no.read@test.com",
        name="Unreadable Exception Recipient",
        role_id=test_role_employee.id,
        department_id=test_department.id,
    )

    create_resp = await client_cro.post(
        "/api/v1/issues",
        json={
            "title": "Exception approval notification guard",
            "severity": "high",
            "source_type": "manual",
            "department_id": test_department.id,
            "owner_user_id": unreadable_owner.id,
        },
    )
    assert create_resp.status_code == 201
    issue_id = create_resp.json()["id"]

    request_resp = await client_cro.post(
        f"/api/v1/issues/{issue_id}/request-exception",
        json={"reason": "Need approved exception"},
    )
    assert request_resp.status_code == 201
    exception_id = request_resp.json()["id"]

    approve_resp = await client_cro.post(
        f"/api/v1/issues/{issue_id}/approve-exception",
        json={
            "exception_id": exception_id,
            "expires_at": (datetime.now(UTC) + timedelta(days=5)).isoformat(),
        },
    )
    assert approve_resp.status_code == 200
    await _dispatch_outbox(async_engine)

    notification = (
        await db_session.execute(
            select(Notification).where(
                Notification.user_id == unreadable_owner.id,
                Notification.resource_type == "issue",
                Notification.resource_id == issue_id,
                Notification.type == NotificationType.ISSUE_EXCEPTION_APPROVED,
            )
        )
    ).scalar_one_or_none()
    assert notification is None
