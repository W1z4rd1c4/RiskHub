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
    Permission,
    Risk,
    Role,
    RolePermission,
    User,
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
):
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
            "owner_user_id": test_user.id,
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
    assert created["owner_user_name"] == test_user.name
    assert created["created_by_name"] == test_user.name
    assert created["remediation_plan"]["status"] == "draft"
    assert created["remediation_plan"]["owner_user_name"] == test_user.name

    list_resp = await auth_client.get("/api/v1/issues")
    assert list_resp.status_code == 200
    listed_ids = {item["id"] for item in list_resp.json()["items"]}
    assert issue_id in listed_ids
    list_item = next(item for item in list_resp.json()["items"] if item["id"] == issue_id)
    assert list_item["department_name"] == test_department.name
    assert list_item["owner_user_name"] == test_user.name

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
    second_department: Department,
):
    same_department_owner = await _create_department_scoped_user(
        db_session,
        email="issue.lookup.same.scope@test.com",
        name="Same Department Owner",
        department_id=test_department.id,
        role_id=test_user.role_id,
    )
    await _create_department_scoped_user(
        db_session,
        email="issue.lookup.out.scope@test.com",
        name="Out of Scope Owner",
        department_id=second_department.id,
        role_id=test_user.role_id,
    )
    global_owner = await _create_global_user(
        db_session,
        email="issue.lookup.global@test.com",
        name="Global Owner",
        department_id=second_department.id,
        role_id=test_user.role_id,
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
