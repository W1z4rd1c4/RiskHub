from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Control,
    ControlExecution,
    Department,
    Issue,
    IssueLink,
    IssueRemediationPlan,
    KeyRiskIndicator,
    Permission,
    Risk,
    Role,
    RolePermission,
    User,
    Vendor,
)
from app.models.user import AccessScope


async def _grant(db: AsyncSession, role: Role, resource: str, action: str, description: str = "") -> None:
    role_id = role.id
    perm = (
        await db.execute(select(Permission).where(Permission.resource == resource, Permission.action == action))
    ).scalar_one_or_none()
    if perm is None:
        perm = Permission(resource=resource, action=action, description=description or f"{resource}:{action}")
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


async def _create_department_scoped_user(
    db: AsyncSession,
    *,
    email: str,
    name: str,
    department_id: int,
    role_id: int,
) -> User:
    user = User(
        email=email,
        name=name,
        role_id=role_id,
        department_id=department_id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _create_global_user(
    db: AsyncSession,
    *,
    email: str,
    name: str,
    department_id: int | None,
    role_id: int,
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


@pytest.fixture
async def second_department(db_session: AsyncSession) -> Department:
    department = Department(name="Second Department", code="SEC", description="Second department")
    db_session.add(department)
    await db_session.commit()
    await db_session.refresh(department)
    return department


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
async def test_issue_link_requires_exactly_one_target(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
):
    risk = Risk(
        risk_id_code="ISS-R-002",
        name="Issue link risk",
        process="Finance",
        description="Risk for multi-link validation",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    control = Control(
        name="Issue link control",
        description="Control for multi-link validation",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        status="active",
    )
    db_session.add_all([risk, control])
    await db_session.commit()

    create_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Validation test issue",
            "description": "Testing link payload validation",
            "severity": "medium",
            "source_type": "manual",
            "department_id": test_department.id,
        },
    )
    assert create_resp.status_code == 201
    issue_id = create_resp.json()["id"]

    invalid_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/links",
        json={"risk_id": risk.id, "control_id": control.id},
    )
    assert invalid_resp.status_code == 422


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


@pytest.mark.asyncio
async def test_update_issue_rejects_department_move_when_links_cross_departments(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
    second_department: Department,
):
    linked_risk = Risk(
        risk_id_code="ISS-R-DEP-MOVE",
        name="Linked risk for department move",
        process="Operations",
        description="Risk used to test department move guard",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    db_session.add(linked_risk)
    await db_session.commit()

    create_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Department move guard issue",
            "severity": "medium",
            "source_type": "manual",
            "department_id": test_department.id,
        },
    )
    assert create_resp.status_code == 201
    issue_id = create_resp.json()["id"]

    link_resp = await auth_client.post(f"/api/v1/issues/{issue_id}/links", json={"risk_id": linked_risk.id})
    assert link_resp.status_code == 201

    move_resp = await auth_client.patch(
        f"/api/v1/issues/{issue_id}",
        json={"department_id": second_department.id},
    )
    assert move_resp.status_code == 409
    assert "relink/unlink" in move_resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_issue_lookup_endpoints_return_business_names(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
    test_role_employee: Role,
    second_department: Department,
):
    same_department_owner = await _create_department_scoped_user(
        db_session,
        email="issue.lookup.same.scope@test.com",
        name="Same Department Owner",
        department_id=test_department.id,
        role_id=test_role_employee.id,
    )
    await _create_department_scoped_user(
        db_session,
        email="issue.lookup.out.scope@test.com",
        name="Out of Scope Owner",
        department_id=second_department.id,
        role_id=test_role_employee.id,
    )
    global_owner = await _create_global_user(
        db_session,
        email="issue.lookup.global@test.com",
        name="Global Owner",
        department_id=second_department.id,
        role_id=test_role_employee.id,
    )

    departments_resp = await auth_client.get("/api/v1/issues/lookups/departments")
    assert departments_resp.status_code == 200
    departments = departments_resp.json()
    assert any(item["name"] == test_department.name and item["code"] == test_department.code for item in departments)

    owners_resp = await auth_client.get(
        "/api/v1/issues/lookups/owners",
        params={"department_id": test_department.id},
    )
    assert owners_resp.status_code == 200
    owner_names = {item["name"] for item in owners_resp.json()}
    assert test_user.name not in owner_names
    assert same_department_owner.name in owner_names
    assert global_owner.name in owner_names
    assert "Out of Scope Owner" not in owner_names


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
async def test_contextual_issue_create_supports_all_entity_types(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
):
    risk = Risk(
        risk_id_code="ISS-CONTEXT-RISK-001",
        name="Context Source Risk",
        process="Operations",
        description="Risk source for contextual issue creation",
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
        name="Context Source Control",
        description="Control source for contextual issue creation",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        status="active",
    )
    db_session.add_all([risk, control])
    await db_session.flush()

    execution = ControlExecution(
        control_id=control.id,
        executed_by_id=test_user.id,
        result="failed",
        findings="Execution issue findings",
    )
    db_session.add(execution)
    await db_session.flush()

    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name="Contextual KRI",
        description="Contextual KRI source",
        current_value=95.0,
        lower_limit=10.0,
        upper_limit=80.0,
        unit="%",
    )
    vendor = Vendor(
        name="Context Source Vendor",
        process="Procurement",
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user.id,
        vendor_type="ict",
        status="active",
    )
    db_session.add_all([kri, vendor])
    await db_session.commit()

    cases = [
        ("risk", risk.id, "manual", "risk"),
        ("control", control.id, "control_execution", "control"),
        ("execution", execution.id, "control_execution", "execution"),
        ("kri", kri.id, "kri_breach", "kri"),
        ("vendor", vendor.id, "manual", "vendor"),
    ]

    for entity_type, entity_id, expected_source, expected_link_type in cases:
        response = await auth_client.post(
            "/api/v1/issues/contextual",
            json={
                "entity_type": entity_type,
                "entity_id": entity_id,
                "title": f"Contextual issue {entity_type}",
                "description": "Contextual create test",
                "severity": "high",
                "due_at": (datetime.now(UTC) + timedelta(days=3)).isoformat(),
            },
        )
        assert response.status_code == 201
        payload = response.json()
        assert payload["source_type"] == expected_source
        assert payload["source_id"] == entity_id
        assert payload["department_id"] == test_department.id
        assert payload["links"]
        assert payload["links"][0]["linked_entity_type"] == expected_link_type


@pytest.mark.asyncio
async def test_contextual_vendor_fallback_uses_owner_department(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
    test_role_employee: Role,
):
    vendor_owner = await _create_department_scoped_user(
        db_session,
        email="context.vendor.owner@test.com",
        name="Context Vendor Owner",
        department_id=test_department.id,
        role_id=test_role_employee.id,
    )
    vendor = Vendor(
        name="Fallback Vendor",
        process="Finance",
        department_id=None,
        outsourcing_owner_user_id=vendor_owner.id,
        vendor_type="outsourcing",
        status="active",
    )
    db_session.add(vendor)
    await db_session.commit()

    response = await auth_client.post(
        "/api/v1/issues/contextual",
        json={
            "entity_type": "vendor",
            "entity_id": vendor.id,
            "title": "Vendor fallback issue",
            "severity": "medium",
        },
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["department_id"] == test_department.id
    assert payload["department_name"] == test_department.name
    assert payload["links"][0]["linked_entity_type"] == "vendor"


@pytest.mark.asyncio
async def test_contextual_vendor_create_fails_when_department_unresolved(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_role_employee: Role,
):
    owner_without_department = await _create_global_user(
        db_session,
        email="context.vendor.owner.nodept@test.com",
        name="No Department Owner",
        department_id=None,
        role_id=test_role_employee.id,
    )
    vendor = Vendor(
        name="Unresolved Vendor",
        process="Operations",
        department_id=None,
        outsourcing_owner_user_id=owner_without_department.id,
        vendor_type="ict",
        status="active",
    )
    db_session.add(vendor)
    await db_session.commit()

    response = await auth_client.post(
        "/api/v1/issues/contextual",
        json={
            "entity_type": "vendor",
            "entity_id": vendor.id,
            "title": "Should fail vendor context",
            "severity": "medium",
        },
    )
    assert response.status_code == 409
    assert "owner department" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_contextual_create_returns_404_for_out_of_scope_source(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_role_employee: Role,
    test_user_employee: User,
    second_department: Department,
):
    second_department_id = second_department.id
    employee_user_id = test_user_employee.id
    await _grant(db_session, test_role_employee, "issues", "write")

    hidden_risk = Risk(
        risk_id_code="ISS-CONTEXT-HIDDEN",
        name="Hidden Context Risk",
        process="Operations",
        description="Out-of-scope context risk",
        category="Operational",
        department_id=second_department_id,
        owner_id=employee_user_id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    db_session.add(hidden_risk)
    await db_session.commit()

    response = await client_employee.post(
        "/api/v1/issues/contextual",
        json={
            "entity_type": "risk",
            "entity_id": hidden_risk.id,
            "title": "Out of scope issue",
            "severity": "high",
        },
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_issue_list_supports_linked_vendor_filter(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
):
    vendor = Vendor(
        name="Linked Vendor Filter",
        process="IT",
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user.id,
        vendor_type="ict",
        status="active",
    )
    db_session.add(vendor)
    await db_session.commit()

    contextual_resp = await auth_client.post(
        "/api/v1/issues/contextual",
        json={
            "entity_type": "vendor",
            "entity_id": vendor.id,
            "title": "Vendor linked issue",
            "severity": "medium",
        },
    )
    assert contextual_resp.status_code == 201
    contextual_issue_id = contextual_resp.json()["id"]

    manual_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Manual issue",
            "severity": "low",
            "department_id": test_department.id,
            "source_type": "manual",
        },
    )
    assert manual_resp.status_code == 201

    filtered_resp = await auth_client.get("/api/v1/issues", params={"linked_vendor_id": vendor.id})
    assert filtered_resp.status_code == 200
    filtered_ids = {item["id"] for item in filtered_resp.json()["items"]}
    assert contextual_issue_id in filtered_ids
    assert manual_resp.json()["id"] not in filtered_ids


@pytest.mark.asyncio
async def test_issue_link_exactly_one_target_includes_vendor_dimension(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
):
    risk = Risk(
        risk_id_code="ISS-LINK-VENDOR-001",
        name="Vendor Dimension Risk",
        process="Finance",
        description="Risk for vendor-link validation",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    vendor = Vendor(
        name="Vendor Dimension Source",
        process="Finance",
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user.id,
        vendor_type="ict",
        status="active",
    )
    db_session.add_all([risk, vendor])
    await db_session.commit()

    issue_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Vendor dimension validation issue",
            "severity": "medium",
            "source_type": "manual",
            "department_id": test_department.id,
        },
    )
    assert issue_resp.status_code == 201
    issue_id = issue_resp.json()["id"]

    invalid_resp = await auth_client.post(
        f"/api/v1/issues/{issue_id}/links",
        json={"risk_id": risk.id, "vendor_id": vendor.id},
    )
    assert invalid_resp.status_code == 422
