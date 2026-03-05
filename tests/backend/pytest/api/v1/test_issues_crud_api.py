from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Control, ControlExecution, Department, Issue, Risk, Role, User

from .issues_api_helpers import _create_department_scoped_user

pytest_plugins = ("tests.backend.pytest.api.v1.issues_api_support",)


@pytest.mark.asyncio
async def test_issue_crud_list_link_and_source_metadata(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
    test_role_employee: Role,
):
    assignable_owner = await _create_department_scoped_user(
        db_session,
        email="issue.owner.same.dept@test.com",
        name="Issue Owner",
        department_id=test_department.id,
        role_id=test_role_employee.id,
    )

    control = Control(
        name="Issue Source Control",
        description="Control for issue source metadata",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        status="active",
    )
    db_session.add(control)
    await db_session.flush()

    execution = ControlExecution(
        control_id=control.id,
        executed_by_id=test_user.id,
        result="failed",
        findings="Found issues",
    )
    db_session.add(execution)
    await db_session.flush()

    risk = Risk(
        risk_id_code="ISS-R-001",
        name="Issue Linked Risk",
        process="Operations",
        description="Issue linked risk",
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
    db_session.add(risk)
    await db_session.commit()

    create_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Execution finding",
            "description": "Issue created from control execution",
            "severity": "high",
            "source_type": "control_execution",
            "source_id": execution.id,
            "department_id": test_department.id,
            "owner_user_id": assignable_owner.id,
            "due_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
        },
    )
    assert create_resp.status_code == 201
    created = create_resp.json()
    issue_id = created["id"]
    assert created["source_type"] == "control_execution"
    assert created["source_id"] == execution.id
    assert created["status"] == "open"
    assert created["department_name"] == test_department.name
    assert created["owner_user_name"] == assignable_owner.name
    assert created["created_by_name"] == test_user.name
    assert created["remediation_plan"]["status"] == "draft"
    assert created["remediation_plan"]["owner_user_name"] == assignable_owner.name

    list_resp = await auth_client.get("/api/v1/issues")
    assert list_resp.status_code == 200
    listed_ids = {item["id"] for item in list_resp.json()["items"]}
    assert issue_id in listed_ids
    list_item = next(item for item in list_resp.json()["items"] if item["id"] == issue_id)
    assert list_item["department_name"] == test_department.name
    assert list_item["owner_user_name"] == assignable_owner.name

    read_resp = await auth_client.get(f"/api/v1/issues/{issue_id}")
    assert read_resp.status_code == 200
    assert read_resp.json()["title"] == "Execution finding"
    assert read_resp.json()["created_by_name"] == test_user.name

    patch_resp = await auth_client.patch(
        f"/api/v1/issues/{issue_id}",
        json={"severity": "critical", "validation_note": "triage complete"},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["status"] == "open"
    assert patch_resp.json()["severity"] == "critical"
    assert patch_resp.json()["validation_note"] == "triage complete"

    link_resp = await auth_client.post(f"/api/v1/issues/{issue_id}/links", json={"risk_id": risk.id})
    assert link_resp.status_code == 201
    link_id = link_resp.json()["id"]

    read_with_link = await auth_client.get(f"/api/v1/issues/{issue_id}")
    assert read_with_link.status_code == 200
    assert read_with_link.json()["links"][0]["linked_entity_type"] == "risk"
    assert read_with_link.json()["links"][0]["linked_entity_name"] == risk.name

    unlink_resp = await auth_client.delete(f"/api/v1/issues/{issue_id}/links/{link_id}")
    assert unlink_resp.status_code == 204


@pytest.mark.asyncio
async def test_issue_patch_rejects_direct_status_changes(
    auth_client: AsyncClient,
    test_department: Department,
):
    create_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Status guard issue",
            "severity": "medium",
            "source_type": "manual",
            "department_id": test_department.id,
        },
    )
    assert create_resp.status_code == 201
    issue_id = create_resp.json()["id"]

    patch_resp = await auth_client.patch(
        f"/api/v1/issues/{issue_id}",
        json={"status": "triaged"},
    )
    assert patch_resp.status_code == 409
    assert "workflow endpoints" in patch_resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_issue_list_include_closed_filter_and_default_compatibility(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
):
    open_issue = Issue(
        title="Open issue for include_closed test",
        description="Should be visible by default",
        severity="medium",
        status="open",
        source_type="manual",
        department_id=test_department.id,
        owner_user_id=None,
        created_by_id=None,
        opened_at=datetime.now(UTC),
    )
    closed_issue = Issue(
        title="Closed issue for include_closed test",
        description="Should be hidden when include_closed=false",
        severity="high",
        status="closed",
        source_type="manual",
        department_id=test_department.id,
        owner_user_id=None,
        created_by_id=None,
        opened_at=datetime.now(UTC),
        closed_at=datetime.now(UTC),
    )
    db_session.add_all([open_issue, closed_issue])
    await db_session.commit()

    default_resp = await auth_client.get("/api/v1/issues")
    assert default_resp.status_code == 200
    default_ids = {item["id"] for item in default_resp.json()["items"]}
    assert open_issue.id in default_ids
    assert closed_issue.id in default_ids

    open_only_resp = await auth_client.get("/api/v1/issues", params={"include_closed": "false"})
    assert open_only_resp.status_code == 200
    open_only_ids = {item["id"] for item in open_only_resp.json()["items"]}
    assert open_issue.id in open_only_ids
    assert closed_issue.id not in open_only_ids


@pytest.mark.asyncio
async def test_issue_list_supports_search_and_sort(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
):
    issue_alpha = Issue(
        title="Alpha remediation gap",
        description="Search target alpha",
        severity="low",
        status="open",
        source_type="manual",
        department_id=test_department.id,
        owner_user_id=None,
        created_by_id=None,
        opened_at=datetime.now(UTC),
    )
    issue_beta = Issue(
        title="Beta remediation gap",
        description="Search target beta",
        severity="critical",
        status="open",
        source_type="manual",
        department_id=test_department.id,
        owner_user_id=None,
        created_by_id=None,
        opened_at=datetime.now(UTC) + timedelta(seconds=1),
    )
    db_session.add_all([issue_alpha, issue_beta])
    await db_session.commit()

    search_resp = await auth_client.get("/api/v1/issues", params={"search": "alpha"})
    assert search_resp.status_code == 200
    search_items = search_resp.json()["items"]
    assert len(search_items) >= 1
    assert all("alpha" in item["title"].lower() for item in search_items)

    asc_resp = await auth_client.get("/api/v1/issues", params={"sort_by": "title", "sort_order": "asc"})
    assert asc_resp.status_code == 200
    asc_titles = [item["title"] for item in asc_resp.json()["items"]]
    assert asc_titles == sorted(asc_titles)

    desc_resp = await auth_client.get("/api/v1/issues", params={"sort_by": "title", "sort_order": "desc"})
    assert desc_resp.status_code == 200
    desc_titles = [item["title"] for item in desc_resp.json()["items"]]
    assert desc_titles == sorted(desc_titles, reverse=True)


@pytest.mark.asyncio
async def test_issue_list_rejects_invalid_sort_params(
    auth_client: AsyncClient,
):
    invalid_sort_by = await auth_client.get("/api/v1/issues", params={"sort_by": "unknown_field"})
    assert invalid_sort_by.status_code == 400

    invalid_sort_order = await auth_client.get("/api/v1/issues", params={"sort_by": "title", "sort_order": "up"})
    assert invalid_sort_order.status_code == 400
