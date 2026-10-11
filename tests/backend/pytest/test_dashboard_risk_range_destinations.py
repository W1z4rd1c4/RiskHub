"""Configured Risk destinations share their exact current-view population."""

import csv
import io
import json

import pytest
from sqlalchemy import select

from app.core.datetime_utils import utc_now
from app.models.global_config import GlobalConfig, clear_config_cache
from tests.backend.pytest.factories import create_test_risk


async def seed_ranges(db):
    for key, value in [
        ("medium_risk_min_net_score", 6),
        ("high_risk_min_net_score", 12),
        ("critical_risk_min_net_score", 20),
    ]:
        row = (await db.execute(select(GlobalConfig).where(GlobalConfig.key == key))).scalar_one_or_none()
        if row is None:
            row = GlobalConfig(
                key=key, value=str(value), value_type="int", category="risk_thresholds", display_name=key
            )
            db.add(row)
        else:
            row.value = str(value)
    await db.commit()
    clear_config_cache()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "level,expected_scores", [("low", [1, 5]), ("medium", [6, 11]), ("high", [12, 19]), ("critical", [20, 25])]
)
async def test_configured_range_list_and_csv_match_overview(
    db_session, client_factory, test_department, test_user_cro, level, expected_scores
):
    await seed_ranges(db_session)
    expected = set()
    for score in [1, 5, 6, 11, 12, 19, 20, 25]:
        for status, archived in [("active", False), ("emerging", False), ("active", True)]:
            row = await create_test_risk(
                db_session,
                department_id=test_department.id,
                owner_id=test_user_cro.id,
                risk_id_code=f"R249B-{score}-{status}-{archived}",
                overrides={"net_score": score, "status": status, "is_archived": archived},
            )
            if score in expected_scores and not archived:
                expected.add(row.risk_id_code)
    await db_session.commit()
    try:
        async with client_factory(current_user=test_user_cro) as client:
            criteria = {"risk_level": level, "lifecycle": "active"}
            response = await client.get("/api/v1/risks", params={"filters": json.dumps(criteria)})
            assert response.status_code == 200, response.text
            assert {r["risk_id_code"] for r in response.json()["items"]} == expected
            summary = await client.get("/api/v1/dashboard/summary", params={"risk_level": level})
            assert summary.status_code == 200, summary.text
            assert summary.json()["total_risks"] == response.json()["total"] == len(expected)
            assert summary.json()["average_net_risk_score"] == round(sum(expected_scores) / len(expected_scores), 2)
            export = await client.get("/api/v1/risks/export", params={"filters": json.dumps(criteria), "locale": "en"})
            assert export.status_code == 200, export.text
            rows = list(csv.reader(io.StringIO(export.text.lstrip("\ufeff"))))
            assert {r[0] for r in rows[1:]} == expected
            intersection = await client.get(
                "/api/v1/risks", params={"filters": json.dumps({**criteria, "critical": True})}
            )
            assert intersection.status_code == 200
            assert intersection.json()["total"] == (len(expected) if level == "critical" else 0)
            legacy = await client.get(
                "/api/v1/risks",
                params={"filters": json.dumps({**criteria, "critical": True, "min_net_score": 25})},
            )
            assert legacy.status_code == 200, legacy.text
            assert {row["net_score"] for row in legacy.json()["items"]} == ({25} if level == "critical" else set())
            assert legacy.json()["total"] == (2 if level == "critical" else 0)

    finally:
        clear_config_cache()


@pytest.mark.asyncio
@pytest.mark.parametrize("value", ["unknown", ["high"], True, {"level": "high"}, 12])
async def test_invalid_configured_risk_level_is_not_unfiltered(client_factory, test_user_cro, value):
    async with client_factory(current_user=test_user_cro) as client:
        response = await client.get("/api/v1/risks", params={"filters": json.dumps({"risk_level": value})})
        assert response.status_code in {400, 422}, response.text


@pytest.mark.asyncio
async def test_warm_overview_uses_updated_configured_range(
    db_session, client_factory, test_department, test_user_cro, monkeypatch
):
    from app.api.v1.endpoints.dashboard import overview
    from app.core.ttl_cache import TTLCache

    monkeypatch.setattr(overview, "DASHBOARD_OVERVIEW_CACHE", TTLCache(ttl_seconds=15, max_entries=500))
    await seed_ranges(db_session)
    await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="R249B-WARM",
        overrides={"net_score": 19},
    )
    await db_session.commit()
    try:
        async with client_factory(current_user=test_user_cro) as client:
            before = await client.get("/api/v1/dashboard/overview", params={"risk_level": "high"})
            assert before.status_code == 200, before.text
            assert before.json()["summary"]["total_risks"] == 1
            updated = await client.patch("/api/v1/riskhub/config/critical_risk_min_net_score", json={"value": "18"})
            assert updated.status_code == 200, updated.text
            after = await client.get("/api/v1/dashboard/overview", params={"risk_level": "high"})
            assert after.status_code == 200, after.text
            assert after.json()["summary"]["total_risks"] == 0
            listed = await client.get("/api/v1/risks", params={"critical": True})
            assert listed.status_code == 200
            assert listed.json()["total"] == 1
    finally:
        clear_config_cache()


@pytest.mark.asyncio
@pytest.mark.parametrize("selected_department", [False, True])
async def test_range_scope_owner_exception_groups_pagination_and_csv(
    db_session, client_factory, test_department, test_user_employee, selected_department
):
    from app.models import Department

    await seed_ranges(db_session)
    other = Department(name="Hidden range department", code="R249B-HIDDEN")
    db_session.add(other)
    await db_session.commit()
    expected = set()
    for label, department, owner, score in [
        ("local", test_department.id, None, 20),
        ("owned", other.id, test_user_employee.id, 25),
        ("hidden", other.id, None, 22),
        ("below", test_department.id, None, 19),
    ]:
        row = await create_test_risk(
            db_session,
            department_id=department,
            owner_id=owner,
            risk_id_code="R249B-" + label,
            overrides={"net_score": score, "category": label},
        )
        if label == "local" or (label == "owned" and not selected_department):
            expected.add(row.risk_id_code)
    try:
        async with client_factory(current_user=test_user_employee) as client:
            filters = {"risk_level": "critical", "lifecycle": "active"}
            if selected_department:
                filters["department_id"] = test_department.id
            query = {"filters": json.dumps(filters), "limit": 1, "group_by": "category"}
            listed = await client.get("/api/v1/risks", params=query)
            assert listed.status_code == 200, listed.text
            payload = listed.json()
            assert payload["total"] == len(expected)
            page = await client.get("/api/v1/risks", params={"filters": json.dumps(filters), "limit": 1})
            assert page.status_code == 200
            assert len(page.json()["items"]) == 1
            assert sum(g["count"] for g in payload["groups"]) == len(expected)
            assert all(g["value"] not in {"hidden", "below"} for g in payload["groups"])
            assert all(f["value"] != "hidden" for f in payload["facets"]["category"])
            exported = await client.get("/api/v1/risks/export", params=query)
            assert exported.status_code == 200, exported.text
            assert {r[0] for r in list(csv.reader(io.StringIO(exported.text.lstrip("\ufeff"))))[1:]} == expected
    finally:
        clear_config_cache()


@pytest.mark.asyncio
async def test_range_does_not_grant_report_or_risk_permission(
    client_factory, test_user_department_head, test_user_directory_reader
):
    async with client_factory(current_user=test_user_department_head) as client:
        listed = await client.get("/api/v1/risks", params={"risk_level": "critical"})
        assert listed.status_code == 200
        exported = await client.get("/api/v1/risks/export", params={"risk_level": "critical"})
        assert exported.status_code == 403
    async with client_factory(current_user=test_user_directory_reader) as client:
        for path in ["/api/v1/risks", "/api/v1/risks/export"]:
            response = await client.get(path, params={"risk_level": "critical"})
            assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("dated", [False, True])
async def test_all_live_status_snapshot_control(db_session, client_factory, test_department, test_user_cro, dated):
    for status, archived in [("active", False), ("emerging", False), ("active", True)]:
        await create_test_risk(
            db_session,
            department_id=test_department.id,
            owner_id=test_user_cro.id,
            risk_id_code=f"R249B-SNAPSHOT-{status}-{archived}",
            overrides={"status": status, "is_archived": archived},
        )
    async with client_factory(current_user=test_user_cro) as client:
        response = await client.get(
            "/api/v1/reports/risks/export",
            params={"format": "csv", **({"as_of_date": utc_now().date().isoformat()} if dated else {})},
        )
        assert response.status_code == 200, response.text
        assert "R249B-SNAPSHOT-active-False" in response.text
        assert "R249B-SNAPSHOT-emerging-False" in response.text
        assert "R249B-SNAPSHOT-active-True" not in response.text
