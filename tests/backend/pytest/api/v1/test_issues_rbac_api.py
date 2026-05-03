from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Control,
    Department,
    Issue,
    IssueLink,
    IssueRemediationPlan,
    KeyRiskIndicator,
    Risk,
    Role,
    User,
    Vendor,
)

from .issues_api_helpers import _create_department_scoped_user, _grant

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
async def test_kri_reporting_owner_cross_department_issue_access(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_user_employee: User,
    test_role_employee: Role,
    second_department: Department,
):
    second_department_id = second_department.id
    employee_user_id = test_user_employee.id
    await _grant(db_session, test_role_employee, "issues", "read")

    risk = Risk(
        risk_id_code="KRI-ISSUE-SCOPE-1",
        name="Cross department KRI parent risk",
        process="Operations",
        risk_type="operational",
        category="Operational",
        description="Risk parent for KRI issue scope",
        department_id=second_department_id,
        owner_id=None,
        status="active",
    )
    db_session.add(risk)
    await db_session.flush()

    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name="Cross department reporting-owner KRI",
        description="KRI linked directly to issue",
        current_value=50,
        lower_limit=0,
        upper_limit=100,
        reporting_owner_id=employee_user_id,
    )
    db_session.add(kri)
    await db_session.flush()

    issue = Issue(
        title="KRI linked cross department issue",
        description="Issue linked only to a cross-department KRI",
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
    db_session.add(IssueLink(issue_id=issue.id, kri_id=kri.id))
    db_session.add(IssueRemediationPlan(issue_id=issue.id, status="draft", progress_percent=0))
    await db_session.commit()

    list_resp = await client_employee.get("/api/v1/issues")
    assert list_resp.status_code == 200
    ids = {item["id"] for item in list_resp.json()["items"]}
    assert issue.id in ids

    read_resp = await client_employee.get(f"/api/v1/issues/{issue.id}")
    assert read_resp.status_code == 200
    assert read_resp.json()["id"] == issue.id


@pytest.mark.asyncio
async def test_kri_reporting_owner_direct_issue_scope_is_read_only(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_user_employee: User,
    test_role_employee: Role,
    second_department: Department,
):
    second_department_id = second_department.id
    employee_user_id = test_user_employee.id
    role_id = test_role_employee.id
    assignable_owner = await _create_department_scoped_user(
        db_session,
        email="direct-kri-issue-owner@test.com",
        name="Direct KRI Issue Owner",
        department_id=second_department_id,
        role_id=role_id,
    )
    assignable_owner_id = assignable_owner.id
    await _grant(db_session, test_role_employee, "issues", "read")
    await db_session.refresh(test_role_employee)
    await _grant(db_session, test_role_employee, "issues", "write")

    risk = Risk(
        risk_id_code="KRI-ISSUE-SCOPE-READONLY",
        name="Read-only KRI issue parent risk",
        process="Operations",
        risk_type="operational",
        category="Operational",
        description="Risk parent for read-only KRI issue scope",
        department_id=second_department_id,
        owner_id=None,
        status="active",
    )
    db_session.add(risk)
    await db_session.flush()

    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name="Read-only direct KRI issue scope",
        description="KRI linked directly to issue",
        current_value=50,
        lower_limit=0,
        upper_limit=100,
        reporting_owner_id=employee_user_id,
    )
    db_session.add(kri)
    await db_session.flush()

    issue = Issue(
        title="Read-only KRI linked issue",
        description="Visible through direct KRI reporting-owner link only",
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
    db_session.add(IssueLink(issue_id=issue.id, kri_id=kri.id))
    db_session.add(IssueRemediationPlan(issue_id=issue.id, status="draft", progress_percent=0))
    await db_session.commit()

    list_resp = await client_employee.get("/api/v1/issues")
    assert list_resp.status_code == 200
    assert issue.id in {item["id"] for item in list_resp.json()["items"]}

    read_resp = await client_employee.get(f"/api/v1/issues/{issue.id}")
    assert read_resp.status_code == 200

    assign_resp = await client_employee.post(
        f"/api/v1/issues/{issue.id}/assign",
        json={
            "owner_user_id": assignable_owner_id,
            "due_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
        },
    )
    assert assign_resp.status_code == 404

    progress_resp = await client_employee.post(
        f"/api/v1/issues/{issue.id}/update-progress",
        json={"progress_percent": 25},
    )
    assert progress_resp.status_code == 404

    exception_resp = await client_employee.post(
        f"/api/v1/issues/{issue.id}/request-exception",
        json={"reason": "Direct KRI reporting-owner scope is read-only"},
    )
    assert exception_resp.status_code == 404


@pytest.mark.asyncio
async def test_issue_detail_activity_history_capability_tracks_activity_log_read(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_user_employee: User,
    test_role_employee: Role,
):
    department_id = test_user_employee.department_id
    await _grant(db_session, test_role_employee, "issues", "read")

    issue = Issue(
        title="Activity history capability issue",
        description="Issue visible to employee",
        severity="medium",
        status="open",
        source_type="manual",
        department_id=department_id,
        owner_user_id=None,
        created_by_id=None,
        opened_at=datetime.now(UTC),
    )
    db_session.add(issue)
    await db_session.flush()
    issue_id = issue.id
    db_session.add(IssueRemediationPlan(issue_id=issue.id, status="draft", progress_percent=0))
    await db_session.commit()

    denied_resp = await client_employee.get(f"/api/v1/issues/{issue_id}")

    assert denied_resp.status_code == 200
    assert denied_resp.json()["capabilities"]["can_view_activity_history"] is False

    await _grant(db_session, test_role_employee, "activity_log", "read")

    allowed_resp = await client_employee.get(f"/api/v1/issues/{issue_id}")

    assert allowed_resp.status_code == 200
    assert allowed_resp.json()["capabilities"]["can_view_activity_history"] is True


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


@pytest.mark.asyncio
async def test_issue_detail_redacts_vendor_link_name_without_vendor_read(
    db_session: AsyncSession,
    client: AsyncClient,
    test_department: Department,
):
    department_id = test_department.id
    role = Role(
        name="issue_reader_no_vendor_read",
        display_name="Issue Reader No Vendor Read",
        description="Can read issues but not vendors",
    )
    db_session.add(role)
    await db_session.flush()
    role_id = role.id
    await _grant(db_session, role, "issues", "read")
    reader = await _create_department_scoped_user(
        db_session,
        email="issue-reader-no-vendor-read@test.com",
        name="Issue Reader No Vendor Read",
        department_id=department_id,
        role_id=role_id,
    )

    vendor = Vendor(
        name="Sensitive Linked Vendor",
        process="Outsourced processing",
        department_id=department_id,
        outsourcing_owner_user_id=reader.id,
    )
    db_session.add(vendor)
    await db_session.flush()

    issue = Issue(
        title="Issue with linked vendor",
        description="Visible issue linked to a vendor",
        severity="high",
        status="open",
        source_type="manual",
        department_id=department_id,
        owner_user_id=None,
        created_by_id=None,
        opened_at=datetime.now(UTC),
    )
    db_session.add(issue)
    await db_session.flush()
    db_session.add(IssueLink(issue_id=issue.id, vendor_id=vendor.id))
    db_session.add(IssueRemediationPlan(issue_id=issue.id, status="draft", progress_percent=0))
    await db_session.commit()

    response = await client.get(f"/api/v1/issues/{issue.id}", headers={"X-Mock-User-Id": str(reader.id)})

    assert response.status_code == 200
    payload = response.json()
    assert payload["vendor_contexts"] == []
    assert payload["links"][0]["linked_entity_type"] == "vendor"
    assert payload["links"][0]["linked_entity_name"] is None
