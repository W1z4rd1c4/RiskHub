"""#266: real CSV/register and replayed-parent population acceptance."""

import csv
from datetime import UTC, date, datetime
from io import StringIO

import pytest
from sqlalchemy import update

from app.models import ActivityLog, Department, KeyRiskIndicator
from app.models.user import AccessScope
from tests.backend.pytest.factories import create_test_kri, create_test_risk
from tests.backend.pytest.test_char_kri_breach import _seed_single_breach
from tests.backend.pytest.test_kri_due_population_http import freeze


def freeze_export(monkeypatch, today):
    freeze(monkeypatch, today)
    now = datetime.combine(today, datetime.min.time(), tzinfo=UTC)
    for module in (
        "app.api.v1.endpoints.reports._export_context",
        "app.services.export_snapshot_service",
        "app.services._reporting.exports.filters",
    ):
        monkeypatch.setattr(f"{module}.utc_now", lambda: now)


def csv_rows(response):
    assert response.status_code == 200, response.text
    return list(csv.DictReader(StringIO(response.text)))


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status,lifecycle,expected",
    [
        ("all", "active", {"Breaching live", "Within live"}),
        (
            "archived",
            "archived",
            {"Breaching archived", "Breaching under archived risk"},
        ),
    ],
)
async def test_export_lifecycle_matches_live_register_with_archived_parent_decoy(
    db_session,
    client_factory,
    test_department,
    test_user_cro,
    monkeypatch,
    status,
    lifecycle,
    expected,
):
    freeze_export(monkeypatch, date(2026, 10, 24))
    await _seed_single_breach(db_session, department_id=test_department.id, owner_id=test_user_cro.id)
    async with client_factory(current_user=test_user_cro) as client:
        listing = await client.get("/api/v1/kris", params={"lifecycle": lifecycle})
        exported = await client.get("/api/v1/reports/kris/export", params={"format": "csv", "status": status})
    assert listing.status_code == 200, listing.text
    assert {row["metric_name"] for row in listing.json()["items"]} == expected
    assert {row["Metric"] for row in csv_rows(exported)} == expected


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "today,status,list_filter,expected",
    [
        (date(2026, 10, 15), "overdue", {"monitoring_status": "not_submitted"}, set()),
        (
            date(2026, 10, 16),
            "overdue",
            {"monitoring_status": "not_submitted"},
            {"Breaching live", "Within live"},
        ),
        (
            date(2026, 10, 24),
            "all",
            {"timeliness_status": "due_soon"},
            {"Breaching live", "Within live"},
        ),
        (date(2026, 10, 31), "all", {"timeliness_status": "due_soon"}, set()),
    ],
)
async def test_export_period_population_matches_register(
    db_session,
    client_factory,
    test_department,
    test_user_cro,
    monkeypatch,
    today,
    status,
    list_filter,
    expected,
):
    freeze_export(monkeypatch, today)
    await _seed_single_breach(db_session, department_id=test_department.id, owner_id=test_user_cro.id)
    await db_session.execute(update(KeyRiskIndicator).values(frequency="monthly", last_period_end=None))
    params = {"format": "csv", "status": status}
    if "timeliness_status" in list_filter:
        params.update(list_filter)
    async with client_factory(current_user=test_user_cro) as client:
        listing = await client.get("/api/v1/kris", params=list_filter)
        exported = await client.get("/api/v1/reports/kris/export", params=params)
    assert listing.status_code == 200, listing.text
    assert {row["metric_name"] for row in listing.json()["items"]} == expected
    assert {row["Metric"] for row in csv_rows(exported)} == expected


@pytest.mark.asyncio
@pytest.mark.parametrize("old_archived,new_archived", [(False, True), (True, False)])
@pytest.mark.parametrize("reassigned", [False, True])
async def test_export_replays_selected_parent_lifecycle(
    db_session,
    client_factory,
    test_department,
    test_user_cro,
    monkeypatch,
    old_archived,
    new_archived,
    reassigned,
):
    freeze_export(monkeypatch, date(2026, 10, 24))
    old_parent = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="R-HISTORIC",
        overrides={"is_archived": new_archived},
    )
    current_parent = old_parent
    if reassigned:
        current_parent = await create_test_risk(
            db_session,
            department_id=test_department.id,
            owner_id=test_user_cro.id,
            risk_id_code="R-CURRENT",
            overrides={"is_archived": not old_archived},
        )
    kri = await create_test_kri(db_session, risk_id=current_parent.id, metric_name="Replayed metric")
    db_session.add(
        ActivityLog(
            entity_type="risk",
            entity_id=old_parent.id,
            entity_name=old_parent.name,
            action="update",
            actor_name="Fixture",
            description="Parent lifecycle transition",
            changes={"is_archived": {"old": old_archived, "new": new_archived}},
            created_at=datetime(2026, 10, 23, 12, tzinfo=UTC),
        )
    )
    if reassigned:
        db_session.add(
            ActivityLog(
                entity_type="kri",
                entity_id=kri.id,
                entity_name=kri.metric_name,
                action="update",
                actor_name="Fixture",
                description="Parent reassignment",
                changes={"risk_id": {"old": old_parent.id, "new": current_parent.id}},
                created_at=datetime(2026, 10, 23, 12, tzinfo=UTC),
            )
        )
    await db_session.commit()
    async with client_factory(current_user=test_user_cro) as client:
        result = await client.get(
            "/api/v1/reports/kris/export",
            params={
                "format": "csv",
                "as_of_date": "2026-10-22",
                "status": "archived" if old_archived else "all",
            },
        )
        opposite = await client.get(
            "/api/v1/reports/kris/export",
            params={
                "format": "csv",
                "as_of_date": "2026-10-22",
                "status": "all" if old_archived else "archived",
            },
        )
    rows = csv_rows(result)
    assert {row["Metric"] for row in rows} == {"Replayed metric"}
    assert rows[0]["Risk ID"] == "R-HISTORIC"
    assert rows[0]["Status"] == ("archived" if old_archived else "active")
    assert csv_rows(opposite) == []


@pytest.mark.asyncio
async def test_replayed_parent_cannot_disclose_currently_forbidden_risk(
    db_session, client_factory, test_department, test_user, test_user_cro, monkeypatch
):
    freeze_export(monkeypatch, date(2026, 10, 24))
    test_user.access_scope = AccessScope.DEPARTMENT
    foreign = Department(name="Confidential acquisition", code="CONF-EXPORT")
    db_session.add(foreign)
    await db_session.flush()
    hidden = await create_test_risk(
        db_session,
        department_id=foreign.id,
        owner_id=test_user_cro.id,
        risk_id_code="SECRET-RISK",
        overrides={"name": "Secret acquisition"},
    )
    visible = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_id_code="VISIBLE-RISK",
    )
    kri = await create_test_kri(db_session, risk_id=visible.id, metric_name="Moved metric")
    await create_test_kri(db_session, risk_id=hidden.id, metric_name="Wholly hidden metric")
    db_session.add(
        ActivityLog(
            entity_type="kri",
            entity_id=kri.id,
            entity_name=kri.metric_name,
            action="update",
            actor_name="Fixture",
            description="Reassigned to visible parent",
            changes={
                "risk_id": {"old": hidden.id, "new": visible.id},
                "risk_name": {"old": hidden.name, "new": visible.name},
                "risk_id_code": {
                    "old": hidden.risk_id_code,
                    "new": visible.risk_id_code,
                },
            },
            created_at=datetime(2026, 10, 23, 12, tzinfo=UTC),
        )
    )
    await db_session.commit()
    async with client_factory(current_user=test_user) as client:
        denied = await client.get(f"/api/v1/risks/{hidden.id}")
        current = await client.get("/api/v1/reports/kris/export", params={"format": "csv"})
        historical = await client.get(
            "/api/v1/reports/kris/export",
            params={
                "format": "csv",
                "as_of_date": "2026-10-22",
            },
        )
    assert denied.status_code == 404
    assert {row["Metric"] for row in csv_rows(current)} == {"Moved metric"}
    assert csv_rows(historical) == []
    assert hidden.name not in historical.text
    assert hidden.risk_id_code not in historical.text
    async with client_factory(current_user=test_user) as client:
        searched = await client.get(
            "/api/v1/reports/kris/export",
            params={
                "format": "csv",
                "as_of_date": "2026-10-22",
                "search": "Moved",
            },
        )
    assert csv_rows(searched) == []


@pytest.mark.asyncio
@pytest.mark.parametrize("parent_transition", ["legacy_archived", "created_after", "missing"])
async def test_replayed_parent_unknown_or_archived_never_becomes_active(
    db_session,
    client_factory,
    test_department,
    test_user_cro,
    monkeypatch,
    parent_transition,
):
    freeze_export(monkeypatch, date(2026, 10, 24))
    parent = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="R-UNKNOWN",
    )
    kri = await create_test_kri(db_session, risk_id=parent.id, metric_name="Unavailable parent metric")
    entity_type, entity_id, action = "risk", parent.id, "update"
    if parent_transition == "legacy_archived":
        changes = {"status": {"old": "archived", "new": "active"}}
    elif parent_transition == "created_after":
        action, changes = "create", {}
    else:
        entity_type, entity_id = "kri", kri.id
        changes = {"risk_id": {"old": 987654, "new": parent.id}}
    db_session.add(
        ActivityLog(
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name="Fixture",
            action=action,
            actor_name="Fixture",
            description="Replayed parent evidence",
            changes=changes,
            created_at=datetime(2026, 10, 23, 12, tzinfo=UTC),
        )
    )
    await db_session.commit()
    async with client_factory(current_user=test_user_cro) as client:
        live = await client.get(
            "/api/v1/reports/kris/export",
            params={"format": "csv", "as_of_date": "2026-10-22"},
        )
        archived = await client.get(
            "/api/v1/reports/kris/export",
            params={
                "format": "csv",
                "as_of_date": "2026-10-22",
                "status": "archived",
            },
        )
    assert csv_rows(live) == []
    assert {row["Metric"] for row in csv_rows(archived)} == (
        {"Unavailable parent metric"} if parent_transition == "legacy_archived" else set()
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("old_last,expected", [(None, {"Historical monthly"}), ("2026-09-30", set())])
async def test_historical_overdue_uses_replayed_frequency_and_period(
    db_session,
    client_factory,
    test_department,
    test_user_cro,
    monkeypatch,
    old_last,
    expected,
):
    freeze_export(monkeypatch, date(2026, 10, 24))
    parent = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="R-PERIOD",
    )
    kri = await create_test_kri(
        db_session,
        risk_id=parent.id,
        metric_name="Historical monthly",
        overrides={"frequency": "quarterly", "last_period_end": date(2026, 12, 31)},
    )
    db_session.add(
        ActivityLog(
            entity_type="kri",
            entity_id=kri.id,
            entity_name=kri.metric_name,
            action="update",
            actor_name="Fixture",
            description="Submission and frequency changed",
            changes={
                "frequency": {"old": "monthly", "new": "quarterly"},
                "last_period_end": {"old": old_last, "new": "2026-12-31"},
            },
            created_at=datetime(2026, 10, 23, 12, tzinfo=UTC),
        )
    )
    await db_session.commit()
    async with client_factory(current_user=test_user_cro) as client:
        response = await client.get(
            "/api/v1/reports/kris/export",
            params={
                "format": "csv",
                "as_of_date": "2026-10-22",
                "status": "overdue",
            },
        )
    assert {row["Metric"] for row in csv_rows(response)} == expected


@pytest.mark.asyncio
@pytest.mark.parametrize("ownership", ["risk", "reporting", "control"])
async def test_export_preserves_cross_department_readable_population_and_report_gate(
    db_session, client_factory, test_department, test_user, test_user_cro, monkeypatch, ownership
):
    from app.models.risk import ControlRiskLink
    from tests.backend.pytest.factories import create_test_control

    freeze_export(monkeypatch, date(2026, 10, 24))
    test_user.access_scope = AccessScope.DEPARTMENT
    foreign = Department(name="Owned foreign department", code="OWNED-EXPORT")
    db_session.add(foreign)
    await db_session.flush()
    parent = await create_test_risk(
        db_session,
        department_id=foreign.id,
        owner_id=test_user.id if ownership == "risk" else test_user_cro.id,
        risk_id_code="R-OWNED-EXPORT",
    )
    await create_test_kri(db_session, risk_id=parent.id, metric_name="Readable sibling")
    if ownership == "reporting":
        await create_test_kri(
            db_session,
            risk_id=parent.id,
            metric_name="Reporting sibling",
            overrides={"reporting_owner_id": test_user.id},
        )
    elif ownership == "control":
        control = await create_test_control(db_session, department_id=foreign.id, owner_id=test_user.id)
        db_session.add(ControlRiskLink(control_id=control.id, risk_id=parent.id))
    await db_session.commit()
    async with client_factory(current_user=test_user) as client:
        listing = await client.get("/api/v1/kris")
        exported = await client.get("/api/v1/reports/kris/export", params={"format": "csv"})
        denied = await client.get("/api/v1/reports/kris/export", params={"format": "csv", "department_id": foreign.id})
    assert listing.status_code == 200, listing.text
    expected = {"Readable sibling", "Reporting sibling"} if ownership == "reporting" else {"Readable sibling"}
    assert {row["metric_name"] for row in listing.json()["items"]} == expected
    assert {row["Metric"] for row in csv_rows(exported)} == expected
    # Report department-shell authority remains its existing explicit contract.
    assert denied.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "field,old",
    [
        ("is_archived", "[REDACTED]"),
        ("last_period_end", "[REDACTED]"),
        ("frequency", "[REDACTED]"),
        ("risk_status", "[REDACTED]"),
        ("frequency", None),
        ("risk_status", ""),
    ],
)
async def test_unavailable_historical_facts_do_not_fabricate_live_overdue_state(
    db_session, client_factory, test_department, test_user_cro, monkeypatch, field, old
):
    freeze_export(monkeypatch, date(2026, 10, 24))
    parent = await create_test_risk(
        db_session, department_id=test_department.id, owner_id=test_user_cro.id, risk_id_code="R-INCOMPLETE"
    )
    kri = await create_test_kri(db_session, risk_id=parent.id, metric_name="Incomplete history")
    db_session.add(
        ActivityLog(
            entity_type="risk" if field == "risk_status" else "kri",
            entity_id=parent.id if field == "risk_status" else kri.id,
            entity_name=kri.metric_name,
            action="update",
            actor_name="Fixture",
            description="Unavailable old fact",
            changes={"status" if field == "risk_status" else field: {"old": old, "new": None}},
            created_at=datetime(2026, 10, 23, 12, tzinfo=UTC),
        )
    )
    await db_session.commit()
    async with client_factory(current_user=test_user_cro) as client:
        response = await client.get("/api/v1/reports/kris/export", params={"format": "csv", "as_of_date": "2026-10-22"})
    assert csv_rows(response) == []


@pytest.mark.asyncio
async def test_legacy_replayed_frequency_and_nonarchived_risk_status_remain_supported(
    db_session, client_factory, test_department, test_user_cro, monkeypatch
):
    freeze_export(monkeypatch, date(2026, 10, 24))
    parent = await create_test_risk(
        db_session, department_id=test_department.id, owner_id=test_user_cro.id, risk_id_code="R-LEGACY-FACTS"
    )
    kri = await create_test_kri(db_session, risk_id=parent.id, metric_name="Legacy facts")
    for kind, identity, changes in [
        ("risk", parent.id, {"status": {"old": "draft", "new": "active"}}),
        ("kri", kri.id, {"frequency": {"old": "legacy-quarter", "new": "monthly"}}),
    ]:
        db_session.add(
            ActivityLog(
                entity_type=kind,
                entity_id=identity,
                entity_name="Fixture",
                action="update",
                actor_name="Fixture",
                description="Supported legacy facts",
                changes=changes,
                created_at=datetime(2026, 10, 23, 12, tzinfo=UTC),
            )
        )
    await db_session.commit()
    async with client_factory(current_user=test_user_cro) as client:
        result = await client.get("/api/v1/reports/kris/export", params={"format": "csv", "as_of_date": "2026-10-22"})
    rows = csv_rows(result)
    assert {row["Metric"] for row in rows} == {"Legacy facts"}
    assert rows[0]["Frequency"] == "legacy-quarter"
    assert rows[0]["Status"] == "active"
