from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification, NotificationType, Permission, Role, RolePermission, User


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


@pytest.mark.asyncio
async def test_issue_workflow_happy_path(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department,
    test_user: User,
):
    create_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Workflow issue",
            "description": "Issue for workflow test",
            "severity": "high",
            "source_type": "manual",
            "department_id": test_department.id,
            "owner_user_id": test_user.id,
            "due_at": (datetime.now(UTC) + timedelta(days=5)).isoformat(),
        },
    )
    assert create_resp.status_code == 201
    issue_id = create_resp.json()["id"]

    assign_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/assign",
        json={
            "owner_user_id": test_user.id,
            "due_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
            "target_date": (datetime.now(UTC) + timedelta(days=6)).isoformat(),
        },
    )
    assert assign_resp.status_code == 200
    assert assign_resp.json()["status"] == "triaged"

    start_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/start-remediation",
        json={},
    )
    assert start_resp.status_code == 200
    assert start_resp.json()["status"] == "in_progress"
    assert start_resp.json()["remediation_plan"]["status"] == "active"

    progress_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/update-progress",
        json={"progress_percent": 100, "completion_notes": "Done"},
    )
    assert progress_resp.status_code == 200
    assert progress_resp.json()["status"] == "ready_for_validation"
    assert progress_resp.json()["remediation_plan"]["status"] == "completed"

    exception_request_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/request-exception",
        json={"reason": "Need temporary exception"},
    )
    assert exception_request_resp.status_code == 201
    exception_id = exception_request_resp.json()["id"]
    assert exception_request_resp.json()["status"] == "requested"

    approve_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/approve-exception",
        json={
            "exception_id": exception_id,
            "expires_at": (datetime.now(UTC) + timedelta(days=30)).isoformat(),
        },
    )
    assert approve_resp.status_code == 200
    assert approve_resp.json()["status"] == "approved"

    close_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/close",
        json={"validation_note": "Validated remediation", "completion_notes": "Verified"},
    )
    assert close_resp.status_code == 200
    assert close_resp.json()["status"] == "closed"
    assert close_resp.json()["validation_note"] == "Validated remediation"


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
    client_cro: AsyncClient,
    test_department,
    test_user: User,
):
    create_resp = await client_cro.post(
        "/api/v1/issues",
        json={
            "title": "Notification flow issue",
            "severity": "high",
            "source_type": "manual",
            "department_id": test_department.id,
            "owner_user_id": test_user.id,
            "due_at": (datetime.now(UTC) + timedelta(days=3)).isoformat(),
        },
    )
    assert create_resp.status_code == 201
    issue_id = create_resp.json()["id"]

    await client_cro.post(
        f"/api/v1/issues/{issue_id}/assign",
        json={
            "owner_user_id": test_user.id,
            "due_at": (datetime.now(UTC) + timedelta(days=4)).isoformat(),
        },
    )

    await client_cro.post(
        f"/api/v1/issues/{issue_id}/request-exception",
        json={"reason": "Need exception for release"},
    )

    notifications = (
        await db_session.execute(
            select(Notification).where(Notification.resource_type == "issue", Notification.resource_id == issue_id)
        )
    ).scalars().all()

    types = {n.type for n in notifications}
    assert NotificationType.ISSUE_ASSIGNED in types
    assert NotificationType.ISSUE_EXCEPTION_REQUESTED in types
