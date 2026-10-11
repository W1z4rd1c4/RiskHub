"""Public panel adapters preserve the Overview loader contract."""

from datetime import UTC, date, datetime, timedelta

import pytest
import pytest_asyncio

from app.api.v1.endpoints.dashboard import overview
from app.core.ttl_cache import TTLCache
from app.models import ControlExecution, Department
from app.models.issue import Issue
from app.models.kri_history import KRIValueHistory
from tests.backend.pytest.factories import create_test_control, create_test_kri, create_test_risk
from tests.backend.pytest.test_dashboard_risk_range_destinations import seed_ranges

PANELS = [
    ("summary", "summary", {}),
    ("departments", "department_metrics", {}),
    ("risk-distribution", "gross_distribution", {"risk_type": "gross"}),
    ("risk-distribution", "net_distribution", {"risk_type": "net"}),
    ("control-trends", "control_trends", {}),
    ("risk-trends", "risk_trends", {}),
    ("kri-breach-trends", "kri_breach_trends", {}),
    ("issues-summary", "issue_summary", {}),
    ("issues-aging", "issue_aging", {}),
    ("issues-by-severity", "issue_severity", {}),
]


@pytest_asyncio.fixture
async def population(db_session, test_department, test_user_cro, monkeypatch):
    monkeypatch.setattr(overview, "DASHBOARD_OVERVIEW_CACHE", TTLCache(ttl_seconds=15, max_entries=500))
    await seed_ranges(db_session)
    other = Department(name="Panel other", code="P250", is_system=True)
    db_session.add(other)
    await db_session.commit()
    instant = datetime(2026, 8, 20, 12, tzinfo=UTC)
    for department in [test_department.id, other.id]:
        for index, (score, status, archived) in enumerate(
            [
                (1, "active", False),
                (13, "emerging", False),
                (18, "active", False),
                (25, "active", False),
                (25, "active", True),
            ]
        ):
            risk = await create_test_risk(
                db_session,
                department_id=department,
                owner_id=test_user_cro.id,
                risk_id_code=f"P250-{department}-{index}",
                overrides={
                    "net_score": score,
                    "gross_score": 25,
                    "status": status,
                    "is_archived": archived,
                    "created_at": instant,
                },
            )
            kri = await create_test_kri(db_session, risk_id=risk.id, overrides={"current_value": 150})
            db_session.add(
                KRIValueHistory(
                    kri_id=kri.id,
                    period_start=date(2026, 8, 1),
                    period_end=date(2026, 8, 31),
                    recorded_at=instant,
                    recorded_by_id=test_user_cro.id,
                    value=150,
                    lower_limit=0,
                    upper_limit=100,
                    breach_status="above",
                )
            )
        for index, (form, status, archived) in enumerate(
            [
                ("manual", "active", False),
                ("automatic", "active", False),
                ("manual", "draft", False),
                ("manual", "inactive", False),
                ("manual", "active", True),
            ]
        ):
            control = await create_test_control(
                db_session,
                department_id=department,
                owner_id=test_user_cro.id,
                name=f"P250-{department}-{index}",
                overrides={"control_form": form, "status": status, "is_archived": archived},
            )
            db_session.add(
                ControlExecution(
                    control_id=control.id, executed_by_id=test_user_cro.id, result="passed", executed_at=instant
                )
            )
        db_session.add(
            Issue(
                title=f"Panel issue{department}",
                severity="high",
                status="open",
                source_type="manual",
                department_id=department,
                owner_user_id=test_user_cro.id,
                created_by_id=test_user_cro.id,
                opened_at=instant,
                due_at=instant + timedelta(days=5),
            )
        )
    await db_session.commit()
    return test_department.id, other.id


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "route,field,criteria",
    [
        ("departments", "department_metrics", {"control_form": "manual"}),
        ("departments", "department_metrics", {"control_status": "active"}),
        ("departments", "department_metrics", {"risk_level": "critical"}),
        ("control-trends", "control_trends", {"control_form": "manual"}),
        ("risk-trends", "risk_trends", {"risk_level": "critical"}),
    ],
)
async def test_missing_panel_filter_forwarding(client_factory, test_user_cro, population, route, field, criteria):
    params = {"department_id": population[0], **criteria}
    async with client_factory(current_user=test_user_cro) as client:
        unfiltered = await client.get("/api/v1/dashboard/overview", params={"department_id": population[0]})
        selected = await client.get("/api/v1/dashboard/overview", params=params)
        panel = await client.get(f"/api/v1/dashboard/{route}", params=params)
        assert unfiltered.status_code == selected.status_code == panel.status_code == 200
        assert selected.json()[field] != unfiltered.json()[field], "fixture must distinguish ignored criterion"
        assert panel.json() == selected.json()[field]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "criteria",
    [
        {},
        {"control_status": "draft"},
        {"control_status": "inactive", "control_form": "manual"},
        {"control_status": "active", "control_form": "automatic"},
        {"risk_level": "low"},
        {"risk_level": "medium"},
        {"risk_level": "high"},
        {"risk_level": "critical", "control_form": "manual", "control_status": "active"},
        {"include_archived": True, "risk_level": "critical", "control_form": "manual"},
    ],
)
@pytest.mark.parametrize("selected", [False, True])
async def test_all_public_panels_equal_overview(client_factory, test_user_cro, population, criteria, selected):
    params = {**criteria, **({"department_id": population[0]} if selected else {})}
    async with client_factory(current_user=test_user_cro) as client:
        # Warm a different key first; no cache reset between the compared requests.
        baseline = await client.get("/api/v1/dashboard/overview")
        response = await client.get("/api/v1/dashboard/overview", params=params)
        assert baseline.status_code == response.status_code == 200
        expected = response.json()
        for route, field, extra in PANELS:
            panel = await client.get(f"/api/v1/dashboard/{route}", params={**params, **extra})
            assert panel.status_code == 200, panel.text
            assert panel.json() == expected[field], (route, params)
        # These loaders intentionally ignore risk/control/archive filters.
        unaffected = await client.get(
            "/api/v1/dashboard/overview", params={"department_id": population[0]} if selected else {}
        )
        for field in ["kri_breach_trends", "issue_summary", "issue_aging", "issue_severity"]:
            assert expected[field] == unaffected.json()[field]


@pytest.mark.asyncio
@pytest.mark.parametrize("selection", ["none", "allowed", "forbidden"])
@pytest.mark.parametrize("controls_read", [True, False])
async def test_scoped_panels_preserve_permissions_and_owned_outside_scope(
    db_session, client_factory, test_user_employee, population, selection, controls_read
):
    if not controls_read:
        test_user_employee.role.permissions = [
            grant for grant in test_user_employee.role.permissions if grant.permission.resource != "controls"
        ]
    await create_test_risk(
        db_session,
        department_id=population[1],
        owner_id=test_user_employee.id,
        risk_id_code="P250-OWNED",
        overrides={"net_score": 25},
    )
    params = {"risk_level": "critical", "control_form": "manual", "control_status": "active"}
    if selection != "none":
        params["department_id"] = population[0 if selection == "allowed" else 1]
    async with client_factory(current_user=test_user_employee) as client:
        response = await client.get("/api/v1/dashboard/overview", params=params)
        assert response.status_code == 200, response.text
        payload = response.json()
        for route, field, extra in PANELS:
            panel = await client.get(f"/api/v1/dashboard/{route}", params={**params, **extra})
            if route.startswith("issues-"):
                assert panel.status_code == 403
                assert payload[field] is None
            else:
                assert panel.status_code == 200, panel.text
                assert panel.json() == payload[field], route
        if not controls_read:
            assert payload["control_trends"] == []
            assert all(row["control_count"] == 0 for row in payload["department_metrics"])


@pytest.mark.asyncio
async def test_issue_only_reader_keeps_panel_access_without_overview_access(
    db_session, client_factory, test_user_employee, population
):
    from app.models import Permission, RolePermission

    permission = Permission(resource="issues", action="read", description="Panel-only reader")
    db_session.add(permission)
    await db_session.flush()
    test_user_employee.role.permissions = [
        grant for grant in test_user_employee.role.permissions if grant.permission.resource != "risks"
    ]
    test_user_employee.role.permissions.append(
        RolePermission(role_id=test_user_employee.role_id, permission=permission)
    )
    await db_session.commit()
    async with client_factory(current_user=test_user_employee) as client:
        response = await client.get("/api/v1/dashboard/overview")
        assert response.status_code == 403
        for route, _, extra in PANELS:
            panel = await client.get(f"/api/v1/dashboard/{route}", params=extra)
            assert panel.status_code == (200 if route.startswith("issues-") else 403), (route, panel.text)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "route,key,value",
    [
        ("departments", "control_status", "pending"),
        ("departments", "control_form", "preventive"),
        ("departments", "risk_level", "extreme"),
        ("control-trends", "control_form", "preventive"),
        ("risk-trends", "risk_level", "extreme"),
    ],
)
async def test_new_panel_filters_reject_invalid_values_like_overview(client_factory, test_user_cro, route, key, value):
    async with client_factory(current_user=test_user_cro) as client:
        for target in [route, "overview"]:
            response = await client.get(f"/api/v1/dashboard/{target}", params={key: value})
            assert response.status_code == 422, response.text
            assert any(error["loc"] == ["query", key] for error in response.json()["detail"])
