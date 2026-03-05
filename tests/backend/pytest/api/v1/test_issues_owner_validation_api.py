from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, User

from .issues_api_helpers import _create_department_scoped_user

pytest_plugins = ("tests.backend.pytest.api.v1.issues_api_support",)


@pytest.mark.asyncio
async def test_create_issue_rejects_platform_admin_owner(
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
):
    create_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Admin owner create guard",
            "severity": "medium",
            "source_type": "manual",
            "department_id": test_department.id,
            "owner_user_id": test_user.id,
        },
    )
    assert create_resp.status_code == 403


@pytest.mark.asyncio
async def test_assign_issue_rejects_platform_admin_owner(
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
):
    create_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Admin owner assign guard",
            "severity": "medium",
            "source_type": "manual",
            "department_id": test_department.id,
        },
    )
    assert create_resp.status_code == 201
    issue_id = create_resp.json()["id"]

    assign_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/assign",
        json={
            "owner_user_id": test_user.id,
            "due_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
        },
    )
    assert assign_resp.status_code == 403


@pytest.mark.asyncio
async def test_update_issue_rejects_platform_admin_owner(
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
):
    create_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Admin owner update guard",
            "severity": "medium",
            "source_type": "manual",
            "department_id": test_department.id,
        },
    )
    assert create_resp.status_code == 201
    issue_id = create_resp.json()["id"]

    update_resp = await auth_client.patch(
        f"/api/v1/issues/{issue_id}",
        json={"owner_user_id": test_user.id},
    )
    assert update_resp.status_code == 403


@pytest.mark.asyncio
async def test_create_issue_rejects_out_of_scope_owner(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
    second_department: Department,
):
    out_of_scope_owner = await _create_department_scoped_user(
        db_session,
        email="issue.owner.out.of.scope@test.com",
        name="Out Of Scope Owner",
        department_id=second_department.id,
        role_id=test_user.role_id,
    )

    create_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Owner scope create guard",
            "severity": "medium",
            "source_type": "manual",
            "department_id": test_department.id,
            "owner_user_id": out_of_scope_owner.id,
        },
    )
    assert create_resp.status_code == 403


@pytest.mark.asyncio
async def test_assign_issue_rejects_out_of_scope_owner(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
    second_department: Department,
):
    out_of_scope_owner = await _create_department_scoped_user(
        db_session,
        email="issue.assign.out.of.scope@test.com",
        name="Out Of Scope Assignee",
        department_id=second_department.id,
        role_id=test_user.role_id,
    )

    create_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Owner scope assign guard",
            "severity": "medium",
            "source_type": "manual",
            "department_id": test_department.id,
        },
    )
    assert create_resp.status_code == 201
    issue_id = create_resp.json()["id"]

    assign_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/assign",
        json={
            "owner_user_id": out_of_scope_owner.id,
            "due_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
        },
    )
    assert assign_resp.status_code == 403


@pytest.mark.asyncio
async def test_update_issue_rejects_out_of_scope_owner(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
    second_department: Department,
):
    out_of_scope_owner = await _create_department_scoped_user(
        db_session,
        email="issue.update.out.of.scope@test.com",
        name="Out Of Scope Update Owner",
        department_id=second_department.id,
        role_id=test_user.role_id,
    )

    create_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Owner scope update guard",
            "severity": "medium",
            "source_type": "manual",
            "department_id": test_department.id,
        },
    )
    assert create_resp.status_code == 201
    issue_id = create_resp.json()["id"]

    update_resp = await auth_client.patch(
        f"/api/v1/issues/{issue_id}",
        json={"owner_user_id": out_of_scope_owner.id},
    )
    assert update_resp.status_code == 403
