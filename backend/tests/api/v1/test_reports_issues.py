from __future__ import annotations

import csv
from datetime import UTC, datetime, timedelta
from io import StringIO

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Control,
    Department,
    Issue,
    IssueException,
    IssueLink,
    IssueRemediationPlan,
    Permission,
    Risk,
    Role,
    RolePermission,
)


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


@pytest.fixture
async def second_department(db_session: AsyncSession) -> Department:
    department = Department(name="Second Department", code="SECR", description="Second department")
    db_session.add(department)
    await db_session.commit()
    await db_session.refresh(department)
    return department


@pytest.fixture
async def issue_export_data(
    db_session: AsyncSession,
    test_department: Department,
    second_department: Department,
    test_user,
):
    now = datetime.now(UTC).replace(microsecond=0)

    risk = Risk(
        risk_id_code="R-ISSUE-EXP",
        name="Risk Alpha",
        process="Operations",
        description="Linked risk for issue export",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    control = Control(
        name="Control Alpha",
        description="Linked control for issue export",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        status="active",
    )
    db_session.add_all([risk, control])
    await db_session.flush()

    dept_issue_overdue = Issue(
        title="Dept issue overdue",
        severity="high",
        status="in_progress",
        source_type="manual",
        department_id=test_department.id,
        owner_user_id=test_user.id,
        created_by_id=test_user.id,
        opened_at=now - timedelta(days=14),
        due_at=now - timedelta(days=2),
    )
    dept_issue_not_overdue = Issue(
        title="Dept issue not overdue",
        severity="medium",
        status="open",
        source_type="audit",
        department_id=test_department.id,
        owner_user_id=test_user.id,
        created_by_id=test_user.id,
        opened_at=now - timedelta(days=2),
        due_at=now + timedelta(days=5),
    )
    other_dept_issue_overdue = Issue(
        title="Other dept overdue",
        severity="critical",
        status="open",
        source_type="manual",
        department_id=second_department.id,
        opened_at=now - timedelta(days=9),
        due_at=now - timedelta(days=1),
    )

    db_session.add_all([dept_issue_overdue, dept_issue_not_overdue, other_dept_issue_overdue])
    await db_session.flush()

    db_session.add_all(
        [
            IssueLink(issue_id=dept_issue_overdue.id, risk_id=risk.id),
            IssueLink(issue_id=dept_issue_overdue.id, control_id=control.id),
            IssueRemediationPlan(
                issue_id=dept_issue_overdue.id,
                status="active",
                progress_percent=40,
                owner_user_id=test_user.id,
                target_date=now + timedelta(days=10),
            ),
            IssueRemediationPlan(
                issue_id=dept_issue_not_overdue.id,
                status="draft",
                progress_percent=0,
                owner_user_id=test_user.id,
            ),
            IssueException(
                issue_id=dept_issue_not_overdue.id,
                status="requested",
                reason="Pending exception request",
                requested_by_id=test_user.id,
                requested_at=now - timedelta(hours=2),
            ),
        ]
    )
    await db_session.commit()



def _parse_csv(response_text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(StringIO(response_text)))


@pytest.mark.asyncio
async def test_export_issues_csv_contains_context(
    auth_client: AsyncClient,
    issue_export_data,
):
    as_of = datetime.now(UTC).date().isoformat()
    response = await auth_client.get(f"/api/v1/reports/issues/export?format=csv&as_of_date={as_of}")

    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]

    rows = _parse_csv(response.text)
    assert len(rows) == 3

    overdue_row = next(row for row in rows if row["Title"] == "Dept issue overdue")
    assert overdue_row["Linked Risks"] == "Risk Alpha"
    assert overdue_row["Linked Controls"] == "Control Alpha"
    assert overdue_row["Remediation Status"] == "active"
    assert overdue_row["Remediation Progress"] == "40"

    requested_exception_row = next(row for row in rows if row["Title"] == "Dept issue not overdue")
    assert requested_exception_row["Exception Status"] == "requested"


@pytest.mark.asyncio
async def test_export_issues_scope_no_leak(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_role_employee: Role,
    issue_export_data,
):
    await _grant(db_session, test_role_employee.id, "issues", "read")

    as_of = datetime.now(UTC).date().isoformat()
    response = await client_employee.get(f"/api/v1/reports/issues/export?format=csv&as_of_date={as_of}")
    assert response.status_code == 200

    rows = _parse_csv(response.text)
    titles = {row["Title"] for row in rows}
    assert "Dept issue overdue" in titles
    assert "Dept issue not overdue" in titles
    assert "Other dept overdue" not in titles


@pytest.mark.asyncio
async def test_export_issues_overdue_only_filter(
    auth_client: AsyncClient,
    issue_export_data,
):
    as_of = datetime.now(UTC).date().isoformat()
    response = await auth_client.get(
        f"/api/v1/reports/issues/export?format=csv&as_of_date={as_of}&overdue_only=true"
    )
    assert response.status_code == 200

    rows = _parse_csv(response.text)
    titles = {row["Title"] for row in rows}
    assert titles == {"Dept issue overdue", "Other dept overdue"}


@pytest.mark.asyncio
async def test_export_issues_requires_issues_read(
    client_employee: AsyncClient,
):
    as_of = datetime.now(UTC).date().isoformat()
    response = await client_employee.get(f"/api/v1/reports/issues/export?format=csv&as_of_date={as_of}")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_export_issues_supports_severity_group_and_active_exception_exclusion(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    issue_export_data,
    test_user,
):
    now = datetime.now(UTC).replace(microsecond=0)
    dept_high_issue = (
        await db_session.execute(select(Issue).where(Issue.title == "Dept issue overdue"))
    ).scalar_one()
    db_session.add(
        IssueException(
            issue_id=dept_high_issue.id,
            status="approved",
            reason="Approved active exception",
            requested_by_id=test_user.id,
            approved_by_id=test_user.id,
            requested_at=now - timedelta(days=2),
            approved_at=now - timedelta(days=1),
            expires_at=now + timedelta(days=3),
        )
    )
    await db_session.commit()

    as_of = datetime.now(UTC).date().isoformat()
    grouped_response = await auth_client.get(
        f"/api/v1/reports/issues/export?format=csv&as_of_date={as_of}&severity_group=high_critical"
    )
    assert grouped_response.status_code == 200
    grouped_titles = {row["Title"] for row in _parse_csv(grouped_response.text)}
    assert grouped_titles == {"Dept issue overdue", "Other dept overdue"}

    excluded_response = await auth_client.get(
        f"/api/v1/reports/issues/export?format=csv&as_of_date={as_of}&severity_group=high_critical&exclude_active_exceptions=true"
    )
    assert excluded_response.status_code == 200
    excluded_titles = {row["Title"] for row in _parse_csv(excluded_response.text)}
    assert excluded_titles == {"Other dept overdue"}
