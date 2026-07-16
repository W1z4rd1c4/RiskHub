from __future__ import annotations

import csv
import json
from datetime import timedelta
from io import StringIO

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.models import (
    Department,
    Issue,
    IssueException,
    IssueRemediationPlan,
    KeyRiskIndicator,
    Permission,
    Risk,
    Role,
    RolePermission,
    User,
)
from app.models.user import AccessScope


async def _grant(db: AsyncSession, role_id: int, resource: str, action: str) -> None:
    permission = (
        await db.execute(
            select(Permission).where(Permission.resource == resource, Permission.action == action)
        )
    ).scalar_one_or_none()
    if permission is None:
        permission = Permission(resource=resource, action=action, description=f"{resource}:{action}")
        db.add(permission)
        await db.flush()
    existing = (
        await db.execute(
            select(RolePermission).where(
                RolePermission.role_id == role_id,
                RolePermission.permission_id == permission.id,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        db.add(RolePermission(role_id=role_id, permission_id=permission.id))
    await db.commit()
    db.expire_all()


def _csv_rows(response) -> list[dict[str, str]]:
    return list(csv.DictReader(StringIO(response.text)))


def _risk(*, code: str, department_id: int, owner_id: int) -> Risk:
    return Risk(
        risk_id_code=code,
        name=f"Risk {code}",
        process="Operations",
        description=f"Risk for {code}",
        department_id=department_id,
        owner_id=owner_id,
        risk_type="operational",
        category="Operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )


def _kri(*, risk_id: int, name: str, archived: bool = False) -> KeyRiskIndicator:
    return KeyRiskIndicator(
        risk_id=risk_id,
        metric_name=name,
        description=f"Description for {name}",
        current_value=120.0 if "Breach" in name else 50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency="monthly",
        is_archived=archived,
    )


@pytest.mark.asyncio
async def test_kri_shared_facets_keep_lifecycle_independent_from_monitoring(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
):
    risk = _risk(code="KRI-FACETS", department_id=test_department.id, owner_id=test_user.id)
    archived_parent = _risk(code="KRI-ARCHIVED-PARENT", department_id=test_department.id, owner_id=test_user.id)
    archived_parent.is_archived = True
    db_session.add_all([risk, archived_parent])
    await db_session.flush()
    db_session.add_all(
        [
            _kri(risk_id=risk.id, name="Framework KRI Breach"),
            _kri(risk_id=risk.id, name="Framework KRI Archived Breach", archived=True),
            _kri(risk_id=archived_parent.id, name="Framework KRI Archived Parent Child Breach"),
        ]
    )
    await db_session.commit()

    response = await auth_client.get(
        "/api/v1/kris",
        params={"lifecycle": "all", "frequency": "monthly", "limit": 20},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    names = {item["metric_name"] for item in payload["items"]}
    assert {
        "Framework KRI Breach",
        "Framework KRI Archived Breach",
        "Framework KRI Archived Parent Child Breach",
    } <= names
    assert {option["value"] for option in payload["facets"]["lifecycle"]} == {
        "active",
        "archived",
        "all",
    }
    assert next(
        option for option in payload["facets"]["frequency"] if option["value"] == "monthly"
    )["selected"] is True
    assert {option["value"] for option in payload["facets"]["monitoring_status"]} == {
        "new",
        "not_submitted",
        "breach",
        "warning",
        "optimal",
    }
    breach_facets = {option["value"]: option for option in payload["facets"]["breach"]}
    assert breach_facets["yes"]["count"] == 1
    assert breach_facets["no"]["count"] == 2

    archived = await auth_client.get("/api/v1/kris", params={"lifecycle": "archived"})
    assert archived.status_code == 200, archived.text
    assert {
        "Framework KRI Archived Breach",
        "Framework KRI Archived Parent Child Breach",
    } <= {item["metric_name"] for item in archived.json()["items"]}

    active = await auth_client.get(
        "/api/v1/kris",
        params={"lifecycle": "active", "search": "Framework KRI Archived Parent Child Breach"},
    )
    assert active.status_code == 200, active.text
    assert active.json()["items"] == []

    grouped = await auth_client.get(
        "/api/v1/kris",
        params={"lifecycle": "all", "group_by": "risk", "limit": 20},
    )
    assert grouped.status_code == 200, grouped.text
    parent_group = next(
        group for group in grouped.json()["groups"] if group["value"] == archived_parent.name
    )
    assert parent_group["count"] == 1
    assert parent_group["active_count"] == 0
    assert parent_group["highlighted_count"] == 0
    active_group = next(group for group in grouped.json()["groups"] if group["value"] == risk.name)
    assert active_group["count"] == 2
    assert active_group["active_count"] == 1
    assert active_group["highlighted_count"] == 1

    all_breaches = await auth_client.get(
        "/api/v1/kris",
        params={"lifecycle": "all", "breach_only": True, "search": "Framework KRI"},
    )
    assert all_breaches.status_code == 200, all_breaches.text
    assert {item["metric_name"] for item in all_breaches.json()["items"]} == {
        "Framework KRI Breach"
    }

    archived_breaches = await auth_client.get(
        "/api/v1/kris",
        params={"lifecycle": "archived", "breach_only": True, "search": "Framework KRI"},
    )
    assert archived_breaches.status_code == 200, archived_breaches.text
    assert archived_breaches.json()["items"] == []

    exported = await auth_client.get(
        "/api/v1/kris/export",
        params={"lifecycle": "all", "search": "Framework KRI Archived Parent Child Breach"},
    )
    assert exported.status_code == 200, exported.text
    assert _csv_rows(exported)[0]["lifecycle_code"] == "archived"

    breached_export = await auth_client.get(
        "/api/v1/kris/export",
        params={
            "lifecycle": "all",
            "breach_only": True,
            "search": "Framework KRI",
            "locale": "cs",
        },
    )
    assert breached_export.status_code == 200, breached_export.text
    breached_rows = _csv_rows(breached_export)
    assert [row["metric"] for row in breached_rows] == ["Framework KRI Breach"]
    assert breached_rows[0]["breach_code"] == "above"
    assert breached_rows[0]["breach_label"] == "Nad horním limitem"

    archived_breached_export = await auth_client.get(
        "/api/v1/kris/export",
        params={"lifecycle": "archived", "breach_only": True, "search": "Framework KRI"},
    )
    assert archived_breached_export.status_code == 200, archived_breached_export.text
    assert _csv_rows(archived_breached_export) == []


@pytest.mark.asyncio
async def test_kri_sort_contract_applies_to_list_group_and_current_export(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
):
    alpha_risk = _risk(code="KRI-SORT-A", department_id=test_department.id, owner_id=test_user.id)
    alpha_risk.process = "Alpha process"
    alpha_risk.description = "Alpha risk description"
    zulu_risk = _risk(code="KRI-SORT-Z", department_id=test_department.id, owner_id=test_user.id)
    zulu_risk.process = "Zulu process"
    zulu_risk.description = "Zulu risk description"
    db_session.add_all([alpha_risk, zulu_risk])
    await db_session.flush()

    today = utc_now().date()
    alpha = _kri(risk_id=alpha_risk.id, name="Sort Contract Alpha")
    alpha.current_value = 20.0
    alpha.last_period_end = today
    zulu_breach = _kri(risk_id=zulu_risk.id, name="Sort Contract Zulu Breach")
    zulu_breach.current_value = 130.0
    zulu_breach.last_period_end = today
    zulu_optimal = _kri(risk_id=zulu_risk.id, name="Sort Contract Zulu Optimal")
    zulu_optimal.current_value = 40.0
    zulu_optimal.last_period_end = today
    db_session.add_all([alpha, zulu_breach, zulu_optimal])
    await db_session.commit()

    async def sorted_names(field: str, direction: str = "asc") -> list[str]:
        response = await auth_client.get(
            "/api/v1/kris",
            params={
                "search": "Sort Contract",
                "sort": json.dumps({"field": field, "direction": direction}),
                "limit": 20,
            },
        )
        assert response.status_code == 200, response.text
        return [item["metric_name"] for item in response.json()["items"]]

    assert await sorted_names("metric_name", "desc") == [
        "Sort Contract Zulu Optimal",
        "Sort Contract Zulu Breach",
        "Sort Contract Alpha",
    ]
    assert await sorted_names("current_value") == [
        "Sort Contract Alpha",
        "Sort Contract Zulu Optimal",
        "Sort Contract Zulu Breach",
    ]
    assert await sorted_names("risk_process") == [
        "Sort Contract Alpha",
        "Sort Contract Zulu Breach",
        "Sort Contract Zulu Optimal",
    ]
    assert (await sorted_names("risk_description", "desc"))[:2] == [
        "Sort Contract Zulu Breach",
        "Sort Contract Zulu Optimal",
    ]
    assert await sorted_names("monitoring_status") == [
        "Sort Contract Zulu Breach",
        "Sort Contract Alpha",
        "Sort Contract Zulu Optimal",
    ]

    grouped = await auth_client.get(
        "/api/v1/kris",
        params={
            "search": "Sort Contract",
            "group_by": "process",
            "group_value": "Zulu process",
            "sort": json.dumps({"field": "current_value", "direction": "desc"}),
        },
    )
    assert grouped.status_code == 200, grouped.text
    assert [item["metric_name"] for item in grouped.json()["items"]] == [
        "Sort Contract Zulu Breach",
        "Sort Contract Zulu Optimal",
    ]

    exported = await auth_client.get(
        "/api/v1/kris/export",
        params={
            "search": "Sort Contract",
            "sort": json.dumps({"field": "current_value", "direction": "desc"}),
        },
    )
    assert exported.status_code == 200, exported.text
    assert [row["metric"] for row in _csv_rows(exported)] == [
        "Sort Contract Zulu Breach",
        "Sort Contract Zulu Optimal",
        "Sort Contract Alpha",
    ]

    legacy = await auth_client.get(
        "/api/v1/kris",
        params={"search": "Sort Contract", "sort_by": "current_value", "sort_order": "desc"},
    )
    assert legacy.status_code == 200, legacy.text
    assert [item["metric_name"] for item in legacy.json()["items"]][:2] == [
        "Sort Contract Zulu Breach",
        "Sort Contract Zulu Optimal",
    ]

    invalid = await auth_client.get(
        "/api/v1/kris",
        params={"sort": json.dumps({"field": "not_a_kri_field", "direction": "asc"})},
    )
    assert invalid.status_code == 400
    assert invalid.json()["detail"] == "Invalid sort_by value"


@pytest.mark.asyncio
async def test_issue_facets_and_domain_groups_preserve_closed_and_exception_semantics(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
):
    now = utc_now()
    issue = Issue(
        title="Framework overdue issue",
        description="Issue preserving remediation and exception semantics",
        severity="critical",
        status="in_progress",
        source_type="manual",
        department_id=test_department.id,
        owner_user_id=test_user.id,
        created_by_id=test_user.id,
        opened_at=now - timedelta(days=10),
        due_at=now - timedelta(days=2),
    )
    db_session.add(issue)
    closed_issue = Issue(
        title="Framework closed high issue",
        description="Closed must remain selectable from the default active queue",
        severity="high",
        status="closed",
        source_type="manual",
        department_id=test_department.id,
        owner_user_id=test_user.id,
        created_by_id=test_user.id,
        opened_at=now - timedelta(days=20),
        closed_at=now - timedelta(days=1),
    )
    db_session.add(closed_issue)
    zero_count_department = Department(
        name="Framework zero-count facets",
        code="FZCF",
        description="Exercises valid zero-count status and severity options",
    )
    db_session.add(zero_count_department)
    await db_session.flush()
    db_session.add(
        Issue(
            title="Framework medium-only issue",
            description="Keeps the combined severity facet selected at zero matches",
            severity="medium",
            status="open",
            source_type="manual",
            department_id=zero_count_department.id,
            owner_user_id=test_user.id,
            created_by_id=test_user.id,
            opened_at=now,
        )
    )
    await db_session.flush()
    db_session.add_all(
        [
            IssueRemediationPlan(
                issue_id=issue.id,
                status="active",
                progress_percent=35,
                owner_user_id=test_user.id,
                target_date=now + timedelta(days=7),
            ),
            IssueException(
                issue_id=issue.id,
                status="approved",
                reason="Approved temporary exception",
                requested_by_id=test_user.id,
                approved_by_id=test_user.id,
                requested_at=now - timedelta(days=2),
                approved_at=now - timedelta(days=1),
                expires_at=now + timedelta(days=3),
            ),
        ]
    )
    await db_session.commit()

    response = await auth_client.get(
        "/api/v1/issues",
        params={"group_by": "status", "include_closed": False, "limit": 20},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    group = next(group for group in payload["groups"] if group["value"] == "in_progress")
    assert group["count"] >= 1
    assert next(
        option for option in payload["facets"]["exception"] if option["value"] == "active"
    )["count"] >= 1
    assert next(
        option for option in payload["facets"]["remediation_status"] if option["value"] == "active"
    )["count"] >= 1
    closed_facet = next(option for option in payload["facets"]["status"] if option["value"] == "closed")
    assert closed_facet["count"] >= 1
    assert closed_facet["disabled"] is False
    combined_severity = next(
        option for option in payload["facets"]["severity"] if option["value"] == "high_critical"
    )
    assert combined_severity["count"] >= 1

    high_critical = await auth_client.get(
        "/api/v1/issues",
        params={"severity_group": "high_critical", "include_closed": False, "limit": 20},
    )
    assert high_critical.status_code == 200, high_critical.text
    selected_combined = next(
        option
        for option in high_critical.json()["facets"]["severity"]
        if option["value"] == "high_critical"
    )
    assert selected_combined["selected"] is True
    assert "Framework overdue issue" in {item["title"] for item in high_critical.json()["items"]}

    zero_count = await auth_client.get(
        "/api/v1/issues",
        params={
            "department_id": zero_count_department.id,
            "severity_group": "high_critical",
            "include_closed": False,
            "limit": 20,
        },
    )
    assert zero_count.status_code == 200, zero_count.text
    zero_payload = zero_count.json()
    zero_closed = next(
        option for option in zero_payload["facets"]["status"] if option["value"] == "closed"
    )
    zero_combined = next(
        option
        for option in zero_payload["facets"]["severity"]
        if option["value"] == "high_critical"
    )
    assert (zero_closed["count"], zero_closed["disabled"]) == (0, True)
    assert (zero_combined["count"], zero_combined["selected"], zero_combined["disabled"]) == (
        0,
        True,
        True,
    )

    owner_group = await auth_client.get(
        "/api/v1/issues",
        params={"group_by": "owner", "group_value": test_user.name, "limit": 20},
    )
    assert owner_group.status_code == 200, owner_group.text
    assert "Framework overdue issue" in {item["title"] for item in owner_group.json()["items"]}


@pytest.mark.asyncio
async def test_current_view_exports_match_filters_and_preserve_mature_issue_fields(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
):
    now = utc_now()
    risk = _risk(code="CURRENT-EXPORT", department_id=test_department.id, owner_id=test_user.id)
    db_session.add(risk)
    await db_session.flush()
    db_session.add(_kri(risk_id=risk.id, name="Current Export KRI Breach"))
    issue = Issue(
        title="Current Export Issue",
        description="Current-view export contract",
        severity="high",
        status="in_progress",
        source_type="manual",
        department_id=test_department.id,
        owner_user_id=test_user.id,
        created_by_id=test_user.id,
        opened_at=now - timedelta(days=4),
        due_at=now + timedelta(days=4),
    )
    db_session.add(issue)
    await db_session.flush()
    db_session.add(
        IssueRemediationPlan(
            issue_id=issue.id,
            status="active",
            progress_percent=65,
            owner_user_id=test_user.id,
            target_date=now + timedelta(days=4),
        )
    )
    await db_session.commit()

    kri_export = await auth_client.get(
        "/api/v1/kris/export",
        params={"search": "Current Export KRI", "breach_only": True, "locale": "cs"},
    )
    assert kri_export.status_code == 200, kri_export.text
    kri_row = next(row for row in _csv_rows(kri_export) if row["metric"] == "Current Export KRI Breach")
    assert kri_row["risk_id"] == "CURRENT-EXPORT"
    assert kri_row["breach_code"] == "above"
    assert kri_row["monitoring_status_code"]

    issue_export = await auth_client.get(
        "/api/v1/issues/export",
        params={"search": "Current Export Issue", "status": "in_progress", "locale": "en"},
    )
    assert issue_export.status_code == 200, issue_export.text
    issue_row = next(row for row in _csv_rows(issue_export) if row["title"] == "Current Export Issue")
    assert issue_row["status_code"] == "in_progress"
    assert issue_row["remediation_status_code"] == "active"
    assert issue_row["remediation_status_label"] == "Active"
    assert issue_row["remediation_progress"] == "65"
    assert issue_row["remediation_owner"] == test_user.name

    as_of = utc_now().date().isoformat()
    rejected_kri = await auth_client.get("/api/v1/kris/export", params={"as_of_date": as_of})
    rejected_issue = await auth_client.get("/api/v1/issues/export", params={"as_of_date": as_of})
    assert rejected_kri.status_code == 400
    assert rejected_issue.status_code == 400
    assert rejected_kri.json()["detail"]["code"] == "point_in_time_export_requires_report"
    assert rejected_issue.json()["detail"]["code"] == "point_in_time_export_requires_report"

    invalid_group = await auth_client.get(
        "/api/v1/issues/export",
        params={"group_by": "not_supported", "group_value": "not-a-group"},
    )
    assert invalid_group.status_code == 400, invalid_group.text
    assert invalid_group.json()["detail"] == "Invalid Issue group_by value"

    missing_group = await auth_client.get(
        "/api/v1/issues",
        params={"group_value": "not-a-group"},
    )
    assert missing_group.status_code == 400, missing_group.text
    assert missing_group.json()["detail"] == "Issue group_value requires group_by"


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_kri_facets_scale_beyond_sqlite_compound_select_limit(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
):
    risk = _risk(code="KRI-SCALE", department_id=test_department.id, owner_id=test_user.id)
    db_session.add(risk)
    await db_session.flush()
    db_session.add_all(
        [_kri(risk_id=risk.id, name=f"Scale KRI {index:03d}") for index in range(505)]
    )
    await db_session.commit()

    response = await auth_client.get(
        "/api/v1/kris",
        params={"lifecycle": "active", "frequency": "monthly", "limit": 1},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["total"] >= 505
    monthly = next(
        option for option in payload["facets"]["frequency"] if option["value"] == "monthly"
    )
    assert monthly["count"] >= 505


@pytest.mark.asyncio
async def test_issue_facets_do_not_leak_out_of_scope_departments(
    client_employee: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_role_employee: Role,
    test_user_employee: User,
):
    department_id = test_department.id
    role_id = test_role_employee.id
    employee_id = test_user_employee.id
    await _grant(db_session, role_id, "issues", "read")
    other_department = Department(
        name="Facet Secret Department",
        code="FSD",
        description="Must not leak into scoped facet counts",
    )
    db_session.add(other_department)
    await db_session.flush()
    db_session.add_all(
        [
            Issue(
                title="Visible facet issue",
                severity="medium",
                status="open",
                source_type="manual",
                department_id=department_id,
                owner_user_id=employee_id,
                created_by_id=employee_id,
            ),
            Issue(
                title="Secret facet issue",
                severity="critical",
                status="open",
                source_type="manual",
                department_id=other_department.id,
                created_by_id=employee_id,
            ),
        ]
    )
    await db_session.commit()

    response = await client_employee.get("/api/v1/issues", params={"limit": 20})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "Visible facet issue" in {item["title"] for item in payload["items"]}
    assert "Secret facet issue" not in {item["title"] for item in payload["items"]}
    assert "Facet Secret Department" not in {
        option["label"] for option in payload["facets"]["department"]
    }


@pytest.mark.asyncio
async def test_current_view_exports_require_reports_read(
    client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
):
    department_id = test_department.id
    role = Role(
        name="register_reader_without_reports",
        display_name="Register reader without reports",
        description="Can read registers but cannot export",
    )
    db_session.add(role)
    await db_session.flush()
    role_id = role.id
    await _grant(db_session, role_id, "risks", "read")
    await _grant(db_session, role_id, "issues", "read")
    user = User(
        name="Register Reader",
        email="register.reader.no.reports@test.com",
        department_id=department_id,
        role_id=role_id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    headers = {"X-Mock-User-Id": str(user.id)}
    kri_export = await client.get("/api/v1/kris/export", headers=headers)
    issue_export = await client.get("/api/v1/issues/export", headers=headers)
    assert kri_export.status_code == 403
    assert issue_export.status_code == 403
