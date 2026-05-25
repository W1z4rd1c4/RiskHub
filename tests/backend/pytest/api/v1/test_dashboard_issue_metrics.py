from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.dashboard.overview import DASHBOARD_OVERVIEW_CACHE
from app.models import Department, Issue, IssueException, Permission, Role, RolePermission


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


@pytest_asyncio.fixture
async def second_department(db_session: AsyncSession) -> Department:
    department = Department(name="Second Department", code="SECM", description="Second department")
    db_session.add(department)
    await db_session.commit()
    await db_session.refresh(department)
    return department


@pytest_asyncio.fixture
async def issue_metrics_data(
    db_session: AsyncSession,
    test_department: Department,
    second_department: Department,
    test_user,
):
    now = datetime.now(UTC).replace(microsecond=0)

    issue_open_overdue_high = Issue(
        title="Open overdue high",
        severity="high",
        status="open",
        source_type="manual",
        department_id=test_department.id,
        owner_user_id=test_user.id,
        created_by_id=test_user.id,
        opened_at=now - timedelta(days=10),
        due_at=now - timedelta(days=1),
    )
    issue_open_medium = Issue(
        title="Open medium",
        severity="medium",
        status="open",
        source_type="manual",
        department_id=test_department.id,
        owner_user_id=test_user.id,
        created_by_id=test_user.id,
        opened_at=now - timedelta(days=3),
        due_at=now + timedelta(days=2),
    )
    issue_closed = Issue(
        title="Closed issue",
        severity="critical",
        status="closed",
        source_type="manual",
        department_id=test_department.id,
        owner_user_id=test_user.id,
        created_by_id=test_user.id,
        opened_at=now - timedelta(days=15),
        due_at=now - timedelta(days=5),
        closed_at=now - timedelta(days=2),
    )
    issue_suppressed = Issue(
        title="Suppressed by exception",
        severity="critical",
        status="in_progress",
        source_type="manual",
        department_id=test_department.id,
        owner_user_id=test_user.id,
        created_by_id=test_user.id,
        opened_at=now - timedelta(days=20),
        due_at=now - timedelta(days=2),
    )
    issue_other_dept = Issue(
        title="Other department overdue",
        severity="high",
        status="open",
        source_type="manual",
        department_id=second_department.id,
        opened_at=now - timedelta(days=12),
        due_at=now - timedelta(days=3),
    )

    db_session.add_all(
        [
            issue_open_overdue_high,
            issue_open_medium,
            issue_closed,
            issue_suppressed,
            issue_other_dept,
        ]
    )
    await db_session.flush()

    db_session.add(
        IssueException(
            issue_id=issue_suppressed.id,
            status="approved",
            reason="Temporary approved exception",
            requested_by_id=test_user.id,
            approved_by_id=test_user.id,
            requested_at=now - timedelta(days=3),
            approved_at=now - timedelta(days=2),
            expires_at=now + timedelta(days=5),
        )
    )
    await db_session.commit()


@pytest.mark.asyncio
async def test_issue_dashboard_metrics_global(
    auth_client: AsyncClient,
    issue_metrics_data,
):
    summary_resp = await auth_client.get("/api/v1/dashboard/issues-summary")
    assert summary_resp.status_code == 200
    summary = summary_resp.json()
    assert summary["open_issues"] == 3
    assert summary["overdue_issues"] == 2
    assert summary["high_severity_open"] == 2
    assert summary["median_days_open"] == 10

    aging_resp = await auth_client.get("/api/v1/dashboard/issues-aging")
    assert aging_resp.status_code == 200
    aging = {bucket["bucket"]: bucket["count"] for bucket in aging_resp.json()["buckets"]}
    assert aging["0-7"] == 1
    assert aging["8-30"] == 2
    assert aging["31-60"] == 0
    assert aging["61+"] == 0

    severity_resp = await auth_client.get("/api/v1/dashboard/issues-by-severity")
    assert severity_resp.status_code == 200
    severity = {item["severity"]: item["count"] for item in severity_resp.json()["items"]}
    assert severity["low"] == 0
    assert severity["medium"] == 1
    assert severity["high"] == 2
    assert severity["critical"] == 0


@pytest.mark.asyncio
async def test_issue_dashboard_metrics_employee_scope(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_role_employee: Role,
    issue_metrics_data,
):
    await _grant(db_session, test_role_employee.id, "issues", "read")

    summary_resp = await client_employee.get("/api/v1/dashboard/issues-summary")
    assert summary_resp.status_code == 200
    summary = summary_resp.json()
    assert summary["open_issues"] == 2
    assert summary["overdue_issues"] == 1
    assert summary["high_severity_open"] == 1
    assert summary["median_days_open"] == 6

    aging_resp = await client_employee.get("/api/v1/dashboard/issues-aging")
    assert aging_resp.status_code == 200
    aging = {bucket["bucket"]: bucket["count"] for bucket in aging_resp.json()["buckets"]}
    assert aging["0-7"] == 1
    assert aging["8-30"] == 1

    severity_resp = await client_employee.get("/api/v1/dashboard/issues-by-severity")
    assert severity_resp.status_code == 200
    severity = {item["severity"]: item["count"] for item in severity_resp.json()["items"]}
    assert severity["medium"] == 1
    assert severity["high"] == 1


@pytest.mark.asyncio
async def test_issue_dashboard_drilldown_filters_match_summary_counts(
    auth_client: AsyncClient,
    issue_metrics_data,
):
    summary_resp = await auth_client.get("/api/v1/dashboard/issues-summary")
    assert summary_resp.status_code == 200
    summary = summary_resp.json()

    open_resp = await auth_client.get(
        "/api/v1/issues",
        params={
            "include_closed": "false",
            "exclude_active_exceptions": "true",
        },
    )
    assert open_resp.status_code == 200
    assert open_resp.json()["total"] == summary["open_issues"]

    overdue_resp = await auth_client.get(
        "/api/v1/issues",
        params={
            "overdue": "true",
            "include_closed": "false",
            "exclude_active_exceptions": "true",
        },
    )
    assert overdue_resp.status_code == 200
    assert overdue_resp.json()["total"] == summary["overdue_issues"]

    high_critical_resp = await auth_client.get(
        "/api/v1/issues",
        params={
            "severity_group": "high_critical",
            "include_closed": "false",
            "exclude_active_exceptions": "true",
        },
    )
    assert high_critical_resp.status_code == 200
    assert high_critical_resp.json()["total"] == summary["high_severity_open"]


@pytest.mark.asyncio
async def test_issue_dashboard_metrics_require_issues_read(
    client_employee: AsyncClient,
):
    response = await client_employee.get("/api/v1/dashboard/issues-summary")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_dashboard_overview_issue_metrics_reuse_one_scoped_aggregate(
    auth_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
):
    from app.services._dashboard_metrics import issues as issue_metrics

    DASHBOARD_OVERVIEW_CACHE.clear()
    load_count = 0

    async def fake_load_scoped_issues(*args, **kwargs):
        nonlocal load_count
        load_count += 1
        return []

    monkeypatch.setattr(issue_metrics, "_load_scoped_issues", fake_load_scoped_issues)

    response = await auth_client.get("/api/v1/dashboard/overview")

    assert response.status_code == 200
    assert response.json()["issue_summary"]["open_issues"] == 0
    assert load_count == 1
