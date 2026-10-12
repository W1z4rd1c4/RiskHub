"""ARCH-12 #245 red-first current-view due parity and reminder liveness."""

from datetime import UTC, date, datetime
from importlib import import_module

import pytest

from app.models import Department
from app.models.risk import ControlRiskLink
from app.models.user import AccessScope
from app.services._kri_history import clock
from app.services._quarterly_comparison import build_quarterly_comparison
from tests.backend.pytest.factories import create_test_control, create_test_kri, create_test_risk


def freeze(monkeypatch, today):
    now = datetime.combine(today, datetime.min.time(), tzinfo=UTC)
    monkeypatch.setattr(clock, "today", lambda: today)
    monkeypatch.setattr(import_module(build_quarterly_comparison.__module__), "utc_now", lambda: now, raising=True)
    for module in [
        "app.services._register_listings.kris",
        "app.services.kri_deadline_service",
    ]:
        monkeypatch.setattr(f"{module}.utc_now", lambda: now)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "endpoint,filters,today",
    [
        ("overdue", {"monitoring_status": "not_submitted"}, date(2026, 10, 24)),
        ("due-soon", {"timeliness_status": "due_soon"}, date(2026, 10, 24)),
    ],
)
@pytest.mark.parametrize("ownership", ["risk", "reporting", "control"])
async def test_widget_matches_register_for_cross_department_owner_and_archived_decoys(
    db_session,
    client_factory,
    test_department,
    test_user,
    test_user_cro,
    monkeypatch,
    endpoint,
    ownership,
    filters,
    today,
):
    freeze(monkeypatch, today)
    test_user.access_scope = AccessScope.DEPARTMENT
    await db_session.flush()
    other = Department(name="Other KRI population", code="KRI-OTHER")
    db_session.add(other)
    await db_session.flush()
    owned = await create_test_risk(
        db_session,
        department_id=other.id,
        owner_id=test_user.id if ownership == "risk" else test_user_cro.id,
        risk_id_code="R-OWNED",
    )
    hidden = await create_test_risk(
        db_session,
        department_id=other.id,
        owner_id=test_user_cro.id,
        risk_id_code="R-HIDDEN",
    )
    archived = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_id_code="R-ARCHIVED",
        overrides={"is_archived": True},
    )
    live = await create_test_kri(
        db_session,
        risk_id=owned.id,
        overrides={"frequency": "monthly", "last_period_end": None},
    )
    if ownership == "reporting":
        # Existing authority includes siblings under the Risk where this actor reports.
        await create_test_kri(
            db_session,
            risk_id=owned.id,
            metric_name="Owned reporting sibling",
            overrides={
                "frequency": "monthly",
                "last_period_end": date(2026, 10, 31),
                "reporting_owner_id": test_user.id,
            },
        )
    elif ownership == "control":
        control = await create_test_control(db_session, department_id=other.id, owner_id=test_user.id)
        db_session.add(ControlRiskLink(control_id=control.id, risk_id=owned.id))
        await db_session.flush()
    for risk in [hidden, archived]:
        await create_test_kri(
            db_session,
            risk_id=risk.id,
            overrides={"frequency": "monthly", "last_period_end": None},
        )
    async with client_factory(current_user=test_user) as client:
        register = await client.get("/api/v1/kris", params=filters)
        widget = await client.get(f"/api/v1/kris/{endpoint}")
        strict_widget = await client.get(f"/api/v1/kris/{endpoint}", params={"department_id": other.id})
        strict_register = await client.get("/api/v1/kris", params={**filters, "department_id": other.id})
    assert register.status_code == widget.status_code == 200
    assert {row["id"] for row in register.json()["items"]} == {live.id}
    assert {row["kri_id"] for row in widget.json()} == {live.id}
    assert strict_widget.status_code == strict_register.status_code == 200
    assert (
        {row["kri_id"] for row in strict_widget.json()}
        == {row["id"] for row in strict_register.json()["items"]}
        == {live.id}
    )


@pytest.mark.asyncio
async def test_live_quarterly_overdue_counts_never_reported_monthly_kri(
    db_session, client_factory, test_department, test_user_cro, monkeypatch
):
    freeze(monkeypatch, date(2026, 10, 16))
    risk = await create_test_risk(db_session, department_id=test_department.id, owner_id=test_user_cro.id)
    await create_test_kri(
        db_session,
        risk_id=risk.id,
        overrides={"frequency": "monthly", "last_period_end": None},
    )
    async with client_factory(current_user=test_user_cro) as client:
        register = await client.get("/api/v1/kris", params={"monitoring_status": "not_submitted"})
        quarterly = await client.get("/api/v1/dashboard/quarterly-comparison")
    assert register.status_code == quarterly.status_code == 200
    assert register.json()["total"] == 1
    assert quarterly.json()["this_quarter"]["overdue_kris"] == 1


@pytest.mark.asyncio
async def test_http_reminder_job_excludes_archived_parent_kri(
    db_session, client_factory, test_department, test_user_cro, monkeypatch
):
    freeze(monkeypatch, date(2026, 10, 24))
    for archived in [False, True]:
        risk = await create_test_risk(
            db_session,
            department_id=test_department.id,
            owner_id=test_user_cro.id,
            risk_id_code=f"R-REMINDER-{archived}",
            overrides={"is_archived": archived},
        )
        await create_test_kri(
            db_session,
            risk_id=risk.id,
            overrides={"frequency": "monthly", "last_period_end": date(2026, 9, 30)},
        )
    async with client_factory(current_user=test_user_cro) as client:
        response = await client.post("/api/v1/notifications/trigger-kri-check")
    assert response.status_code == 200, response.text
    assert response.json()["results"]["total_kris_checked"] == 1
    assert response.json()["results"]["due_soon"] == 1


@pytest.mark.asyncio
async def test_stored_overdue_snapshot_is_not_reclassified(
    db_session, client_factory, test_department, test_user_cro, monkeypatch
):
    from app.core.snapshot_service import save_quarter_snapshot
    from app.models.quarterly_metric_snapshot import SnapshotType

    freeze(monkeypatch, date(2026, 10, 16))
    risk = await create_test_risk(db_session, department_id=test_department.id, owner_id=test_user_cro.id)
    await create_test_kri(
        db_session,
        risk_id=risk.id,
        overrides={"frequency": "monthly", "last_period_end": None},
    )
    await save_quarter_snapshot(
        db_session,
        quarter_label="2026-Q3",
        year=2026,
        quarter_number=3,
        metrics={
            "overdue_kris": 7,
            "_metric_definitions": {"overdue_kris": "riskhub.snapshot.overdue_kris.v1"},
        },
        snapshot_type=SnapshotType.MANUAL,
        captured_at=datetime(2026, 7, 16, tzinfo=UTC),
    )
    async with client_factory(current_user=test_user_cro) as client:
        response = await client.get("/api/v1/dashboard/quarterly-comparison")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["this_quarter"]["overdue_kris"] == 1
    assert body["last_quarter"]["overdue_kris"] == 7
    assert body["metric_observations"]["overdue_kris"]["current"]["definition_id"] == "riskhub.snapshot.overdue_kris.v2"
    assert body["metric_observations"]["overdue_kris"]["compare"]["definition_id"] == "riskhub.snapshot.overdue_kris.v1"
    # Existing source-comparability guard takes precedence over definition drift.
    assert body["changes"]["overdue_kris"]["reason"] == "incomparable_source"
