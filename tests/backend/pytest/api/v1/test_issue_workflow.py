from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.models import (
    Issue,
    IssueRemediationPlan,
    Notification,
    NotificationType,
    Permission,
    Role,
    RolePermission,
    User,
)
from app.models.user import AccessScope
from app.services.outbox import dispatch_pending_outbox_events


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

    start_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/start-remediation",
        json={},
    )
    assert start_resp.status_code == 200
    assert start_resp.json()["status"] == "in_progress"
    assert start_resp.json()["remediation_plan"]["status"] == "active"
    assert start_resp.json()["department_name"] == test_department.name

    progress_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/update-progress",
        json={"progress_percent": 100, "completion_notes": "Done"},
    )
    assert progress_resp.status_code == 200
    assert progress_resp.json()["status"] == "ready_for_validation"
    assert progress_resp.json()["remediation_plan"]["status"] == "completed"
    assert progress_resp.json()["owner_user_name"] == test_user_employee.name

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
