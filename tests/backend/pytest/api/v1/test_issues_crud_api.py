from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Control,
    ControlExecution,
    ControlRiskLink,
    Department,
    Issue,
    IssueLink,
    KeyRiskIndicator,
    Permission,
    Risk,
    Role,
    RolePermission,
    User,
    Vendor,
)

from .issues_api_helpers import _create_department_scoped_user, _grant

pytest_plugins = ("tests.backend.pytest.api.v1.issues_api_support",)


@pytest.mark.asyncio
async def test_issue_list_collection_export_capability_tracks_reports_read(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user_employee: User,
    test_role_employee: Role,
):
    issues_read = Permission(resource="issues", action="read", description="Read issues")
    db_session.add(issues_read)
    await db_session.commit()
    await db_session.refresh(issues_read)
    db_session.add(RolePermission(role_id=test_role_employee.id, permission_id=issues_read.id))
    await db_session.commit()
    db_session.expire(test_role_employee, ["permissions"])

    headers = {"X-Mock-User-Id": str(test_user_employee.id)}
    allowed_response = await client.get("/api/v1/issues", headers=headers)

    assert allowed_response.status_code == 200
    assert allowed_response.json()["capabilities"]["can_export"] is True

    reports_read_id = (
        await db_session.execute(
            select(Permission.id).where(Permission.resource == "reports", Permission.action == "read")
        )
    ).scalar_one()
    await db_session.execute(
        delete(RolePermission).where(
            RolePermission.role_id == test_role_employee.id,
            RolePermission.permission_id == reports_read_id,
        )
    )
    await db_session.commit()
    db_session.expire(test_role_employee, ["permissions"])

    denied_response = await client.get("/api/v1/issues", headers=headers)

    assert denied_response.status_code == 200
    assert denied_response.json()["capabilities"]["can_export"] is False


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
    assert created["source_display"] == f"Execution for {control.name}"
    assert created["source_link"]["execution_id"] == execution.id
    assert created["source_link"]["is_source_link"] is True
    assert created["links"] == [
        {
            "id": created["links"][0]["id"],
            "issue_id": issue_id,
            "risk_id": None,
            "control_id": None,
            "execution_id": execution.id,
            "kri_id": None,
            "vendor_id": None,
            "linked_entity_type": "execution",
            "linked_entity_name": f"Execution for {control.name}",
            "is_source_link": True,
            "created_at": created["links"][0]["created_at"],
        }
    ]
    assert created["status"] == "open"
    assert created["department_name"] == test_department.name
    assert created["owner_user_name"] == assignable_owner.name
    assert created["created_by_name"] == test_user.name
    assert created["remediation_plan"]["status"] == "draft"
    assert created["remediation_plan"]["owner_user_name"] == assignable_owner.name
    assert created["capabilities"]["can_read"] is True
    assert created["capabilities"]["can_update"] is True
    assert created["capabilities"]["can_assign_owner"] is True
    assert created["capabilities"]["can_use_owner_lookup"] is True

    list_resp = await auth_client.get("/api/v1/issues")
    assert list_resp.status_code == 200
    listed_ids = {item["id"] for item in list_resp.json()["items"]}
    assert issue_id in listed_ids
    list_item = next(item for item in list_resp.json()["items"] if item["id"] == issue_id)
    assert list_item["department_name"] == test_department.name
    assert list_item["owner_user_name"] == assignable_owner.name
    assert list_item["source_display"] == f"Execution for {control.name}"
    assert list_item["source_link"]["execution_id"] == execution.id
    assert list_item["risk_contexts"] == []
    assert list_item["capabilities"]["can_link_risk"] is True
    assert list_item["capabilities"]["has_pending_exception_request"] is False

    read_resp = await auth_client.get(f"/api/v1/issues/{issue_id}")
    assert read_resp.status_code == 200
    assert read_resp.json()["title"] == "Execution finding"
    assert read_resp.json()["created_by_name"] == test_user.name
    assert read_resp.json()["links"][0]["execution_id"] == execution.id
    assert read_resp.json()["capabilities"]["can_start_remediation"] is True
    assert read_resp.json()["capabilities"]["can_update_remediation_progress"] is False
    assert read_resp.json()["capabilities"]["can_close"] is False
    assert read_resp.json()["capabilities"]["can_request_exception"] is True

    patch_resp = await auth_client.patch(
        f"/api/v1/issues/{issue_id}",
        json={"severity": "critical", "validation_note": "triage complete"},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["status"] == "open"
    assert patch_resp.json()["severity"] == "critical"
    assert patch_resp.json()["validation_note"] == "triage complete"
    assert patch_resp.json()["capabilities"]["can_start_remediation"] is True
    assert patch_resp.json()["capabilities"]["can_close"] is False

    link_resp = await auth_client.post(f"/api/v1/issues/{issue_id}/links", json={"risk_id": risk.id})
    assert link_resp.status_code == 201
    link_id = link_resp.json()["id"]

    read_with_link = await auth_client.get(f"/api/v1/issues/{issue_id}")
    assert read_with_link.status_code == 200
    risk_link = next(link for link in read_with_link.json()["links"] if link["risk_id"] == risk.id)
    assert risk_link["linked_entity_type"] == "risk"
    assert risk_link["linked_entity_name"] == risk.name
    assert read_with_link.json()["risk_contexts"] == [
        {
            "risk_id": risk.id,
            "risk_name": risk.name,
            "risk_category": risk.category,
            "risk_process": risk.process,
            "risk_type": risk.risk_type,
        }
    ]

    list_with_context_resp = await auth_client.get("/api/v1/issues")
    assert list_with_context_resp.status_code == 200
    list_with_context_item = next(item for item in list_with_context_resp.json()["items"] if item["id"] == issue_id)
    assert list_with_context_item["risk_contexts"] == [
        {
            "risk_id": risk.id,
            "risk_name": risk.name,
            "risk_category": risk.category,
            "risk_process": risk.process,
            "risk_type": risk.risk_type,
        }
    ]

    unlink_resp = await auth_client.delete(f"/api/v1/issues/{issue_id}/links/{link_id}")
    assert unlink_resp.status_code == 204


@pytest.mark.asyncio
async def test_issue_list_and_detail_redact_hidden_linked_resources(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_department: Department,
    test_role_employee: Role,
    test_user_employee: User,
):
    department_id = test_department.id
    user_id = test_user_employee.id
    await _grant(db_session, test_role_employee, "issues", "read")
    other_department = Department(name="Issue Hidden Linked Other", code="IHLO", description="Other department")
    db_session.add(other_department)
    await db_session.flush()
    other_department_id = other_department.id

    visible_risk = Risk(
        risk_id_code="ISS-VISIBLE-RISK",
        name="Visible Issue Risk",
        process="Visible Issue Process",
        description="Visible risk context",
        category="Operational",
        department_id=department_id,
        owner_id=user_id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    hidden_risk = Risk(
        risk_id_code="ISS-HIDDEN-RISK",
        name="Hidden Issue Risk",
        process="Hidden Issue Process",
        description="Hidden risk context",
        category="Operational",
        department_id=other_department_id,
        owner_id=None,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    hidden_control = Control(
        name="Hidden Issue Control",
        description="Hidden linked control",
        department_id=other_department_id,
        control_owner_id=None,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status="active",
    )
    db_session.add_all([visible_risk, hidden_risk, hidden_control])
    await db_session.flush()

    hidden_kri = KeyRiskIndicator(
        risk_id=hidden_risk.id,
        metric_name="Hidden Issue KRI",
        description="Hidden linked KRI",
        current_value=5,
        lower_limit=0,
        upper_limit=10,
        unit="%",
    )
    issue = Issue(
        title="Visible issue with hidden linked resources",
        description="Issue remains visible while linked resource names are redacted",
        severity="high",
        status="open",
        source_type="manual",
        department_id=department_id,
        owner_user_id=None,
        created_by_id=user_id,
        opened_at=datetime.now(UTC),
    )
    db_session.add_all([hidden_kri, issue])
    await db_session.flush()
    db_session.add_all(
        [
            IssueLink(issue_id=issue.id, risk_id=visible_risk.id),
            IssueLink(issue_id=issue.id, risk_id=hidden_risk.id),
            IssueLink(issue_id=issue.id, control_id=hidden_control.id),
            IssueLink(issue_id=issue.id, kri_id=hidden_kri.id),
        ]
    )
    expected_visible_context = {
        "risk_id": visible_risk.id,
        "risk_name": visible_risk.name,
        "risk_category": visible_risk.category,
        "risk_process": visible_risk.process,
        "risk_type": visible_risk.risk_type,
    }
    visible_risk_id = visible_risk.id
    visible_risk_name = visible_risk.name
    hidden_risk_id = hidden_risk.id
    hidden_control_id = hidden_control.id
    hidden_kri_id = hidden_kri.id
    issue_id = issue.id
    await db_session.commit()

    list_response = await client_employee.get("/api/v1/issues")
    detail_response = await client_employee.get(f"/api/v1/issues/{issue_id}")

    assert list_response.status_code == 200
    assert detail_response.status_code == 200
    list_item = next(item for item in list_response.json()["items"] if item["id"] == issue_id)
    assert list_item["risk_contexts"] == [expected_visible_context]

    detail_payload = detail_response.json()
    links_by_target = {
        ("risk", link["risk_id"]): link
        for link in detail_payload["links"]
        if link["linked_entity_type"] == "risk"
    }
    hidden_control_link = next(link for link in detail_payload["links"] if link["control_id"] == hidden_control_id)
    hidden_kri_link = next(link for link in detail_payload["links"] if link["kri_id"] == hidden_kri_id)
    assert links_by_target[("risk", visible_risk_id)]["linked_entity_name"] == visible_risk_name
    assert links_by_target[("risk", hidden_risk_id)]["linked_entity_name"] is None
    assert hidden_control_link["linked_entity_name"] is None
    assert hidden_kri_link["linked_entity_name"] is None
    assert detail_payload["risk_contexts"] == list_item["risk_contexts"]


@pytest.mark.asyncio
async def test_issue_create_rejects_ambiguous_or_unlinked_source_metadata(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
):
    control = Control(
        name="Ambiguous Source Control",
        description="Control ID must not be accepted as execution source",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        status="active",
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)

    manual_with_source = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Manual with source",
            "severity": "medium",
            "source_type": "manual",
            "source_id": control.id,
            "department_id": test_department.id,
        },
    )
    assert manual_with_source.status_code == 400

    control_id_as_execution = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Control ID as execution source",
            "severity": "medium",
            "source_type": "control_execution",
            "source_id": control.id,
            "department_id": test_department.id,
        },
    )
    assert control_id_as_execution.status_code == 404


@pytest.mark.asyncio
async def test_issue_update_source_metadata_validates_and_creates_matching_link(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
):
    risk = Risk(
        risk_id_code="ISS-UPD-KRI",
        name="Issue source update risk",
        process="Finance",
        description="Risk for KRI issue source update",
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
    await db_session.flush()
    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name="Issue source update KRI",
        description="KRI used as issue source",
        current_value=15,
        lower_limit=0,
        upper_limit=10,
        unit="%",
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    create_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Manual issue to relink",
            "severity": "medium",
            "source_type": "manual",
            "department_id": test_department.id,
        },
    )
    assert create_resp.status_code == 201
    issue_id = create_resp.json()["id"]

    update_resp = await auth_client.patch(
        f"/api/v1/issues/{issue_id}",
        json={"source_type": "kri_breach", "source_id": kri.id},
    )

    assert update_resp.status_code == 200
    payload = update_resp.json()
    assert payload["source_type"] == "kri_breach"
    assert payload["source_id"] == kri.id
    assert payload["source_display"] == kri.metric_name
    assert payload["source_link"]["kri_id"] == kri.id
    assert payload["source_link"]["is_source_link"] is True
    assert payload["links"] == [
        {
            "id": payload["links"][0]["id"],
            "issue_id": issue_id,
            "risk_id": None,
            "control_id": None,
            "execution_id": None,
            "kri_id": kri.id,
            "vendor_id": None,
            "linked_entity_type": "kri",
            "linked_entity_name": kri.metric_name,
            "is_source_link": True,
            "created_at": payload["links"][0]["created_at"],
        }
    ]

    rows = (
        await db_session.execute(select(IssueLink).where(IssueLink.issue_id == issue_id, IssueLink.kri_id == kri.id))
    ).scalars().all()
    assert len(rows) == 1

    invalid_manual = await auth_client.patch(
        f"/api/v1/issues/{issue_id}",
        json={"source_type": "manual", "source_id": kri.id},
    )
    assert invalid_manual.status_code == 400


@pytest.mark.asyncio
async def test_issue_update_requires_source_id_when_switching_concrete_source_types(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
):
    risk = Risk(
        risk_id_code="ISS-SRC-SWITCH",
        name="Issue source switch risk",
        process="Finance",
        description="Risk for issue source switching",
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
        name="Issue source switch control",
        description="Control for source switch issue",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        status="active",
    )
    db_session.add_all([risk, control])
    await db_session.flush()

    execution = ControlExecution(
        control_id=control.id,
        executed_by_id=test_user.id,
        result="warning",
        findings="Execution source",
    )
    db_session.add(execution)
    await db_session.flush()

    kri = KeyRiskIndicator(
        id=execution.id,
        risk_id=risk.id,
        metric_name="Issue source switch KRI",
        description="KRI shares numeric ID with execution",
        current_value=15,
        lower_limit=0,
        upper_limit=10,
        unit="%",
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(execution)
    await db_session.refresh(kri)

    execution_issue = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Execution sourced issue",
            "severity": "medium",
            "source_type": "control_execution",
            "source_id": execution.id,
            "department_id": test_department.id,
        },
    )
    assert execution_issue.status_code == 201

    missing_kri_source_id = await auth_client.patch(
        f"/api/v1/issues/{execution_issue.json()['id']}",
        json={"source_type": "kri_breach"},
    )
    assert missing_kri_source_id.status_code == 400

    kri_issue = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "KRI sourced issue",
            "severity": "medium",
            "source_type": "kri_breach",
            "source_id": kri.id,
            "department_id": test_department.id,
        },
    )
    assert kri_issue.status_code == 201

    missing_execution_source_id = await auth_client.patch(
        f"/api/v1/issues/{kri_issue.json()['id']}",
        json={"source_type": "control_execution"},
    )
    assert missing_execution_source_id.status_code == 400

    legacy_manual_issue = Issue(
        title="Legacy manual issue with stale source id",
        description="Manual issue created before source validation",
        severity="medium",
        status="open",
        source_type="manual",
        source_id=execution.id,
        department_id=test_department.id,
        owner_user_id=None,
        created_by_id=test_user.id,
        opened_at=datetime.now(UTC),
    )
    db_session.add(legacy_manual_issue)
    await db_session.commit()
    await db_session.refresh(legacy_manual_issue)

    stale_manual_source_id_reuse = await auth_client.patch(
        f"/api/v1/issues/{legacy_manual_issue.id}",
        json={"source_type": "kri_breach"},
    )
    assert stale_manual_source_id_reuse.status_code == 400

    same_type_source_update = await auth_client.patch(
        f"/api/v1/issues/{kri_issue.json()['id']}",
        json={"source_id": kri.id},
    )
    assert same_type_source_update.status_code == 200

    explicit_switch = await auth_client.patch(
        f"/api/v1/issues/{execution_issue.json()['id']}",
        json={"source_type": "kri_breach", "source_id": kri.id},
    )
    assert explicit_switch.status_code == 200
    explicit_payload = explicit_switch.json()
    assert explicit_payload["source_type"] == "kri_breach"
    assert explicit_payload["source_id"] == kri.id
    execution_source_link = next(link for link in explicit_payload["links"] if link["execution_id"] == execution.id)
    kri_source_link = next(link for link in explicit_payload["links"] if link["kri_id"] == kri.id)
    assert execution_source_link["is_source_link"] is False
    assert kri_source_link["is_source_link"] is True
    assert explicit_payload["source_link"]["id"] == kri_source_link["id"]

    delete_current_source_link = await auth_client.delete(
        f"/api/v1/issues/{explicit_payload['id']}/links/{kri_source_link['id']}"
    )
    assert delete_current_source_link.status_code == 409

    manual_switch = await auth_client.patch(
        f"/api/v1/issues/{explicit_payload['id']}",
        json={"source_type": "manual"},
    )
    assert manual_switch.status_code == 200
    assert manual_switch.json()["source_type"] == "manual"
    assert manual_switch.json()["source_id"] is None

    delete_old_context_link = await auth_client.delete(
        f"/api/v1/issues/{explicit_payload['id']}/links/{execution_source_link['id']}"
    )
    assert delete_old_context_link.status_code == 204


@pytest.mark.asyncio
async def test_contextual_control_issue_uses_link_without_execution_source_metadata(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
):
    control = Control(
        name="Contextual Control Issue",
        description="Control issue should be link-backed",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        status="active",
    )
    secondary_risk = Risk(
        risk_id_code="ISS-CTX-SECONDARY",
        name="Secondary contextual risk",
        process="Finance",
        description="Secondary link should remain deletable",
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
    db_session.add_all([control, secondary_risk])
    await db_session.commit()
    await db_session.refresh(control)
    await db_session.refresh(secondary_risk)

    response = await auth_client.post(
        "/api/v1/issues/contextual",
        json={
            "entity_type": "control",
            "entity_id": control.id,
            "title": "Control contextual issue",
            "severity": "high",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["source_type"] == "manual"
    assert payload["source_id"] is None
    assert payload["source_display"] == control.name
    assert payload["source_link"]["control_id"] == control.id
    assert payload["source_link"]["is_source_link"] is True
    assert payload["links"] == [
        {
            "id": payload["links"][0]["id"],
            "issue_id": payload["id"],
            "risk_id": None,
            "control_id": control.id,
            "execution_id": None,
            "kri_id": None,
            "vendor_id": None,
            "linked_entity_type": "control",
            "linked_entity_name": control.name,
            "is_source_link": True,
            "created_at": payload["links"][0]["created_at"],
        }
    ]

    secondary_link_resp = await auth_client.post(
        f"/api/v1/issues/{payload['id']}/links",
        json={"risk_id": secondary_risk.id},
    )
    assert secondary_link_resp.status_code == 201

    delete_secondary_link_resp = await auth_client.delete(
        f"/api/v1/issues/{payload['id']}/links/{secondary_link_resp.json()['id']}"
    )
    assert delete_secondary_link_resp.status_code == 204

    delete_source_link_resp = await auth_client.delete(
        f"/api/v1/issues/{payload['id']}/links/{payload['source_link']['id']}"
    )
    assert delete_source_link_resp.status_code == 409


@pytest.mark.asyncio
async def test_issue_vendor_context_and_links_reject_inactive_vendor(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
):
    inactive_vendor = Vendor(
        name="Inactive Issue Vendor",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="inactive",
    )
    active_vendor = Vendor(
        name="Active Issue Vendor",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    db_session.add_all([inactive_vendor, active_vendor])
    await db_session.commit()
    await db_session.refresh(inactive_vendor)
    await db_session.refresh(active_vendor)

    inactive_context = await auth_client.post(
        "/api/v1/issues/contextual",
        json={
            "entity_type": "vendor",
            "entity_id": inactive_vendor.id,
            "title": "Inactive vendor contextual issue",
            "severity": "high",
        },
    )
    assert inactive_context.status_code == 409

    issue_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Manual issue for vendor links",
            "severity": "medium",
            "source_type": "manual",
            "department_id": test_department.id,
        },
    )
    assert issue_resp.status_code == 201
    issue_id = issue_resp.json()["id"]

    inactive_link = await auth_client.post(
        f"/api/v1/issues/{issue_id}/links",
        json={"vendor_id": inactive_vendor.id},
    )
    assert inactive_link.status_code == 409

    active_link = await auth_client.post(
        f"/api/v1/issues/{issue_id}/links",
        json={"vendor_id": active_vendor.id},
    )
    assert active_link.status_code == 201
    assert active_link.json()["vendor_id"] == active_vendor.id


@pytest.mark.asyncio
async def test_manual_issue_later_link_is_not_source_and_can_be_deleted(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
):
    risk = Risk(
        risk_id_code="ISS-MANUAL-LINK",
        name="Manual issue linked risk",
        process="Finance",
        description="Ordinary manual issue link",
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
    await db_session.refresh(risk)

    issue_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Manual issue with later risk link",
            "severity": "medium",
            "source_type": "manual",
            "department_id": test_department.id,
        },
    )
    assert issue_resp.status_code == 201
    issue_payload = issue_resp.json()
    assert issue_payload["source_type"] == "manual"
    assert issue_payload["source_id"] is None
    assert issue_payload["source_link"] is None
    assert issue_payload["source_display"] is None

    link_resp = await auth_client.post(
        f"/api/v1/issues/{issue_payload['id']}/links",
        json={"risk_id": risk.id},
    )
    assert link_resp.status_code == 201
    assert link_resp.json()["is_source_link"] is False

    read_resp = await auth_client.get(f"/api/v1/issues/{issue_payload['id']}")
    assert read_resp.status_code == 200
    read_payload = read_resp.json()
    assert read_payload["source_link"] is None
    assert read_payload["source_display"] is None
    assert read_payload["links"][0]["risk_id"] == risk.id
    assert read_payload["links"][0]["is_source_link"] is False

    delete_resp = await auth_client.delete(
        f"/api/v1/issues/{issue_payload['id']}/links/{link_resp.json()['id']}"
    )
    assert delete_resp.status_code == 204


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
async def test_issue_list_resolves_and_deduplicates_risk_contexts_across_links(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
):
    primary_risk = Risk(
        risk_id_code="ISS-CTX-001",
        name="Primary linked risk",
        process="Finance",
        description="Primary linked risk",
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
    secondary_risk = Risk(
        risk_id_code="ISS-CTX-002",
        name="Secondary linked risk",
        process="Claims",
        description="Secondary linked risk",
        category="Compliance",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="strategic",
        gross_probability=4,
        gross_impact=4,
        net_probability=3,
        net_impact=3,
        status="active",
    )
    control = Control(
        name="Shared issue control",
        description="Control linked to multiple risks",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        status="active",
    )
    db_session.add_all([primary_risk, secondary_risk, control])
    await db_session.flush()

    db_session.add_all(
        [
            ControlRiskLink(control_id=control.id, risk_id=primary_risk.id),
            ControlRiskLink(control_id=control.id, risk_id=secondary_risk.id),
        ]
    )
    await db_session.flush()

    execution = ControlExecution(
        control_id=control.id,
        executed_by_id=test_user.id,
        result="warning",
        findings="Execution linked to multiple risks",
    )
    kri = KeyRiskIndicator(
        risk_id=primary_risk.id,
        metric_name="Linked KRI",
        description="KRI linked to primary risk",
        current_value=12,
        lower_limit=0,
        upper_limit=10,
        unit="%",
    )
    db_session.add_all([execution, kri])
    await db_session.flush()

    execution_issue = Issue(
        title="Execution-linked issue",
        description="Should resolve both linked risks and dedupe direct overlap",
        severity="high",
        status="open",
        source_type="control_execution",
        source_id=execution.id,
        department_id=test_department.id,
        owner_user_id=None,
        created_by_id=test_user.id,
        opened_at=datetime.now(UTC),
    )
    kri_issue = Issue(
        title="KRI-linked issue",
        description="Should resolve KRI parent risk",
        severity="medium",
        status="open",
        source_type="kri_breach",
        source_id=kri.id,
        department_id=test_department.id,
        owner_user_id=None,
        created_by_id=test_user.id,
        opened_at=datetime.now(UTC),
    )
    manual_issue = Issue(
        title="Manual unlinked issue",
        description="Should have no risk contexts",
        severity="low",
        status="open",
        source_type="manual",
        source_id=None,
        department_id=test_department.id,
        owner_user_id=None,
        created_by_id=test_user.id,
        opened_at=datetime.now(UTC),
    )
    db_session.add_all([execution_issue, kri_issue, manual_issue])
    await db_session.flush()

    db_session.add_all(
        [
            IssueLink(issue_id=execution_issue.id, execution_id=execution.id),
            IssueLink(issue_id=execution_issue.id, risk_id=primary_risk.id),
            IssueLink(issue_id=kri_issue.id, kri_id=kri.id),
        ]
    )
    await db_session.commit()

    list_resp = await auth_client.get("/api/v1/issues")
    assert list_resp.status_code == 200
    items_by_title = {item["title"]: item for item in list_resp.json()["items"]}

    assert items_by_title["Execution-linked issue"]["risk_contexts"] == [
        {
            "risk_id": primary_risk.id,
            "risk_name": primary_risk.name,
            "risk_category": primary_risk.category,
            "risk_process": primary_risk.process,
            "risk_type": primary_risk.risk_type,
        },
        {
            "risk_id": secondary_risk.id,
            "risk_name": secondary_risk.name,
            "risk_category": secondary_risk.category,
            "risk_process": secondary_risk.process,
            "risk_type": secondary_risk.risk_type,
        },
    ]
    assert items_by_title["KRI-linked issue"]["risk_contexts"] == [
        {
            "risk_id": primary_risk.id,
            "risk_name": primary_risk.name,
            "risk_category": primary_risk.category,
            "risk_process": primary_risk.process,
            "risk_type": primary_risk.risk_type,
        }
    ]
    assert items_by_title["Manual unlinked issue"]["risk_contexts"] == []

    primary_risk_filter = await auth_client.get("/api/v1/issues", params={"linked_risk_id": primary_risk.id})
    assert primary_risk_filter.status_code == 200
    assert {item["title"] for item in primary_risk_filter.json()["items"]} >= {
        "Execution-linked issue",
        "KRI-linked issue",
    }

    secondary_risk_filter = await auth_client.get("/api/v1/issues", params={"linked_risk_id": secondary_risk.id})
    assert secondary_risk_filter.status_code == 200
    assert "Execution-linked issue" in {item["title"] for item in secondary_risk_filter.json()["items"]}

    control_filter = await auth_client.get("/api/v1/issues", params={"linked_control_id": control.id})
    assert control_filter.status_code == 200
    assert "Execution-linked issue" in {item["title"] for item in control_filter.json()["items"]}


@pytest.mark.asyncio
async def test_issue_list_rejects_invalid_sort_params(
    auth_client: AsyncClient,
):
    invalid_sort_by = await auth_client.get("/api/v1/issues", params={"sort_by": "unknown_field"})
    assert invalid_sort_by.status_code == 400

    invalid_sort_order = await auth_client.get("/api/v1/issues", params={"sort_by": "title", "sort_order": "up"})
    assert invalid_sort_order.status_code == 400
