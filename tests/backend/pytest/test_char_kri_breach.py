"""Characterization test: KRI breach flag/count consistency across read paths.

PURPOSE (regression safety net for a later refactor):
A KRI is "breaching" when its current_value falls outside [lower_limit, upper_limit].
Today this predicate is duplicated verbatim across several read paths:

  - app/core/_snapshot_metrics/kri.py::count_kri_breaches
  - app/services/_dashboard_metrics/departments.py (breaching_kri_count)
  - app/services/_register_listings/risks.py  (has_breach filter -> risk grain)
  - app/services/_register_listings/kris.py   (breach_only filter / load_kri_sql_groups)
  - app/services/_monitoring_status/queries.py (KRIMonitoringStatus.breach)

Phase #1 will consolidate that duplicated predicate. This test PINS the CURRENT
behavior so the refactor is provably behavior-preserving: given one seeded breach,
every path that exposes breach must report the SAME breach set.

It also documents a KNOWN, DELIBERATE divergence (see the module-level notes on
grain and on the _monitoring_status "submitted-for-period" precondition) so a later
phase does not mistake it for a regression.

Seeded on a single department:
  - 1 breaching LIVE KRI on a LIVE risk        -> the ONE true breach
  - 1 in-range LIVE KRI on the SAME LIVE risk  -> decoy (not breaching)
  - 1 breaching ARCHIVED KRI on the LIVE risk  -> decoy (archived KRIs excluded)
  - 1 breaching LIVE KRI on an ARCHIVED risk   -> decoy (archived-parent excluded)

Every breach-exposing path must therefore see exactly ONE breaching KRI, and the
single risk that owns it (register-risks reports at RISK grain).
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core._snapshot_metrics.kri import count_kri_breaches
from app.models import KeyRiskIndicator, Risk
from app.services._dashboard_metrics.departments import load_department_dashboard_metrics
from app.services._monitoring_status import KRIMonitoringStatus, apply_kri_monitoring_status_filter
from tests.backend.pytest.factories import create_test_kri, create_test_risk

# ---------------------------------------------------------------------------
# CONCRETE PINNED NUMBERS (current behavior)
# ---------------------------------------------------------------------------
EXPECTED_BREACHING_KRI_COUNT = 1  # snapshot / dashboard / register-kris grain (KRI grain)
EXPECTED_BREACHING_RISK_COUNT = 1  # register-risks grain (RISK grain)
EXPECTED_TOTAL_LIVE_KRI_COUNT = 2  # the two live KRIs on the live risk


async def _seed_single_breach(db: AsyncSession, *, department_id: int, owner_id: int) -> Risk:
    """Seed exactly one true breach plus archived/decoy rows. Returns the live risk."""
    live_risk = await create_test_risk(
        db, department_id=department_id, owner_id=owner_id, risk_id_code="R-BREACH-LIVE"
    )
    archived_risk = await create_test_risk(
        db,
        department_id=department_id,
        owner_id=owner_id,
        risk_id_code="R-BREACH-ARCH",
        overrides={"is_archived": True},
    )
    # The ONE true breach: current_value 150 > upper_limit 100.
    await create_test_kri(
        db,
        risk_id=live_risk.id,
        metric_name="Breaching live",
        overrides={"current_value": 150.0, "lower_limit": 0.0, "upper_limit": 100.0},
    )
    # In-range decoy (50 within [0, 100]).
    await create_test_kri(
        db,
        risk_id=live_risk.id,
        metric_name="Within live",
        overrides={"current_value": 50.0, "lower_limit": 0.0, "upper_limit": 100.0},
    )
    # Archived KRI decoy (breaching value, but archived -> excluded everywhere).
    await create_test_kri(
        db,
        risk_id=live_risk.id,
        metric_name="Breaching archived",
        overrides={"current_value": 150.0, "is_archived": True},
    )
    # Archived-parent decoy (breaching live KRI, but its parent risk is archived).
    await create_test_kri(
        db,
        risk_id=archived_risk.id,
        metric_name="Breaching under archived risk",
        overrides={"current_value": 150.0},
    )
    return live_risk


@pytest.mark.asyncio
async def test_snapshot_breach_count_is_one(db_session: AsyncSession, test_department, test_user):
    """app/core/_snapshot_metrics: exactly one breaching live KRI."""
    await _seed_single_breach(db_session, department_id=test_department.id, owner_id=test_user.id)

    assert await count_kri_breaches(db_session, None) == EXPECTED_BREACHING_KRI_COUNT
    assert await count_kri_breaches(db_session, [test_department.id]) == EXPECTED_BREACHING_KRI_COUNT


@pytest.mark.asyncio
async def test_dashboard_departments_breach_count_matches_snapshot(
    db_session: AsyncSession, test_department, test_user_cro
):
    """app/services/_dashboard_metrics/departments: breaching_kri_count == snapshot count."""
    await _seed_single_breach(db_session, department_id=test_department.id, owner_id=test_user_cro.id)

    metrics = await load_department_dashboard_metrics(
        db=db_session,
        current_user=test_user_cro,
        department_id=None,
        include_archived=False,
    )
    by_dept = {m.department_id: m for m in metrics}
    assert test_department.id in by_dept
    dept = by_dept[test_department.id]
    assert dept.breaching_kri_count == EXPECTED_BREACHING_KRI_COUNT
    assert dept.total_kri_count == EXPECTED_TOTAL_LIVE_KRI_COUNT

    # Cross-path identity: dashboard breach count equals the snapshot breach count.
    assert dept.breaching_kri_count == await count_kri_breaches(db_session, [test_department.id])


@pytest.mark.asyncio
async def test_register_kris_breach_only_matches_snapshot(
    db_session: AsyncSession, client_factory, test_department, test_user_cro
):
    """app/services/_register_listings/kris via GET /api/v1/kris?breach_only=true.

    KRI grain: the register 'breach_only' filter surfaces exactly the breaching KRIs,
    which must equal the snapshot breach count.
    """
    await _seed_single_breach(db_session, department_id=test_department.id, owner_id=test_user_cro.id)
    snapshot_count = await count_kri_breaches(db_session, None)

    async with client_factory(current_user=test_user_cro) as ac:
        resp = await ac.get("/api/v1/kris", params={"breach_only": "true"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == EXPECTED_BREACHING_KRI_COUNT
    assert body["total"] == snapshot_count
    # Every returned KRI is genuinely breaching (value outside its limits).
    for item in body["items"]:
        assert item["current_value"] < item["lower_limit"] or item["current_value"] > item["upper_limit"]


@pytest.mark.asyncio
async def test_register_risks_has_breach_matches_breaching_risk_grain(
    db_session: AsyncSession, client_factory, test_department, test_user_cro
):
    """app/services/_register_listings/risks via GET /api/v1/risks?has_breach=true.

    RISK grain (documented divergence from KRI grain): this path returns the distinct
    RISKS that own >=1 breaching live KRI. With one breach on one risk that is 1 risk.
    """
    await _seed_single_breach(db_session, department_id=test_department.id, owner_id=test_user_cro.id)

    async with client_factory(current_user=test_user_cro) as ac:
        resp = await ac.get("/api/v1/risks", params={"has_breach": "true"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == EXPECTED_BREACHING_RISK_COUNT
    codes = {item["risk_id_code"] for item in body["items"]}
    assert codes == {"R-BREACH-LIVE"}


@pytest.mark.asyncio
async def test_monitoring_status_breach_filter_matches_snapshot(
    db_session: AsyncSession, test_department, test_user
):
    """app/services/_monitoring_status/queries: KRIMonitoringStatus.breach.

    DOCUMENTED PRECONDITION / DIVERGENCE: the monitoring 'breach' status additionally
    requires the KRI to be 'submitted for the required period' (last_period_end >= the
    latest closed period end). So a breaching KRI with a stale/NULL last_period_end is
    'not_submitted', NOT 'breach'. Here we make last_period_end current (today) so the
    breaching KRI qualifies, and confirm the monitoring breach set then equals the
    snapshot breach set (== 1).
    """
    live_risk = await create_test_risk(
        db_session, department_id=test_department.id, owner_id=test_user.id, risk_id_code="R-MON-LIVE"
    )
    today = date(2026, 6, 30)
    # Breaching AND submitted for the current period (last_period_end == today).
    await create_test_kri(
        db_session,
        risk_id=live_risk.id,
        metric_name="Monitoring breach submitted",
        overrides={
            "current_value": 150.0,
            "lower_limit": 0.0,
            "upper_limit": 100.0,
            "frequency": "monthly",
            "last_period_end": today,
        },
    )
    # In-range submitted decoy.
    await create_test_kri(
        db_session,
        risk_id=live_risk.id,
        metric_name="Monitoring within submitted",
        overrides={"current_value": 50.0, "frequency": "monthly", "last_period_end": today},
    )

    base = (
        select(func.count(func.distinct(KeyRiskIndicator.id)))
        .select_from(KeyRiskIndicator)
        .join(Risk, Risk.id == KeyRiskIndicator.risk_id)
        .where(KeyRiskIndicator.is_archived.is_(False), Risk.live())
    )
    filtered = apply_kri_monitoring_status_filter(
        base,
        monitoring_status=KRIMonitoringStatus.breach,
        today=today,
        warning_upper_margin_ratio=0.1,
    )
    monitoring_breach_count = (await db_session.execute(filtered)).scalar() or 0
    assert monitoring_breach_count == EXPECTED_BREACHING_KRI_COUNT
    assert monitoring_breach_count == await count_kri_breaches(db_session, None)


@pytest.mark.asyncio
async def test_monitoring_status_breach_requires_submitted_period(
    db_session: AsyncSession, test_department, test_user
):
    """Pin the divergence itself: a breaching-but-stale KRI is NOT a monitoring 'breach'.

    Same breaching value, but last_period_end is far in the past -> the monitoring
    'breach' filter excludes it (it is 'not_submitted'), even though snapshot counts it.
    """
    live_risk = await create_test_risk(
        db_session, department_id=test_department.id, owner_id=test_user.id, risk_id_code="R-MON-STALE"
    )
    today = date(2026, 6, 30)
    stale_period_end = datetime(2026, 6, 30, tzinfo=UTC).date() - timedelta(days=400)
    await create_test_kri(
        db_session,
        risk_id=live_risk.id,
        metric_name="Breaching stale",
        overrides={
            "current_value": 150.0,
            "frequency": "monthly",
            "last_period_end": stale_period_end,
        },
    )

    base = (
        select(func.count(func.distinct(KeyRiskIndicator.id)))
        .select_from(KeyRiskIndicator)
        .join(Risk, Risk.id == KeyRiskIndicator.risk_id)
        .where(KeyRiskIndicator.is_archived.is_(False), Risk.live())
    )
    filtered = apply_kri_monitoring_status_filter(
        base,
        monitoring_status=KRIMonitoringStatus.breach,
        today=today,
        warning_upper_margin_ratio=0.1,
    )
    monitoring_breach_count = (await db_session.execute(filtered)).scalar() or 0
    # Monitoring says 0 (not submitted) while snapshot still counts the breach as 1.
    assert monitoring_breach_count == 0
    assert await count_kri_breaches(db_session, None) == 1
