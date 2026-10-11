"""#249-A HTTP parity; dashboardStats.test.ts round-trips the matching URLs."""

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models import Department, Issue, IssueException
from app.models.global_config import GlobalConfig, clear_config_cache
from tests.backend.pytest.factories import create_test_kri, create_test_risk, create_test_vendor
from tests.backend.pytest.test_kri_due_population_http import freeze


@pytest.mark.asyncio
@pytest.mark.parametrize("selected_department", [False, True])
async def test_existing_dashboard_destinations_match_their_counted_populations(
    db_session, client_factory, test_department, test_user_cro, monkeypatch, selected_department
):
    freeze(monkeypatch, date(2026, 10, 24))
    other = Department(name="Dashboard drillthrough other", code="D249-OTHER")
    db_session.add(other)
    await db_session.flush()
    dept_id, other_id, actor_id = test_department.id, other.id, test_user_cro.id
    setting = (
        await db_session.execute(select(GlobalConfig).where(GlobalConfig.key == "critical_risk_min_net_score"))
    ).scalar_one_or_none()
    if setting is None:
        setting = GlobalConfig(
            key="critical_risk_min_net_score",
            value="20",
            value_type="int",
            category="risk_thresholds",
            display_name="Critical threshold",
        )
        db_session.add(setting)
    else:
        setting.value = "20"
    db_session.add(
        GlobalConfig(
            key="ict_register_riz_krit",
            value="16",
            value_type="int",
            category="ict_register",
            display_name="Workbook critical band",
        )
    )
    await db_session.commit()
    clear_config_cache()
    now = datetime.now(UTC)
    expected_risks, expected_vendors = set(), set()
    for department_id in [dept_id, other_id]:
        for code, score, status, archived in [
            ("critical", 22, "active", False),
            ("below", 18, "active", False),
            ("emerging", 23, "emerging", False),
            ("archived", 24, "active", True),
        ]:
            risk = await create_test_risk(
                db_session,
                department_id=department_id,
                owner_id=actor_id,
                risk_id_code=f"D249-{department_id}-{code}",
                overrides={"net_score": score, "status": status, "is_archived": archived},
            )
            if code == "critical":
                expected_risks.add(risk.id)
            if code in {"critical", "archived"}:
                for kri_archived in [False, True]:
                    await create_test_kri(
                        db_session,
                        risk_id=risk.id,
                        metric_name=f"D249 due {code}-{kri_archived}",
                        overrides={"frequency": "monthly", "last_period_end": None, "is_archived": kri_archived},
                    )
        for score, archived in [(4, False), (5, False), (3, False), (5, True)]:
            vendor = await create_test_vendor(
                db_session,
                department_id=department_id,
                owner_id=actor_id,
                name=f"D249 vendor {department_id}-{score}-{archived}",
                overrides={"risk_score_1_5": score, "is_archived": archived},
            )
            if score >= 4 and not archived:
                expected_vendors.add(vendor.id)
        for label, severity, status, overdue in [
            ("high", "high", "open", True),
            ("medium", "medium", "in_progress", False),
            ("closed", "critical", "closed", True),
            ("suppressed", "high", "open", True),
        ]:
            issue = Issue(
                title=f"D249 {department_id} {label}",
                severity=severity,
                status=status,
                source_type="manual",
                department_id=department_id,
                owner_user_id=actor_id,
                created_by_id=actor_id,
                opened_at=now - timedelta(days=10),
                due_at=now + timedelta(days=-1 if overdue else 10),
            )
            db_session.add(issue)
            await db_session.flush()
            if label == "suppressed":
                db_session.add(
                    IssueException(
                        issue_id=issue.id,
                        status="approved",
                        reason="Active exception decoy",
                        requested_by_id=actor_id,
                        approved_by_id=actor_id,
                        requested_at=now - timedelta(days=3),
                        approved_at=now - timedelta(days=2),
                        expires_at=now + timedelta(days=5),
                    )
                )
    await db_session.commit()
    department = {"department_id": dept_id} if selected_department else {}
    try:
        async with client_factory(current_user=test_user_cro) as client:
            response = await client.get("/api/v1/dashboard/issues-summary", params=department)
            assert response.status_code == 200, response.text
            summary = response.json()
            for metric, extra in [
                ("open_issues", {}),
                ("overdue_issues", {"overdue": True}),
                ("high_severity_open", {"severity_group": "high_critical"}),
            ]:
                listed = await client.get(
                    "/api/v1/issues",
                    params={"include_closed": False, "exclude_active_exceptions": True, **department, **extra},
                )
                assert listed.status_code == 200, listed.text
                assert listed.json()["total"] == summary[metric] > 0
                assert all("suppressed" not in row["title"] for row in listed.json()["items"])
            legacy = await client.get("/api/v1/issues", params=department)
            assert legacy.status_code == 200
            assert legacy.json()["total"] > summary["open_issues"], "exception decoy distinguishes DEF-06"
            for endpoint, criteria in [
                ("overdue", {"monitoring_status": "not_submitted"}),
                ("due-soon", {"timeliness_status": "due_soon"}),
            ]:
                widget = await client.get(f"/api/v1/kris/{endpoint}", params=department)
                listed = await client.get("/api/v1/kris", params={"lifecycle": "active", **department, **criteria})
                assert widget.status_code == listed.status_code == 200
                assert listed.json()["total"] == len(widget.json()) > 0
                assert {row["kri_id"] for row in widget.json()} == {row["id"] for row in listed.json()["items"]}
            overview = await client.get("/api/v1/dashboard/summary", params=department)
            vendors = await client.get(
                "/api/v1/vendors",
                params={"lifecycle": "active", **({"department_ids": [dept_id]} if selected_department else {})},
            )
            assert overview.status_code == vendors.status_code == 200
            assert overview.json()["total_vendors"] == vendors.json()["total"] == (3 if selected_department else 6)
            # Committee is actor-scoped and active-only, independent of overview filters.
            committee = await client.get("/api/v1/dashboard/committee-summary")
            risks = await client.get(
                "/api/v1/risks", params={"lifecycle": "active", "status": "active", "min_net_score": 20}
            )
            high_vendors = await client.get("/api/v1/vendors", params={"lifecycle": "active", "risk_scores": [4, 5]})
            assert committee.status_code == risks.status_code == high_vendors.status_code == 200
            assert committee.json()["critical_risks_total"] == risks.json()["total"] == len(expected_risks)
            assert {row["id"] for row in risks.json()["items"]} == expected_risks
            workbook = await client.get(
                "/api/v1/risks", params={"lifecycle": "active", "status": "active", "net_band": "Kritické"}
            )
            assert workbook.status_code == 200
            assert workbook.json()["total"] > risks.json()["total"], "nondefault threshold must distinguish DEF-08"
            assert committee.json()["critical_vendors_total"] == high_vendors.json()["total"] == len(expected_vendors)
            assert {row["id"] for row in high_vendors.json()["items"]} == expected_vendors
    finally:
        clear_config_cache()
