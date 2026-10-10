"""ARCH-12 #244: seeded public-surface parity, including archived decoys."""

from datetime import date

import pytest
from sqlalchemy import update

from app.models import KeyRiskIndicator
from tests.backend.pytest.test_char_kri_breach import _seed_single_breach
from tests.backend.pytest.test_kri_due_population_http import freeze


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "today,last",
    [
        (date(2026, 10, 15), None),
        (date(2026, 10, 16), None),
        (date(2026, 10, 16), date(2026, 7, 31)),
        (date(2026, 10, 16), date(2026, 9, 30)),
    ],
)
async def test_live_and_breaching_kri_population_agrees_across_http_surfaces(
    db_session, client_factory, test_department, test_user_cro, monkeypatch, today, last
):
    await _seed_single_breach(db_session, department_id=test_department.id, owner_id=test_user_cro.id)
    freeze(monkeypatch, today)
    await db_session.execute(update(KeyRiskIndicator).values(frequency="monthly", last_period_end=last))
    async with client_factory(current_user=test_user_cro) as client:
        responses = {}
        for name, url in {
            "departments": "/api/v1/departments",
            "dashboard": "/api/v1/dashboard/departments",
            "detail": f"/api/v1/departments/{test_department.id}",
            "department_kris": f"/api/v1/departments/{test_department.id}/kris",
            "register": "/api/v1/kris?breach_only=true",
            "widget": "/api/v1/kris/breaches",
        }.items():
            response = await client.get(url)
            assert response.status_code == 200, (name, response.text)
            responses[name] = response.json()

    departments = responses["departments"]
    if isinstance(departments, dict):
        departments = departments["items"]
    department = next(row for row in departments if row["id"] == test_department.id)
    dashboard = next(row for row in responses["dashboard"] if row["department_id"] == test_department.id)
    assert department["kri_count"] == dashboard["total_kri_count"] == responses["detail"]["kri_count"] == 2
    assert responses["department_kris"]["total"] == 2
    assert department["breaching_kri_count"] == dashboard["breaching_kri_count"] == 1
    assert responses["register"]["total"] == 1
    assert {row["id"] for row in responses["widget"]} == {row["id"] for row in responses["register"]["items"]}


@pytest.mark.asyncio
async def test_breach_archive_opt_in_preserves_inspection_without_changing_live_register(
    db_session, client_factory, test_department, test_user_cro
):
    await _seed_single_breach(db_session, department_id=test_department.id, owner_id=test_user_cro.id)
    async with client_factory(current_user=test_user_cro) as client:
        live = await client.get("/api/v1/kris/breaches")
        inspection = await client.get("/api/v1/kris/breaches", params={"include_archived": True})
        register = await client.get("/api/v1/kris", params={"lifecycle": "all", "breach_only": True})
    assert live.status_code == inspection.status_code == register.status_code == 200
    assert {row["metric_name"] for row in live.json()} == {"Breaching live"}
    assert {row["metric_name"] for row in inspection.json()} == {
        "Breaching live",
        "Breaching archived",
        "Breaching under archived risk",
    }
    assert register.json()["total"] == 1
    assert {row["id"] for row in live.json()} == {row["id"] for row in register.json()["items"]}
