from __future__ import annotations

import json

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ControlRiskLink, Department, IssueLink, Risk, User


def _group_by_value(groups: list[dict], value: str) -> dict | None:
    return next((group for group in groups if group["value"] == value), None)


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
    db_session.add(ControlRiskLink(control_id=control_id, risk_id=risk.id))
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
        params={"offset": 0, "limit": 10, "group_by": "flag"},
    )
    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert summary["items"] == []
    dora_group = _group_by_value(summary["groups"], "__dora_relevant__")
    core_group = _group_by_value(summary["groups"], "__supports_core_function__")
    assert dora_group is not None
    assert core_group is not None
    assert dora_group["count"] >= 1
    assert core_group["count"] >= 1

    drilldown_response = await auth_client.get(
        "/api/v1/vendors",
        params={
            "offset": 0,
            "limit": 10,
            "group_by": "flag",
            "group_value": "__dora_relevant__",
        },
    )
    assert drilldown_response.status_code == 200
    drilldown = drilldown_response.json()
    assert any(item["id"] == vendor_id for item in drilldown["items"])
    assert _group_by_value(drilldown["groups"], "__supports_core_function__") is not None
