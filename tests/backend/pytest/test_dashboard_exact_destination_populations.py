"""Existing read-model and distinct-parent destination contracts for #249."""

import csv
import io
import json

import pytest

from app.models import Department
from tests.backend.pytest.factories import create_test_control, create_test_kri, create_test_risk


@pytest.mark.asyncio
@pytest.mark.parametrize("selected", [False, True])
async def test_breached_kri_parents_match_all_live_risks_and_csv(
    db_session, client_factory, test_department, test_user_cro, selected
):
    other = Department(name="Breach other", code="D249-BREACH")
    db_session.add(other)
    await db_session.commit()
    for department in [test_department.id, other.id]:
        for status, archived in [("active", False), ("emerging", False), ("active", True), ("archived", False)]:
            risk = await create_test_risk(
                db_session,
                department_id=department,
                owner_id=test_user_cro.id,
                risk_id_code=f"G249-{department}-{status}-{archived}",
                overrides={"status": status, "is_archived": archived},
            )
            for value, kri_archived in [(120, False), (-20, False), (50, False), (120, True)]:
                await create_test_kri(
                    db_session,
                    risk_id=risk.id,
                    metric_name=f"G249-{risk.id}-{value}-{kri_archived}",
                    overrides={
                        "current_value": value,
                        "lower_limit": 0,
                        "upper_limit": 100,
                        "is_archived": kri_archived,
                    },
                )
    async with client_factory(current_user=test_user_cro) as client:
        scope = {"department_id": test_department.id} if selected else {}
        widget = await client.get("/api/v1/kris/breaches", params=scope)
        assert widget.status_code == 200, widget.text
        expected = {row["risk_id"] for row in widget.json()}
        assert len(widget.json()) == 2 * len(expected) > 0
        filters = {"has_breach": True, "lifecycle": "active", **scope}
        listed = await client.get("/api/v1/risks", params={"filters": json.dumps(filters)})
        assert listed.status_code == 200, listed.text
        assert {row["id"] for row in listed.json()["items"]} == expected
        assert listed.json()["total"] == len(expected)
        exported = await client.get("/api/v1/risks/export", params={"filters": json.dumps(filters)})
        assert exported.status_code == 200, exported.text
        assert {row[0] for row in list(csv.reader(io.StringIO(exported.text.lstrip("\ufeff"))))[1:]} == {
            row["risk_id_code"] for row in listed.json()["items"]
        }
        old = await client.get("/api/v1/risks", params={"has_breach": True, "status": "active"})
        assert old.status_code == 200
        assert {row["id"] for row in old.json()["items"]} != expected


@pytest.mark.asyncio
async def test_scoped_selected_owner_corner_requires_unavailable_destination(
    db_session, client_factory, test_user_employee
):
    other = Department(name="Owned outside scope", code="D249-OWNED")
    db_session.add(other)
    await db_session.commit()
    risk = await create_test_risk(
        db_session, department_id=other.id, owner_id=test_user_employee.id, risk_id_code="G249-OWNED"
    )
    await create_test_kri(db_session, risk_id=risk.id, overrides={"current_value": 120})
    async with client_factory(current_user=test_user_employee) as client:
        for selected in [False, True]:
            scope = {"department_id": other.id} if selected else {}
            widget = await client.get("/api/v1/kris/breaches", params=scope)
            listed = await client.get("/api/v1/risks", params={"has_breach": True, **scope})
            assert widget.status_code == listed.status_code == 200
            assert {row["risk_id"] for row in widget.json()} == {risk.id}
            assert {row["id"] for row in listed.json()["items"]} == (set() if selected else {risk.id})


@pytest.mark.asyncio
async def test_exact_overview_department_list_is_not_department_register(
    db_session, client_factory, test_department, test_user_cro, monkeypatch
):
    from app.api.v1.endpoints.dashboard import overview
    from app.core.ttl_cache import TTLCache

    monkeypatch.setattr(overview, "DASHBOARD_OVERVIEW_CACHE", TTLCache(ttl_seconds=15, max_entries=500))
    inactive = Department(name="Inactive with metrics", code="D249-INACTIVE", is_active=False, is_system=True)
    empty = Department(name="Empty system", code="D249-EMPTY", is_system=True)
    excluded = Department(name="No active users", code="D249-NOUSERS")
    db_session.add_all([inactive, empty, excluded])
    await db_session.commit()
    for department in [test_department.id, inactive.id, excluded.id]:
        await create_test_risk(
            db_session,
            department_id=department,
            owner_id=test_user_cro.id,
            risk_id_code=f"D249D-{department}",
            overrides={"net_score": 20},
        )
    await create_test_control(
        db_session, department_id=empty.id, owner_id=test_user_cro.id, overrides={"control_form": "automatic"}
    )
    async with client_factory(current_user=test_user_cro) as client:
        overview = await client.get(
            "/api/v1/dashboard/overview", params={"risk_level": "critical", "control_form": "manual"}
        )
        assert overview.status_code == 200, overview.text
        counted = {
            row["department_id"]
            for row in overview.json()["department_metrics"]
            if row["risk_count"] > 0 or row["control_count"] > 0
        }
        assert counted == {test_department.id, inactive.id}
        departments = await client.get("/api/v1/departments")
        assert departments.status_code == 200, departments.text
        registered = {row["id"] for row in departments.json()}
        assert inactive.id not in registered and empty.id in registered
        assert registered != counted


@pytest.mark.asyncio
async def test_global_domain_reader_without_department_read_cannot_open_destination_shell(
    client_factory, test_user_employee, test_department, monkeypatch
):
    from app.api.v1.endpoints.dashboard import overview
    from app.core.ttl_cache import TTLCache
    from app.models.user import AccessScope

    monkeypatch.setattr(overview, "DASHBOARD_OVERVIEW_CACHE", TTLCache(ttl_seconds=15, max_entries=500))
    test_user_employee.access_scope = AccessScope.GLOBAL
    test_user_employee.role.permissions = [
        grant for grant in test_user_employee.role.permissions if grant.permission.resource != "departments"
    ]
    async with client_factory(current_user=test_user_employee) as client:
        overview_response = await client.get("/api/v1/dashboard/overview", params={"department_id": test_department.id})
        assert overview_response.status_code == 200, overview_response.text
        assert overview_response.json()["capabilities"]["can_use_department_filter"] is True
        for resource in ["risks", "controls"]:
            listed = await client.get(f"/api/v1/{resource}", params={"department_id": test_department.id})
            assert listed.status_code == 200, listed.text
        shell = await client.get(f"/api/v1/departments/{test_department.id}")
        assert shell.status_code == 403, shell.text
