from __future__ import annotations

import json

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Control,
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
    VendorControlLink,
    VendorKRILink,
    VendorRiskLink,
)


def _group_by_value(groups: list[dict], value: str) -> dict | None:
    return next((group for group in groups if group["value"] == value), None)


async def _grant_permission(db_session: AsyncSession, role: Role, resource: str, action: str) -> None:
    permission = Permission(resource=resource, action=action, description=f"{resource}:{action}")
    db_session.add(permission)
    await db_session.flush()
    db_session.add(RolePermission(role_id=role.id, permission_id=permission.id))
    await db_session.commit()
    db_session.expire(role, ["permissions"])


async def _hidden_department(db_session: AsyncSession, *, code: str = "HIDE") -> Department:
    department = Department(name=f"Hidden Department {code}", code=code, description="Hidden linked-resource scope")
    db_session.add(department)
    await db_session.commit()
    await db_session.refresh(department)
    return department


def _vendor(
    *,
    name: str,
    department_id: int,
    owner_user_id: int = 99999,
) -> Vendor:
    return Vendor(
        name=name,
        process="Vendor Process",
        subprocess=None,
        department_id=department_id,
        outsourcing_owner_user_id=owner_user_id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("path", "filters"),
    [
        ("/api/v1/risks", {"status": "bogus"}),
        ("/api/v1/controls", {"status": "bogus"}),
        ("/api/v1/controls", {"monitoring_status": "bogus"}),
        ("/api/v1/issues", {"status": "bogus"}),
        ("/api/v1/issues", {"severity": "bogus"}),
        ("/api/v1/vendors", {"status": "bogus"}),
        ("/api/v1/vendors", {"vendor_type": "bogus"}),
        ("/api/v1/kris", {"monitoring_status": "bogus"}),
        ("/api/v1/kris", {"timeliness_status": "bogus"}),
    ],
)
async def test_collection_json_enum_filters_return_422(
    auth_client: AsyncClient,
    path: str,
    filters: dict[str, str],
):
    response = await auth_client.get(path, params={"filters": json.dumps(filters)})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_collection_json_enum_filters_accept_valid_values(auth_client: AsyncClient):
    response = await auth_client.get("/api/v1/risks", params={"filters": json.dumps({"status": "active"})})

    assert response.status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("path", "filters"),
    [
        ("/api/v1/risks", {"department_id": "bogus"}),
        ("/api/v1/risks", {"include_archived": "bogus"}),
        ("/api/v1/risks", {"has_breach": 2}),
        ("/api/v1/risks", {"min_net_score": "1.5"}),
        ("/api/v1/controls", {"department_id": []}),
        ("/api/v1/controls", {"include_archived": "bogus"}),
        ("/api/v1/issues", {"owner_user_id": "bogus"}),
        ("/api/v1/issues", {"overdue": "bogus"}),
        ("/api/v1/issues", {"include_closed": {}}),
        ("/api/v1/issues", {"severity_group": "bogus"}),
        ("/api/v1/vendors", {"outsourcing_owner_user_id": "bogus"}),
        ("/api/v1/vendors", {"dora_relevant": "bogus"}),
        ("/api/v1/vendors", {"risk_score_1_5": 9}),
        ("/api/v1/vendors", {"search": {}}),
        ("/api/v1/kris", {"risk_id": "bogus"}),
        ("/api/v1/kris", {"breach_only": "bogus"}),
        ("/api/v1/kris", {"is_archived": {}}),
    ],
)
async def test_collection_json_scalar_filters_return_422(
    auth_client: AsyncClient,
    path: str,
    filters: dict[str, object],
):
    response = await auth_client.get(path, params={"filters": json.dumps(filters)})

    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("path", "filters"),
    [
        ("/api/v1/risks", {"include_archived": "false", "has_breach": "0", "min_net_score": "0"}),
        ("/api/v1/controls", {"include_archived": "0"}),
        ("/api/v1/issues", {"include_closed": "false", "overdue": "0"}),
        ("/api/v1/vendors", {"include_archived": "false", "dora_relevant": "0", "risk_score_1_5": "1"}),
        ("/api/v1/kris", {"breach_only": "false", "is_archived": "0"}),
    ],
)
async def test_collection_json_scalar_filters_accept_valid_values(
    auth_client: AsyncClient,
    path: str,
    filters: dict[str, str],
):
    response = await auth_client.get(path, params={"filters": json.dumps(filters)})

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_invalid_grouped_drilldowns_fail_closed(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
    seed_risk_types,
):
    risk = Risk(
        risk_id_code="GRP-INVALID-DRILLDOWN-RISK",
        name="Invalid Drilldown Risk",
        process="Invalid Drilldown Process",
        description="Visible risk proving invalid grouped drilldowns do not fall back to all rows",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        category="Invalid Drilldown Category",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    control = Control(
        name="Invalid Drilldown Control",
        description="Visible control proving invalid grouped drilldowns do not fall back to all rows",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="daily",
        risk_level=3,
        status="active",
    )
    issue = Issue(
        title="Invalid Drilldown Issue",
        description="Visible issue proving invalid grouped drilldowns do not fall back to all rows",
        severity="medium",
        source_type="manual",
        department_id=test_department.id,
        owner_user_id=test_user.id,
        created_by_id=test_user.id,
    )
    db_session.add_all([risk, control, issue])
    await db_session.flush()
    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name="Invalid Drilldown KRI",
        description="Visible KRI proving invalid grouped drilldowns do not fall back to all rows",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency="monthly",
    )
    db_session.add(kri)
    await db_session.commit()

    cases = [
        ("/api/v1/risks", {"group_by": "vendor", "group_value": "not-a-vendor-group"}),
        ("/api/v1/controls", {"group_by": "vendor", "group_value": "not-a-vendor-group"}),
        ("/api/v1/kris", {"group_by": "vendor", "group_value": "not-a-vendor-group"}),
        ("/api/v1/issues", {"group_by": "not_supported", "group_value": "not-a-real-group"}),
    ]
    for path, params in cases:
        response = await auth_client.get(path, params={"offset": 0, "limit": 10, **params})
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["items"] == []
        assert payload["total"] == 0


@pytest.mark.asyncio
async def test_risks_grouped_contract_returns_summary_and_drilldown(
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
    seed_risk_types,
):
    create_response = await auth_client.post(
        "/api/v1/risks",
        json={
            "risk_id_code": "GRP-RISK-001",
            "name": "Grouped Risk Contract",
            "process": "Grouped Process",
            "description": "Risk used by grouped contract tests",
            "department_id": test_department.id,
            "owner_id": test_user.id,
            "risk_type": "operational",
            "category": "Grouped Category",
            "gross_probability": 4,
            "gross_impact": 4,
            "net_probability": 4,
            "net_impact": 4,
            "status": "active",
        },
    )
    assert create_response.status_code == 201
    risk_id = create_response.json()["id"]

    summary_response = await auth_client.get(
        "/api/v1/risks",
        params={"offset": 0, "limit": 10, "group_by": "category"},
    )
    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert summary["items"] == []
    assert summary["offset"] == 0
    assert summary["limit"] == 10
    assert summary["total"] >= 1
    group = _group_by_value(summary["groups"], "Grouped Category")
    assert group is not None
    assert group["label"] == "Grouped Category"
    assert group["count"] >= 1
    assert group["active_count"] >= 1
    assert group["highlighted_count"] >= 1

    drilldown_response = await auth_client.get(
        "/api/v1/risks",
        params={
            "offset": 0,
            "limit": 10,
            "group_by": "category",
            "group_value": "Grouped Category",
        },
    )
    assert drilldown_response.status_code == 200
    drilldown = drilldown_response.json()
    assert drilldown["offset"] == 0
    assert drilldown["limit"] == 10
    assert any(item["id"] == risk_id for item in drilldown["items"])
    assert _group_by_value(drilldown["groups"], "Grouped Category") is not None


@pytest.mark.asyncio
async def test_risks_grouped_summary_does_not_serialize_all_rows(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
    seed_risk_types,
    monkeypatch: pytest.MonkeyPatch,
):
    risk = Risk(
        risk_id_code="GRP-BOUNDED-SUMMARY-001",
        name="Bounded Summary Risk",
        process="Bounded Summary Process",
        description="Risk proves grouped summaries do not serialize rows",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        category="Bounded Summary Category",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    db_session.add(risk)
    await db_session.commit()

    def fail_risk_summary(*args, **kwargs):
        raise AssertionError("group summaries should not serialize risk rows")

    monkeypatch.setattr("app.api.v1.endpoints.risks.crud.list.risk_to_summary", fail_risk_summary)

    response = await auth_client.get(
        "/api/v1/risks",
        params={"offset": 0, "limit": 10, "group_by": "category"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["items"] == []
    assert _group_by_value(payload["groups"], "Bounded Summary Category") is not None


@pytest.mark.asyncio
async def test_risks_grouped_drilldown_serializes_only_requested_page(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
    seed_risk_types,
    monkeypatch: pytest.MonkeyPatch,
):
    risks = [
        Risk(
            risk_id_code=f"GRP-BOUNDED-DRILL-{index:03d}",
            name=f"Bounded Drill Risk {index}",
            process="Bounded Drill Process",
            description="Risk proves grouped drilldowns serialize only the page",
            department_id=test_department.id,
            owner_id=test_user.id,
            risk_type="operational",
            category="Bounded Drill Category",
            gross_probability=3,
            gross_impact=3,
            net_probability=2,
            net_impact=2,
            status="active",
        )
        for index in range(3)
    ]
    db_session.add_all(risks)
    await db_session.commit()

    from app.api.mappers.risk import risk_to_summary as original_risk_to_summary

    serialized_ids: list[int] = []

    def spy_risk_summary(risk, *args, **kwargs):
        serialized_ids.append(risk.id)
        return original_risk_to_summary(risk, *args, **kwargs)

    monkeypatch.setattr("app.api.v1.endpoints.risks.crud.list.risk_to_summary", spy_risk_summary)

    response = await auth_client.get(
        "/api/v1/risks",
        params={
            "offset": 1,
            "limit": 1,
            "group_by": "category",
            "group_value": "Bounded Drill Category",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["items"]) == 1
    assert payload["total"] == 3
    assert len(serialized_ids) == 1
    assert serialized_ids == [payload["items"][0]["id"]]


@pytest.mark.asyncio
async def test_risks_vendor_grouping_treats_hidden_only_links_as_unlinked(
    client_employee: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user_employee: User,
    seed_risk_types,
):
    hidden_department = await _hidden_department(db_session, code="RHV")
    risk = Risk(
        risk_id_code="GRP-RISK-HIDDEN-VENDOR-001",
        name="Risk With Hidden Vendor Only",
        process="Risk Hidden Vendor Process",
        description="Visible risk with hidden-only vendor links",
        department_id=test_department.id,
        owner_id=test_user_employee.id,
        risk_type="operational",
        category="Risk Hidden Vendor Category",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    hidden_vendor = _vendor(name="Hidden Risk Group Vendor", department_id=hidden_department.id)
    db_session.add_all([risk, hidden_vendor])
    await db_session.commit()
    db_session.add(VendorRiskLink(vendor_id=hidden_vendor.id, risk_id=risk.id))
    await db_session.commit()

    summary_response = await client_employee.get(
        "/api/v1/risks",
        params={"offset": 0, "limit": 10, "group_by": "vendor"},
    )
    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert _group_by_value(summary["groups"], "Hidden Risk Group Vendor") is None
    unlinked_group = _group_by_value(summary["groups"], "__unlinked_vendor__")
    assert unlinked_group is not None, summary["groups"]
    assert unlinked_group["count"] >= 1

    drilldown_response = await client_employee.get(
        "/api/v1/risks",
        params={"offset": 0, "limit": 10, "group_by": "vendor", "group_value": "__unlinked_vendor__"},
    )
    assert drilldown_response.status_code == 200
    assert any(item["id"] == risk.id for item in drilldown_response.json()["items"])


@pytest.mark.asyncio
async def test_controls_grouped_contract_returns_summary_and_drilldown(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
    seed_risk_types,
):
    risk = Risk(
        risk_id_code="GRP-CONTROL-RISK-001",
        name="Grouped Control Risk",
        process="Grouped Control Process",
        description="Risk linked to grouped control",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        category="Grouped Control Category",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    secondary_risk = Risk(
        risk_id_code="GRP-CONTROL-RISK-002",
        name="Grouped Control Secondary Risk",
        process="Grouped Control Process",
        description="Second risk linked to grouped control",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        category="Grouped Control Category",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    db_session.add(secondary_risk)
    await db_session.commit()
    await db_session.refresh(secondary_risk)

    create_response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "Grouped Control Contract",
            "description": "Control used by grouped contract tests",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "manual",
            "frequency": "daily",
            "risk_level": 5,
            "status": "active",
        },
    )
    assert create_response.status_code == 201
    control_id = create_response.json()["id"]
    db_session.add_all(
        [
            ControlRiskLink(control_id=control_id, risk_id=risk.id),
            ControlRiskLink(control_id=control_id, risk_id=secondary_risk.id),
        ]
    )
    await db_session.commit()

    summary_response = await auth_client.get(
        "/api/v1/controls",
        params={"offset": 0, "limit": 10, "group_by": "process"},
    )
    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert summary["items"] == []
    assert summary["offset"] == 0
    assert summary["limit"] == 10
    group = _group_by_value(summary["groups"], "Grouped Control Process")
    assert group is not None, summary["groups"]
    assert group["count"] >= 1
    assert group["highlighted_count"] >= 1

    drilldown_response = await auth_client.get(
        "/api/v1/controls",
        params={"offset": 0, "limit": 10, "group_by": "process", "group_value": "Grouped Control Process"},
    )
    assert drilldown_response.status_code == 200
    drilldown = drilldown_response.json()
    assert any(item["id"] == control_id for item in drilldown["items"])
    assert _group_by_value(drilldown["groups"], "Grouped Control Process") is not None

    risk_summary_response = await auth_client.get(
        "/api/v1/controls",
        params={"offset": 0, "limit": 10, "group_by": "risk"},
    )
    assert risk_summary_response.status_code == 200
    risk_summary = risk_summary_response.json()
    primary_group = _group_by_value(risk_summary["groups"], "Grouped Control Risk")
    secondary_group = _group_by_value(risk_summary["groups"], "Grouped Control Secondary Risk")
    assert primary_group is not None, risk_summary["groups"]
    assert secondary_group is not None, risk_summary["groups"]
    assert primary_group["count"] >= 1
    assert secondary_group["count"] >= 1

    primary_drilldown_response = await auth_client.get(
        "/api/v1/controls",
        params={"offset": 0, "limit": 10, "group_by": "risk", "group_value": "Grouped Control Risk"},
    )
    assert primary_drilldown_response.status_code == 200
    assert any(item["id"] == control_id for item in primary_drilldown_response.json()["items"])

    secondary_drilldown_response = await auth_client.get(
        "/api/v1/controls",
        params={
            "offset": 0,
            "limit": 10,
            "group_by": "risk",
            "group_value": "Grouped Control Secondary Risk",
        },
    )
    assert secondary_drilldown_response.status_code == 200
    assert any(item["id"] == control_id for item in secondary_drilldown_response.json()["items"])


@pytest.mark.asyncio
async def test_controls_grouped_summary_does_not_serialize_all_rows(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    control = Control(
        name="Bounded Control Summary",
        description="Control proves grouped summaries do not serialize rows",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="daily",
        risk_level=5,
        status="active",
    )
    db_session.add(control)
    await db_session.commit()

    async def fail_control_capabilities(*args, **kwargs):
        raise AssertionError("control group summaries should not serialize control rows")

    monkeypatch.setattr("app.api.v1.endpoints.controls.crud.list.control_capabilities", fail_control_capabilities)

    response = await auth_client.get(
        "/api/v1/controls",
        params={"offset": 0, "limit": 10, "group_by": "category"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["items"] == []
    assert _group_by_value(payload["groups"], "manual") is not None


@pytest.mark.asyncio
async def test_controls_grouped_drilldown_serializes_only_requested_page(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    controls = [
        Control(
            name=f"Bounded Control Drill {index}",
            description="Control proves grouped drilldowns serialize only requested page",
            department_id=test_department.id,
            control_owner_id=test_user.id,
            control_form="manual",
            frequency="daily",
            risk_level=5,
            status="active",
        )
        for index in range(3)
    ]
    db_session.add_all(controls)
    await db_session.commit()

    serialized_control_ids: list[int] = []
    from app.services.authorization_capabilities import control_capabilities as original_control_capabilities

    async def spy_control_capabilities(_db, *, current_user, control):
        serialized_control_ids.append(control.id)
        return await original_control_capabilities(_db, current_user=current_user, control=control)

    monkeypatch.setattr("app.api.v1.endpoints.controls.crud.list.control_capabilities", spy_control_capabilities)

    response = await auth_client.get(
        "/api/v1/controls",
        params={"offset": 1, "limit": 1, "group_by": "category", "group_value": "manual"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["items"]) == 1
    assert payload["total"] == 3
    assert len(serialized_control_ids) == 1
    assert serialized_control_ids == [payload["items"][0]["id"]]


@pytest.mark.asyncio
async def test_controls_grouping_redacts_hidden_linked_risk_and_vendor_contexts(
    client_employee: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user_employee: User,
    seed_risk_types,
):
    hidden_department = await _hidden_department(db_session, code="CHV")
    hidden_risk = Risk(
        risk_id_code="GRP-CONTROL-HIDDEN-RISK-001",
        name="Hidden Control Group Risk",
        process="Hidden Control Process",
        description="Hidden risk linked to visible control",
        department_id=hidden_department.id,
        owner_id=99999,
        risk_type="operational",
        category="Hidden Control Category",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    control = Control(
        name="Visible Control Hidden Links",
        description="Visible control with hidden linked risk and vendor",
        department_id=test_department.id,
        control_owner_id=99999,
        control_form="manual",
        frequency="daily",
        risk_level=5,
        status="active",
    )
    hidden_vendor = _vendor(name="Hidden Control Group Vendor", department_id=hidden_department.id)
    db_session.add_all([hidden_risk, control, hidden_vendor])
    await db_session.commit()
    db_session.add_all(
        [
            ControlRiskLink(control_id=control.id, risk_id=hidden_risk.id),
            VendorControlLink(vendor_id=hidden_vendor.id, control_id=control.id),
        ]
    )
    await db_session.commit()

    process_summary = await client_employee.get(
        "/api/v1/controls",
        params={"offset": 0, "limit": 10, "group_by": "process"},
    )
    assert process_summary.status_code == 200
    process_groups = process_summary.json()["groups"]
    assert _group_by_value(process_groups, "Hidden Control Process") is None
    assert _group_by_value(process_groups, "__no_process__") is not None

    risk_summary = await client_employee.get(
        "/api/v1/controls",
        params={"offset": 0, "limit": 10, "group_by": "risk"},
    )
    assert risk_summary.status_code == 200
    risk_groups = risk_summary.json()["groups"]
    assert _group_by_value(risk_groups, "Hidden Control Group Risk") is None
    assert _group_by_value(risk_groups, "__unknown_risk__") is not None

    vendor_summary = await client_employee.get(
        "/api/v1/controls",
        params={"offset": 0, "limit": 10, "group_by": "vendor"},
    )
    assert vendor_summary.status_code == 200
    vendor_groups = vendor_summary.json()["groups"]
    assert _group_by_value(vendor_groups, "Hidden Control Group Vendor") is None
    assert _group_by_value(vendor_groups, "__unlinked_vendor__") is not None

    unlinked_drilldown = await client_employee.get(
        "/api/v1/controls",
        params={"offset": 0, "limit": 10, "group_by": "vendor", "group_value": "__unlinked_vendor__"},
    )
    assert unlinked_drilldown.status_code == 200
    assert any(item["id"] == control.id for item in unlinked_drilldown.json()["items"])


@pytest.mark.asyncio
async def test_issues_grouped_contract_uses_risk_contexts_for_category_drilldown(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
    seed_risk_types,
):
    risk = Risk(
        risk_id_code="GRP-ISSUE-RISK-001",
        name="Grouped Issue Risk",
        process="Grouped Issue Process",
        description="Risk linked to grouped issue",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        category="Grouped Issue Category",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    create_response = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Grouped Issue Contract",
            "description": "Issue used by grouped contract tests",
            "severity": "critical",
            "source_type": "manual",
            "department_id": test_department.id,
        },
    )
    assert create_response.status_code == 201
    issue_id = create_response.json()["id"]

    db_session.add(IssueLink(issue_id=issue_id, risk_id=risk.id))
    await db_session.commit()

    summary_response = await auth_client.get(
        "/api/v1/issues",
        params={"offset": 0, "limit": 10, "group_by": "category"},
    )
    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert summary["items"] == []
    group = _group_by_value(summary["groups"], "Grouped Issue Category")
    assert group is not None
    assert group["count"] >= 1
    assert group["highlighted_count"] >= 1

    drilldown_response = await auth_client.get(
        "/api/v1/issues",
        params={
            "offset": 0,
            "limit": 10,
            "group_by": "category",
            "group_value": "Grouped Issue Category",
        },
    )
    assert drilldown_response.status_code == 200
    drilldown = drilldown_response.json()
    assert any(item["id"] == issue_id for item in drilldown["items"])
    assert _group_by_value(drilldown["groups"], "Grouped Issue Category") is not None


@pytest.mark.asyncio
async def test_issues_grouped_summary_does_not_serialize_all_rows(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    monkeypatch: pytest.MonkeyPatch,
):
    issue = Issue(
        title="Bounded Issue Summary",
        description="Issue proves grouped summaries do not serialize rows",
        severity="critical",
        status="open",
        department_id=test_department.id,
        source_type="manual",
    )
    db_session.add(issue)
    await db_session.commit()

    async def fail_issue_capabilities(*args, **kwargs):
        raise AssertionError("issue group summaries should not serialize issue rows")

    monkeypatch.setattr("app.api.v1.endpoints.issues.crud.list.issue_capabilities", fail_issue_capabilities)

    response = await auth_client.get(
        "/api/v1/issues",
        params={"offset": 0, "limit": 10, "group_by": "department"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["items"] == []
    assert _group_by_value(payload["groups"], test_department.name) is not None


@pytest.mark.asyncio
async def test_issues_grouped_drilldown_serializes_only_requested_page(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    monkeypatch: pytest.MonkeyPatch,
):
    issues = [
        Issue(
            title=f"Bounded Issue Drill {index}",
            description="Issue proves grouped drilldowns serialize only requested page",
            severity="critical",
            status="open",
            department_id=test_department.id,
            source_type="manual",
        )
        for index in range(3)
    ]
    db_session.add_all(issues)
    await db_session.commit()

    serialized_issue_ids: list[int] = []
    from app.services.authorization_capabilities import issue_capabilities as original_issue_capabilities

    async def spy_issue_capabilities(_db, *, current_user, issue):
        serialized_issue_ids.append(issue.id)
        return await original_issue_capabilities(_db, current_user=current_user, issue=issue)

    monkeypatch.setattr("app.api.v1.endpoints.issues.crud.list.issue_capabilities", spy_issue_capabilities)

    response = await auth_client.get(
        "/api/v1/issues",
        params={"offset": 1, "limit": 1, "group_by": "department", "group_value": test_department.name},
    )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["items"]) == 1
    assert payload["total"] == 3
    assert len(serialized_issue_ids) == 1
    assert serialized_issue_ids == [payload["items"][0]["id"]]


@pytest.mark.asyncio
async def test_issues_grouping_redacts_hidden_linked_risk_and_vendor_contexts(
    client_employee: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_role_employee: Role,
    test_user_employee: User,
    seed_risk_types,
):
    await _grant_permission(db_session, test_role_employee, "issues", "read")
    hidden_department = await _hidden_department(db_session, code="IHV")
    hidden_risk = Risk(
        risk_id_code="GRP-ISSUE-HIDDEN-RISK-001",
        name="Hidden Issue Group Risk",
        process="Hidden Issue Process",
        description="Hidden risk linked to visible issue",
        department_id=hidden_department.id,
        owner_id=99999,
        risk_type="operational",
        category="Hidden Issue Category",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    issue = Issue(
        title="Visible Issue Hidden Links",
        description="Visible issue with hidden linked contexts",
        severity="critical",
        status="open",
        department_id=test_department.id,
        source_type="manual",
        owner_user_id=test_user_employee.id,
        created_by_id=test_user_employee.id,
    )
    hidden_vendor = _vendor(name="Hidden Issue Group Vendor", department_id=hidden_department.id)
    db_session.add_all([hidden_risk, issue, hidden_vendor])
    await db_session.commit()
    db_session.add_all(
        [
            IssueLink(issue_id=issue.id, risk_id=hidden_risk.id),
            IssueLink(issue_id=issue.id, vendor_id=hidden_vendor.id),
        ]
    )
    await db_session.commit()

    category_summary = await client_employee.get(
        "/api/v1/issues",
        params={"offset": 0, "limit": 10, "group_by": "category"},
    )
    assert category_summary.status_code == 200
    category_groups = category_summary.json()["groups"]
    assert _group_by_value(category_groups, "Hidden Issue Category") is None
    assert _group_by_value(category_groups, "__uncategorized__") is not None

    vendor_summary = await client_employee.get(
        "/api/v1/issues",
        params={"offset": 0, "limit": 10, "group_by": "vendor"},
    )
    assert vendor_summary.status_code == 200
    vendor_groups = vendor_summary.json()["groups"]
    assert _group_by_value(vendor_groups, "Hidden Issue Group Vendor") is None
    assert _group_by_value(vendor_groups, "__unlinked_vendor__") is not None

    uncategorized_drilldown = await client_employee.get(
        "/api/v1/issues",
        params={"offset": 0, "limit": 10, "group_by": "category", "group_value": "__uncategorized__"},
    )
    assert uncategorized_drilldown.status_code == 200
    assert any(item["id"] == issue.id for item in uncategorized_drilldown.json()["items"])


@pytest.mark.asyncio
async def test_kris_grouped_summary_does_not_serialize_all_rows(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
    seed_risk_types,
    monkeypatch: pytest.MonkeyPatch,
):
    risk = Risk(
        risk_id_code="GRP-KRI-SUMMARY-RISK-001",
        name="Bounded KRI Summary Risk",
        process="Bounded KRI Process",
        description="Risk linked to bounded KRI summary",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        category="Bounded KRI Category",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    db_session.add(risk)
    await db_session.flush()
    db_session.add(
        KeyRiskIndicator(
            risk_id=risk.id,
            metric_name="Bounded KRI Summary",
            description="KRI proves grouped summaries do not serialize rows",
            current_value=50.0,
            lower_limit=0.0,
            upper_limit=100.0,
            unit="%",
            frequency="monthly",
        )
    )
    await db_session.commit()

    async def fail_kri_capabilities(*args, **kwargs):
        raise AssertionError("KRI group summaries should not serialize KRI rows")

    monkeypatch.setattr("app.api.v1.endpoints.kris.crud.list.kri_capabilities", fail_kri_capabilities)

    response = await auth_client.get(
        "/api/v1/kris",
        params={"offset": 0, "limit": 10, "group_by": "category"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["items"] == []
    assert _group_by_value(payload["groups"], "Bounded KRI Category") is not None


@pytest.mark.asyncio
async def test_kris_grouped_drilldown_serializes_only_requested_page(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
    seed_risk_types,
    monkeypatch: pytest.MonkeyPatch,
):
    risk = Risk(
        risk_id_code="GRP-KRI-DRILL-RISK-001",
        name="Bounded KRI Drill Risk",
        process="Bounded KRI Drill Process",
        description="Risk linked to bounded KRI drilldowns",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        category="Bounded KRI Drill Category",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    db_session.add(risk)
    await db_session.flush()
    kris = [
        KeyRiskIndicator(
            risk_id=risk.id,
            metric_name=f"Bounded KRI Drill {index}",
            description="KRI proves grouped drilldowns serialize only requested page",
            current_value=50.0,
            lower_limit=0.0,
            upper_limit=100.0,
            unit="%",
            frequency="monthly",
        )
        for index in range(3)
    ]
    db_session.add_all(kris)
    await db_session.commit()

    serialized_kri_ids: list[int] = []
    from app.services.authorization_capabilities import kri_capabilities as original_kri_capabilities

    async def spy_kri_capabilities(_db, *, current_user, kri):
        serialized_kri_ids.append(kri.id)
        return await original_kri_capabilities(_db, current_user=current_user, kri=kri)

    monkeypatch.setattr("app.api.v1.endpoints.kris.crud.list.kri_capabilities", spy_kri_capabilities)

    response = await auth_client.get(
        "/api/v1/kris",
        params={
            "offset": 1,
            "limit": 1,
            "group_by": "category",
            "group_value": "Bounded KRI Drill Category",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["items"]) == 1
    assert payload["total"] == 3
    assert len(serialized_kri_ids) == 1
    assert serialized_kri_ids == [payload["items"][0]["id"]]


@pytest.mark.asyncio
async def test_kris_vendor_grouping_treats_hidden_only_links_as_unlinked(
    client_employee: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user_employee: User,
    seed_risk_types,
):
    hidden_department = await _hidden_department(db_session, code="KHV")
    risk = Risk(
        risk_id_code="GRP-KRI-HIDDEN-VENDOR-RISK-001",
        name="KRI Hidden Vendor Risk",
        process="KRI Hidden Vendor Process",
        description="Visible risk for hidden vendor KRI grouping",
        department_id=test_department.id,
        owner_id=test_user_employee.id,
        risk_type="operational",
        category="KRI Hidden Vendor Category",
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
        metric_name="KRI With Hidden Vendor Only",
        description="Visible KRI with hidden-only vendor links",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency="monthly",
    )
    hidden_vendor = _vendor(name="Hidden KRI Group Vendor", department_id=hidden_department.id)
    db_session.add_all([kri, hidden_vendor])
    await db_session.commit()
    db_session.add(VendorKRILink(vendor_id=hidden_vendor.id, kri_id=kri.id))
    await db_session.commit()

    summary_response = await client_employee.get(
        "/api/v1/kris",
        params={"offset": 0, "limit": 10, "group_by": "vendor"},
    )
    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert _group_by_value(summary["groups"], "Hidden KRI Group Vendor") is None
    assert _group_by_value(summary["groups"], "__unlinked_vendor__") is not None

    drilldown_response = await client_employee.get(
        "/api/v1/kris",
        params={"offset": 0, "limit": 10, "group_by": "vendor", "group_value": "__unlinked_vendor__"},
    )
    assert drilldown_response.status_code == 200
    assert any(item["id"] == kri.id for item in drilldown_response.json()["items"])


@pytest.mark.asyncio
async def test_vendors_grouped_contract_supports_flag_multi_membership(
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
):
    create_response = await auth_client.post(
        "/api/v1/vendors",
        json={
            "name": "Grouped Vendor Contract",
            "process": "Grouped Vendor Process",
            "department_id": test_department.id,
            "outsourcing_owner_user_id": test_user.id,
            "vendor_type": "ict",
            "risk_score_1_5": 5,
            "supports_important_core_insurance_function": True,
            "dora_relevant": True,
            "is_significant_vendor": False,
            "has_alternative_providers": False,
            "status": "active",
        },
    )
    assert create_response.status_code == 201
    vendor_id = create_response.json()["id"]

    summary_response = await auth_client.get(
        "/api/v1/vendors",
        params={"offset": 0, "limit": 10, "group_by": "flag", "search": "Grouped Vendor Contract"},
    )
    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert summary["items"] == []
    assert summary["total"] == 1
    dora_group = _group_by_value(summary["groups"], "__dora_relevant__")
    core_group = _group_by_value(summary["groups"], "__supports_core_function__")
    assert dora_group is not None
    assert core_group is not None
    assert dora_group["count"] == 1
    assert core_group["count"] == 1

    drilldown_response = await auth_client.get(
        "/api/v1/vendors",
        params={
            "offset": 0,
            "limit": 10,
            "group_by": "flag",
            "group_value": "__dora_relevant__",
            "search": "Grouped Vendor Contract",
        },
    )
    assert drilldown_response.status_code == 200
    drilldown = drilldown_response.json()
    assert any(item["id"] == vendor_id for item in drilldown["items"])
    assert _group_by_value(drilldown["groups"], "__supports_core_function__") is not None


@pytest.mark.asyncio
async def test_vendors_risk_grouped_summary_total_counts_distinct_vendors(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
):
    vendor = _vendor(
        name="Grouped Vendor Multi Risk Contract",
        department_id=test_department.id,
        owner_user_id=test_user.id,
    )
    first_risk = Risk(
        risk_id_code="VENDOR-MULTI-RISK-001",
        name="Vendor Multi Risk One",
        process="Vendor Multi Risk Process",
        description="First visible risk linked to the same grouped vendor",
        category="Vendor Multi Risk Category",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    second_risk = Risk(
        risk_id_code="VENDOR-MULTI-RISK-002",
        name="Vendor Multi Risk Two",
        process="Vendor Multi Risk Process",
        description="Second visible risk linked to the same grouped vendor",
        category="Vendor Multi Risk Category",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    db_session.add_all([vendor, first_risk, second_risk])
    await db_session.flush()
    db_session.add_all(
        [
            VendorRiskLink(vendor_id=vendor.id, risk_id=first_risk.id),
            VendorRiskLink(vendor_id=vendor.id, risk_id=second_risk.id),
        ]
    )
    await db_session.commit()

    summary_response = await auth_client.get(
        "/api/v1/vendors",
        params={"offset": 0, "limit": 10, "group_by": "risk", "search": "Grouped Vendor Multi Risk Contract"},
    )
    assert summary_response.status_code == 200, summary_response.text
    summary = summary_response.json()
    assert summary["items"] == []
    assert summary["total"] == 1
    first_group = _group_by_value(summary["groups"], f"risk:{first_risk.id}")
    second_group = _group_by_value(summary["groups"], f"risk:{second_risk.id}")
    assert first_group is not None
    assert second_group is not None
    assert first_group["count"] == 1
    assert second_group["count"] == 1


@pytest.mark.asyncio
async def test_vendors_grouped_requests_use_bounded_sql_path(
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    create_response = await auth_client.post(
        "/api/v1/vendors",
        json={
            "name": "Bounded Grouped Vendor",
            "process": "Bounded Vendor Process",
            "department_id": test_department.id,
            "outsourcing_owner_user_id": test_user.id,
            "vendor_type": "ict",
            "risk_score_1_5": 5,
            "supports_important_core_insurance_function": False,
            "dora_relevant": False,
            "is_significant_vendor": False,
            "has_alternative_providers": False,
            "status": "active",
        },
    )
    assert create_response.status_code == 201
    vendor_id = create_response.json()["id"]

    import app.api.v1.endpoints.vendors.crud as vendor_crud

    async def fail_full_group_serialization(*args, **kwargs):
        raise AssertionError("grouped vendor requests must not serialize all matched vendors")

    monkeypatch.setattr(vendor_crud, "serialize_vendor_reads", fail_full_group_serialization, raising=False)

    summary_response = await auth_client.get(
        "/api/v1/vendors",
        params={"offset": 0, "limit": 10, "group_by": "process"},
    )
    assert summary_response.status_code == 200, summary_response.text
    summary = summary_response.json()
    assert summary["items"] == []
    assert _group_by_value(summary["groups"], "Bounded Vendor Process") is not None

    drilldown_response = await auth_client.get(
        "/api/v1/vendors",
        params={"offset": 0, "limit": 10, "group_by": "process", "group_value": "Bounded Vendor Process"},
    )
    assert drilldown_response.status_code == 200, drilldown_response.text
    drilldown = drilldown_response.json()
    assert any(item["id"] == vendor_id for item in drilldown["items"])


@pytest.mark.asyncio
async def test_vendors_risk_grouping_treats_hidden_only_links_as_unlinked(
    client_employee: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
    test_user_employee: User,
):
    vendor = _vendor(
        name="Vendor With Hidden Risk Only",
        department_id=test_department.id,
        owner_user_id=test_user_employee.id,
    )
    hidden_department = await _hidden_department(db_session, code="VHRO")
    hidden_risk = Risk(
        risk_id_code="VENDOR-HIDDEN-RISK-001",
        name="Hidden Vendor Group Risk",
        process="Hidden Vendor Risk Process",
        description="Hidden risk linked to a visible vendor",
        category="Vendor Hidden Risk Category",
        department_id=hidden_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    db_session.add_all([vendor, hidden_risk])
    await db_session.flush()
    db_session.add(VendorRiskLink(vendor_id=vendor.id, risk_id=hidden_risk.id))
    await db_session.commit()

    summary_response = await client_employee.get(
        "/api/v1/vendors",
        params={"offset": 0, "limit": 10, "group_by": "risk"},
    )
    assert summary_response.status_code == 200, summary_response.text
    summary = summary_response.json()
    assert _group_by_value(summary["groups"], f"risk:{hidden_risk.id}") is None
    unlinked_group = _group_by_value(summary["groups"], "__unlinked_risk__")
    assert unlinked_group is not None
    assert unlinked_group["count"] >= 1

    drilldown_response = await client_employee.get(
        "/api/v1/vendors",
        params={"offset": 0, "limit": 10, "group_by": "risk", "group_value": "__unlinked_risk__"},
    )
    assert drilldown_response.status_code == 200, drilldown_response.text
    drilldown = drilldown_response.json()
    assert any(item["id"] == vendor.id for item in drilldown["items"])
