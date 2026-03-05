from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Control, ControlExecution, Department, KeyRiskIndicator, Risk, Role, User, Vendor

from .issues_api_helpers import _create_department_scoped_user, _create_global_user, _grant

pytest_plugins = ("tests.backend.pytest.api.v1.issues_api_support",)


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
