from __future__ import annotations

from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Control, Department, Issue, IssueLink, IssueRemediationPlan, Role, User

from .issues_api_helpers import _grant

pytest_plugins = ("tests.backend.pytest.api.v1.issues_api_support",)


@pytest.mark.asyncio
async def test_issues_permission_denied_without_issues_read(
    client_employee: AsyncClient,
):
    response = await client_employee.get("/api/v1/issues")
    assert response.status_code == 403
    assert "issues:read" in response.json()["detail"]


@pytest.mark.asyncio
async def test_out_of_scope_issue_hidden_with_404(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_user_employee: User,
    test_role_employee: Role,
    second_department: Department,
):
    second_department_id = second_department.id
    await _grant(db_session, test_role_employee, "issues", "read")

    issue = Issue(
        title="Out of scope issue",
        description="Hidden issue",
        severity="high",
        status="open",
        source_type="manual",
        department_id=second_department_id,
        owner_user_id=None,
        created_by_id=None,
        opened_at=datetime.now(UTC),
    )
    db_session.add(issue)
    await db_session.flush()
    db_session.add(IssueRemediationPlan(issue_id=issue.id, status="draft", progress_percent=0))
    await db_session.commit()

    list_resp = await client_employee.get("/api/v1/issues")
    assert list_resp.status_code == 200
    ids = {item["id"] for item in list_resp.json()["items"]}
    assert issue.id not in ids

    read_resp = await client_employee.get(f"/api/v1/issues/{issue.id}")
    assert read_resp.status_code == 404


@pytest.mark.asyncio
async def test_control_owner_cross_department_issue_access(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_user_employee: User,
    test_role_employee: Role,
    second_department: Department,
):
    second_department_id = second_department.id
    employee_user_id = test_user_employee.id
    await _grant(db_session, test_role_employee, "issues", "read")

    cross_control = Control(
        name="Cross Department Owned Control",
        description="Employee owns control in another department",
        department_id=second_department_id,
        control_owner_id=employee_user_id,
        status="active",
    )
    db_session.add(cross_control)
    await db_session.flush()

    issue = Issue(
        title="Cross linked issue",
        description="Issue linked to cross-dept owned control",
        severity="medium",
        status="open",
        source_type="manual",
        department_id=second_department_id,
        owner_user_id=None,
        created_by_id=None,
        opened_at=datetime.now(UTC),
    )
    db_session.add(issue)
    await db_session.flush()
    db_session.add(IssueLink(issue_id=issue.id, control_id=cross_control.id))
    db_session.add(IssueRemediationPlan(issue_id=issue.id, status="draft", progress_percent=0))
    await db_session.commit()

    read_resp = await client_employee.get(f"/api/v1/issues/{issue.id}")
    assert read_resp.status_code == 200
    assert read_resp.json()["id"] == issue.id


@pytest.mark.asyncio
async def test_issue_lookup_endpoints_enforce_department_scope(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_role_employee: Role,
    second_department: Department,
):
    second_department_id = second_department.id
    await _grant(db_session, test_role_employee, "issues", "write")

    departments_resp = await client_employee.get("/api/v1/issues/lookups/departments")
    assert departments_resp.status_code == 200
    departments = departments_resp.json()
    assert all(item["id"] != second_department_id for item in departments)

    owners_resp = await client_employee.get(
        "/api/v1/issues/lookups/owners",
        params={"department_id": second_department_id},
    )
    assert owners_resp.status_code == 403
