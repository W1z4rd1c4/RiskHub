from __future__ import annotations

import csv
import io
import json

import pytest
from httpx import AsyncClient
from sqlalchemy.dialects import postgresql

from app.models import Control, ControlRiskLink, Department, Risk, RiskTypeConfig, User
from app.services._collection_contracts import CollectionQuery, CollectionSort
from app.services._register_listings.controls import (
    ControlListingCriteria,
    build_control_listing_plan,
)


def _risk_payload(
    *, code: str, name: str, department: Department, owner: User, category: str
) -> dict:
    return {
        "risk_id_code": code,
        "name": name,
        "process": "Shared collection process",
        "description": "Shared Risk collection contract",
        "department_id": department.id,
        "owner_id": owner.id,
        "risk_type": "operational",
        "category": category,
        "gross_probability": 4,
        "gross_impact": 4,
        "net_probability": 3,
        "net_impact": 3,
        "status": "active",
    }


def _control_payload(
    *, name: str, department: Department, owner: User, control_form: str
) -> dict:
    return {
        "name": name,
        "description": "Shared Control collection contract",
        "department_id": department.id,
        "control_owner_id": owner.id,
        "control_form": control_form,
        "frequency": "monthly",
        "risk_level": 3,
        "status": "active",
    }


@pytest.mark.asyncio
async def test_risk_shared_facets_sort_and_group_preserving_unpaged_export(
    auth_client: AsyncClient,
    test_user: User,
    test_department: Department,
    seed_risk_types,
):
    created = []
    for code, name, category in (
        ("R-SHARED-81-A", "Shared Risk Alpha", "Finance"),
        ("R-SHARED-81-B", "Shared Risk Beta", "Finance"),
        ("R-SHARED-81-C", "Shared Risk Gamma", "Operations"),
    ):
        response = await auth_client.post(
            "/api/v1/risks",
            json=_risk_payload(
                code=code,
                name=name,
                department=test_department,
                owner=test_user,
                category=category,
            ),
        )
        assert response.status_code == 201, response.text
        created.append(response.json())

    listed = await auth_client.get(
        "/api/v1/risks",
        params={
            "filters": json.dumps(
                {"risk_type": "operational", "search": "Shared Risk"}
            ),
            "sort": json.dumps({"field": "name", "direction": "desc"}),
        },
    )
    assert listed.status_code == 200, listed.text
    assert [row["name"] for row in listed.json()["items"]][:3] == [
        "Shared Risk Gamma",
        "Shared Risk Beta",
        "Shared Risk Alpha",
    ]
    risk_type_facets = {
        row["value"]: row for row in listed.json()["facets"]["risk_type"]
    }
    assert risk_type_facets["operational"]["selected"] is True
    assert risk_type_facets["operational"]["count"] >= 3
    department_facet = next(
        row
        for row in listed.json()["facets"]["department"]
        if row["value"] == str(test_department.id)
    )
    assert department_facet["label"] == test_department.name
    assert "id" not in department_facet["meta"]

    exported = await auth_client.get(
        "/api/v1/risks/export",
        params={
            "limit": 1,
            "filters": json.dumps({"search": "Shared Risk"}),
            "group_by": "category",
            "group_value": "Finance",
            "locale": "cs",
        },
    )
    assert exported.status_code == 200, exported.text
    export_rows = list(csv.DictReader(io.StringIO(exported.text)))
    assert {row["risk_id"] for row in export_rows} == {
        "R-SHARED-81-A",
        "R-SHARED-81-B",
    }
    assert {row["priority_label"] for row in export_rows} == {"Ne"}
    assert {row["risk_type_code"] for row in export_rows} == {"operational"}
    assert {row["risk_type_label"] for row in export_rows} == {"Operační"}


@pytest.mark.asyncio
async def test_control_shared_facets_sort_and_group_preserving_unpaged_export(
    auth_client: AsyncClient,
    test_user: User,
    test_department: Department,
):
    for name, control_form in (
        ("Shared Control Alpha", "manual"),
        ("Shared Control Beta", "manual"),
        ("Shared Control Gamma", "automatic"),
    ):
        response = await auth_client.post(
            "/api/v1/controls",
            json=_control_payload(
                name=name,
                department=test_department,
                owner=test_user,
                control_form=control_form,
            ),
        )
        assert response.status_code == 201, response.text

    listed = await auth_client.get(
        "/api/v1/controls",
        params={
            "filters": json.dumps({"search": "Shared Control", "status": "active"}),
            "sort": json.dumps({"field": "name", "direction": "desc"}),
        },
    )
    assert listed.status_code == 200, listed.text
    assert [row["name"] for row in listed.json()["items"]][:3] == [
        "Shared Control Gamma",
        "Shared Control Beta",
        "Shared Control Alpha",
    ]
    status_facets = {row["value"]: row for row in listed.json()["facets"]["status"]}
    assert status_facets["active"]["selected"] is True
    assert status_facets["active"]["count"] >= 3
    assert listed.json()["facets"]["monitoring_status"]

    exported = await auth_client.get(
        "/api/v1/controls/export",
        params={
            "limit": 1,
            "filters": json.dumps({"search": "Shared Control"}),
            "group_by": "category",
            "group_value": "manual",
            "locale": "cs",
        },
    )
    assert exported.status_code == 200, exported.text
    export_rows = list(csv.DictReader(io.StringIO(exported.text)))
    assert {row["name"] for row in export_rows} == {
        "Shared Control Alpha",
        "Shared Control Beta",
    }
    assert {row["control_form_label"] for row in export_rows} == {"Manuální"}
    assert {row["frequency_label"] for row in export_rows} == {"Měsíčně"}


@pytest.mark.asyncio
async def test_risk_control_facets_do_not_leak_foreign_department_or_hidden_link_context(
    client_employee: AsyncClient,
    db_session,
    test_user_employee: User,
    test_department: Department,
):
    second_department = Department(
        name="Hidden facet department",
        code="HIDDEN-FACET-81",
        is_active=True,
    )
    db_session.add(second_department)
    await db_session.flush()
    foreign_risk = Risk(
        risk_id_code="R-SHARED-81-HIDDEN",
        name="Hidden foreign Risk",
        process="Hidden linked process",
        description="Must not contribute to scoped facets",
        department_id=second_department.id,
        owner_id=None,
        risk_type="operational",
        category="Hidden category",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    visible_control = Control(
        name="Visible Control with hidden context",
        description="Control remains visible without leaking its linked Risk",
        department_id=test_department.id,
        control_owner_id=None,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status="active",
    )
    db_session.add_all([foreign_risk, visible_control])
    await db_session.flush()
    db_session.add(
        ControlRiskLink(control_id=visible_control.id, risk_id=foreign_risk.id)
    )
    await db_session.commit()

    risk_response = await client_employee.get("/api/v1/risks")
    assert risk_response.status_code == 200, risk_response.text
    assert "Hidden category" not in {
        row["value"] for row in risk_response.json()["facets"]["category"]
    }

    control_response = await client_employee.get(
        "/api/v1/controls",
        params={
            "filters": json.dumps({"search": "Visible Control with hidden context"})
        },
    )
    assert control_response.status_code == 200, control_response.text
    assert [row["name"] for row in control_response.json()["items"]] == [
        "Visible Control with hidden context"
    ]
    assert "Hidden linked process" not in {
        row["value"] for row in control_response.json()["facets"]["process"]
    }
    assert "Hidden category" not in {
        row["value"] for row in control_response.json()["facets"]["category"]
    }

    hidden_search = await client_employee.get(
        "/api/v1/controls",
        params={"filters": json.dumps({"search": "Hidden foreign Risk"})},
    )
    assert hidden_search.status_code == 200, hidden_search.text
    assert hidden_search.json()["items"] == []


@pytest.mark.asyncio
async def test_risk_control_normalized_exports_reject_unknown_group_contract(
    auth_client: AsyncClient,
):
    for path in ("/api/v1/risks/export", "/api/v1/controls/export"):
        response = await auth_client.get(
            path,
            params={"group_by": "unknown", "group_value": "anything"},
        )
        assert response.status_code == 400, response.text


@pytest.mark.asyncio
async def test_risk_normalized_export_uses_configured_label_for_custom_risk_type(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
):
    db_session.add(
        RiskTypeConfig(
            code="cyber_resilience",
            display_name="Cyber resilience",
            description="Custom configured Risk type",
            color="#334155",
            sort_order=50,
            is_active=True,
            is_system=False,
        )
    )
    db_session.add(
        Risk(
            risk_id_code="R-SHARED-81-CUSTOM-TYPE",
            name="Custom configured Risk type export",
            process="Technology",
            description="Proves configured display-name fallback",
            department_id=test_department.id,
            owner_id=test_user.id,
            risk_type="cyber_resilience",
            category="Technology",
            gross_probability=3,
            gross_impact=3,
            gross_score=9,
            net_probability=2,
            net_impact=2,
            net_score=4,
            status="active",
        )
    )
    await db_session.commit()

    response = await auth_client.get(
        "/api/v1/risks/export",
        params={
            "filters": json.dumps({"search": "Custom configured Risk type export"}),
            "locale": "cs",
        },
    )

    assert response.status_code == 200, response.text
    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert len(rows) == 1
    assert rows[0]["risk_type_code"] == "cyber_resilience"
    assert rows[0]["risk_type_label"] == "Cyber resilience"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("path", "report_path"),
    (
        ("/api/v1/risks/export", "/api/v1/reports/risks/export"),
        ("/api/v1/controls/export", "/api/v1/reports/controls/export"),
    ),
)
async def test_normalized_exports_reject_historical_date_instead_of_ignoring_it(
    auth_client: AsyncClient,
    path: str,
    report_path: str,
):
    response = await auth_client.get(path, params={"as_of_date": "2025-01-15"})

    assert response.status_code == 400, response.text
    detail = response.json()["detail"]
    assert detail["code"] == "point_in_time_export_requires_report"
    assert report_path in detail["message"]


@pytest.mark.asyncio
async def test_control_department_sort_projects_postgresql_distinct_order_expression(
    db_session,
    test_user: User,
):
    plan = await build_control_listing_plan(
        db=db_session,
        current_user=test_user,
        criteria=ControlListingCriteria(
            query=CollectionQuery(
                sort=CollectionSort(field="department", direction="asc")
            ),
            filters={},
        ),
    )

    compiled = str(plan.ordered_query.compile(dialect=postgresql.dialect()))
    select_clause = compiled.partition("FROM controls")[0]
    assert "SELECT DISTINCT" in select_clause
    assert "departments.name AS _department_sort" in select_clause
    assert "ORDER BY departments.name ASC" in compiled


@pytest.mark.asyncio
async def test_risk_control_facets_scale_past_500_without_entity_materialization(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
):
    row_count = 520
    risks = [
        Risk(
            risk_id_code=f"R-SHARED-81-SCALE-{index:04d}",
            name=f"Shared facet scale Risk {index:04d}",
            process="Shared facet scale process",
            description="Exercises bounded aggregate Risk facets",
            department_id=test_department.id,
            owner_id=test_user.id,
            risk_type="operational",
            category="Shared facet scale category",
            gross_probability=3,
            gross_impact=3,
            gross_score=9,
            net_probability=2,
            net_impact=2,
            net_score=4,
            status="active",
        )
        for index in range(row_count)
    ]
    controls = [
        Control(
            name=f"Shared facet scale Control {index:04d}",
            description="Exercises bounded aggregate Control facets",
            department_id=test_department.id,
            control_owner_id=test_user.id,
            control_form="manual",
            frequency="monthly",
            risk_level=3,
            status="active",
        )
        for index in range(row_count)
    ]
    db_session.add_all([*risks, *controls])
    await db_session.flush()
    db_session.add_all(
        [
            ControlRiskLink(control_id=control.id, risk_id=risk.id)
            for control, risk in zip(controls, risks, strict=True)
        ]
    )
    await db_session.commit()

    risk_response = await auth_client.get(
        "/api/v1/risks",
        params={"filters": json.dumps({"category": "missing selected category"})},
    )
    assert risk_response.status_code == 200, risk_response.text
    risk_facets = risk_response.json()["facets"]
    assert next(
        option["count"]
        for option in risk_facets["process"]
        if option["value"] == "Shared facet scale process"
    ) == row_count
    selected_zero = next(
        option
        for option in risk_facets["category"]
        if option["value"] == "missing selected category"
    )
    assert selected_zero == {
        "value": "missing selected category",
        "label": "missing selected category",
        "count": 0,
        "selected": True,
        "disabled": True,
        "meta": {},
    }

    control_response = await auth_client.get(
        "/api/v1/controls",
        params={"filters": json.dumps({"search": "no matching Control row"})},
    )
    assert control_response.status_code == 200, control_response.text
    control_facets = control_response.json()["facets"]
    assert next(
        option["count"]
        for option in control_facets["process"]
        if option["value"] == "Shared facet scale process"
    ) == row_count
    assert next(
        option["count"]
        for option in control_facets["category"]
        if option["value"] == "Shared facet scale category"
    ) == row_count


@pytest.mark.asyncio
async def test_risk_lifecycle_and_domain_status_compose_for_list_facets_and_current_export(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
):
    department = Department(name="Lifecycle Risk 81", code="LCR81", is_active=True)
    db_session.add(department)
    await db_session.flush()
    live = Risk(
        risk_id_code="R-SHARED-81-LIFECYCLE-LIVE",
        name="Lifecycle composition Risk live",
        process="Lifecycle composition",
        description="Live emerging Risk",
        department_id=department.id,
        owner_id=test_user.id,
        risk_type="operational",
        category="Lifecycle composition",
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status="emerging",
        is_archived=False,
    )
    archived = Risk(
        risk_id_code="R-SHARED-81-LIFECYCLE-ARCHIVED",
        name="Lifecycle composition Risk archived",
        process="Lifecycle composition",
        description="Archived emerging Risk",
        department_id=department.id,
        owner_id=test_user.id,
        risk_type="operational",
        category="Lifecycle composition",
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status="emerging",
        is_archived=True,
    )
    db_session.add_all([live, archived])
    await db_session.commit()

    async def listed(lifecycle: str | None):
        filters = {"department_id": department.id, "status": "emerging"}
        if lifecycle is not None:
            filters["lifecycle"] = lifecycle
        response = await auth_client.get(
            "/api/v1/risks",
            params={"filters": json.dumps(filters)},
        )
        assert response.status_code == 200, response.text
        return response.json()

    all_rows = await listed("all")
    archived_rows = await listed("archived")
    active_rows = await listed("active")
    default_rows = await listed(None)
    assert {row["risk_id_code"] for row in all_rows["items"]} == {
        live.risk_id_code,
        archived.risk_id_code,
    }
    assert [row["risk_id_code"] for row in archived_rows["items"]] == [archived.risk_id_code]
    assert [row["risk_id_code"] for row in active_rows["items"]] == [live.risk_id_code]
    assert [row["risk_id_code"] for row in default_rows["items"]] == [live.risk_id_code]
    assert next(row["count"] for row in all_rows["facets"]["status"] if row["value"] == "emerging") == 2
    assert next(
        row["count"] for row in archived_rows["facets"]["status"] if row["value"] == "emerging"
    ) == 1

    for lifecycle, expected in (
        ("all", {live.risk_id_code, archived.risk_id_code}),
        ("archived", {archived.risk_id_code}),
    ):
        exported = await auth_client.get(
            "/api/v1/risks/export",
            params={
                "filters": json.dumps(
                    {
                        "department_id": department.id,
                        "lifecycle": lifecycle,
                        "status": "emerging",
                    }
                )
            },
        )
        assert exported.status_code == 200, exported.text
        assert {row["risk_id"] for row in csv.DictReader(io.StringIO(exported.text))} == expected


@pytest.mark.asyncio
async def test_control_lifecycle_domain_and_monitoring_status_compose_for_list_and_current_export(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
):
    department = Department(name="Lifecycle Control 81", code="LCC81", is_active=True)
    db_session.add(department)
    await db_session.flush()
    live = Control(
        name="Lifecycle composition Control live",
        description="Live inactive new Control",
        department_id=department.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status="inactive",
        is_archived=False,
    )
    archived = Control(
        name="Lifecycle composition Control archived",
        description="Archived inactive new Control",
        department_id=department.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status="inactive",
        is_archived=True,
    )
    db_session.add_all([live, archived])
    await db_session.commit()

    async def listed(lifecycle: str | None):
        filters = {
            "department_id": department.id,
            "status": "inactive",
            "monitoring_status": "new",
        }
        if lifecycle is not None:
            filters["lifecycle"] = lifecycle
        response = await auth_client.get(
            "/api/v1/controls",
            params={"filters": json.dumps(filters)},
        )
        assert response.status_code == 200, response.text
        return response.json()

    all_rows = await listed("all")
    archived_rows = await listed("archived")
    active_rows = await listed("active")
    default_rows = await listed(None)
    assert {row["name"] for row in all_rows["items"]} == {live.name, archived.name}
    assert [row["name"] for row in archived_rows["items"]] == [archived.name]
    assert [row["name"] for row in active_rows["items"]] == [live.name]
    assert [row["name"] for row in default_rows["items"]] == [live.name]
    assert next(row["count"] for row in all_rows["facets"]["status"] if row["value"] == "inactive") == 2
    assert next(
        row["count"] for row in archived_rows["facets"]["status"] if row["value"] == "inactive"
    ) == 1

    for lifecycle, expected in (("all", {live.name, archived.name}), ("archived", {archived.name})):
        exported = await auth_client.get(
            "/api/v1/controls/export",
            params={
                "filters": json.dumps(
                    {
                        "department_id": department.id,
                        "lifecycle": lifecycle,
                        "status": "inactive",
                        "monitoring_status": "new",
                    }
                )
            },
        )
        assert exported.status_code == 200, exported.text
        assert {row["name"] for row in csv.DictReader(io.StringIO(exported.text))} == expected
