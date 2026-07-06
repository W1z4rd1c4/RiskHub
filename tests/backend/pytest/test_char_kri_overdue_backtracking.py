"""Behavior spec: KRI "overdue" backtracks across all three surfaces (ADR-012 SSOT).

The overdue/``not_submitted`` decision is anchored on the latest period whose
``due_date`` (period end + ``REPORTING_GRACE_DAYS``) has STRICTLY passed, via the
single ``app.services._kri_history.periods.overdue_required_period_end`` helper. This
means a KRI that missed an EARLIER period is flagged overdue even while the most recent
period is still inside its grace window -- the previous latest-closed-period-at-``today``
rule UNDER-reported that case.

USER-FACING BEHAVIOR CHANGE: more KRIs now flag as overdue / ``not_submitted``. These
tests pin the intended (backtracking) behavior across the three surfaces and assert they
AGREE for a matrix of (frequency x staleness):

  1. snapshot metrics    -> app.core._snapshot_metrics.kri.count_overdue_kris
  2. monitoring list      -> app.services._monitoring_status.queries.apply_kri_monitoring_status_filter
                             (monitoring_status == not_submitted)
  3. overdue-KRI listing  -> app.services._kri_history.queries.get_overdue_kris

RED against the old today-anchored rule: the monthly-skip case below (last reported
2026-04-30, evaluated 2026-07-06) read as NOT overdue on every surface because the latest
closed period at ``today`` was June (due 2026-07-15, still in grace). GREEN now: May's due
date (2026-06-15) has strictly passed and May was never reported, so it is overdue.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core._snapshot_metrics.kri import count_overdue_kris
from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.risk import Risk
from app.services._kri_history import clock, queries
from app.services._monitoring_status import (
    KRIMonitoringConfig,
    KRIMonitoringFacts,
    KRIMonitoringStatus,
    apply_kri_monitoring_status_filter,
    derive_kri_monitoring_snapshot,
)
from tests.backend.pytest.factories import create_test_kri, create_test_risk

# A fixed "today" so calendar-aligned periods are deterministic across surfaces.
TODAY = date(2026, 7, 6)
# 10% upper-warning margin matches ConfigDefaults; irrelevant to not_submitted but the
# filter helper requires it.
WARNING_MARGIN = 0.10


async def _monitoring_not_submitted_ids(db: AsyncSession, *, today: date) -> set[int]:
    """KRI ids the monitoring list filter classifies as not_submitted (SQL surface)."""
    base = select(KeyRiskIndicator.id).join(Risk, KeyRiskIndicator.risk_id == Risk.id).where(
        KeyRiskIndicator.is_archived.is_(False), Risk.live()
    )
    filtered = apply_kri_monitoring_status_filter(
        base,
        monitoring_status=KRIMonitoringStatus.not_submitted,
        today=today,
        warning_upper_margin_ratio=WARNING_MARGIN,
    )
    return set((await db.execute(filtered)).scalars().all())


async def _overdue_listing_ids(db: AsyncSession) -> set[int]:
    rows = await queries.get_overdue_kris(db)
    return {row["kri_id"] for row in rows}


# ---------------------------------------------------------------------------
# Approved scenario 1: monthly KRI that skipped a closed, past-due period.
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_monthly_skip_is_overdue_on_all_surfaces(
    db_session: AsyncSession, test_department, test_user, monkeypatch
):
    """monthly, today=2026-07-06, last_period_end=2026-04-30 -> OVERDUE everywhere.

    May (ends 2026-05-31, due 2026-06-15) and June (ends 2026-06-30, due 2026-07-15) are
    unreported. May's due date has strictly passed, so the KRI is overdue. Under the old
    today-anchored rule the required period was June (still in grace) -> NOT flagged; this
    is exactly the under-report the backtracking SSOT fixes.
    """
    monkeypatch.setattr(clock, "today", lambda: TODAY)
    risk = await create_test_risk(
        db_session, department_id=test_department.id, owner_id=test_user.id, risk_id_code="R-BT-MSKIP"
    )
    kri = await create_test_kri(
        db_session,
        risk_id=risk.id,
        metric_name="Monthly skipped May+June",
        overrides={"frequency": "monthly", "last_period_end": date(2026, 4, 30)},
    )

    # Surface 3: overdue listing flags it, with days_overdue counted from May's due date.
    overdue_rows = await queries.get_overdue_kris(db_session)
    row = next(item for item in overdue_rows if item["kri_id"] == kri.id)
    assert row["period_end"] == "2026-05-31"
    assert row["due_date"] == "2026-06-15"
    assert row["days_overdue"] == 21  # (2026-07-06 - 2026-06-15).days

    # Surface 2: monitoring not_submitted list filter includes it.
    assert kri.id in await _monitoring_not_submitted_ids(db_session, today=TODAY)

    # Surface 1: snapshot overdue count sees exactly this KRI.
    assert await count_overdue_kris(db_session, None) == 1
    assert await count_overdue_kris(db_session, [test_department.id]) == 1


# ---------------------------------------------------------------------------
# Approved scenario 2: weekly KRI 30 days stale.
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_weekly_30d_stale_is_overdue_on_all_surfaces(
    db_session: AsyncSession, test_department, test_user, monkeypatch
):
    """weekly, today=2026-07-06, last_period_end=2026-06-06 (30d stale) -> OVERDUE everywhere.

    The latest strictly past-due weekly period ends 2026-06-14 (due 2026-06-29); the KRI
    last reported 2026-06-06, before it -> overdue on all three surfaces.
    """
    monkeypatch.setattr(clock, "today", lambda: TODAY)
    risk = await create_test_risk(
        db_session, department_id=test_department.id, owner_id=test_user.id, risk_id_code="R-BT-W30"
    )
    kri = await create_test_kri(
        db_session,
        risk_id=risk.id,
        metric_name="Weekly 30d stale",
        overrides={"frequency": "weekly", "last_period_end": date(2026, 6, 6)},
    )

    overdue_rows = await queries.get_overdue_kris(db_session)
    row = next(item for item in overdue_rows if item["kri_id"] == kri.id)
    assert row["period_end"] == "2026-06-14"
    assert row["due_date"] == "2026-06-29"
    assert row["days_overdue"] == 7  # (2026-07-06 - 2026-06-29).days

    assert kri.id in await _monitoring_not_submitted_ids(db_session, today=TODAY)
    assert await count_overdue_kris(db_session, None) == 1


# ---------------------------------------------------------------------------
# Guard: a KRI that reported the most recent closed period is NOT overdue,
# on every surface (breach/ok path must stay unflagged).
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_monthly_reported_latest_closed_period_is_not_overdue_on_all_surfaces(
    db_session: AsyncSession, test_department, test_user, monkeypatch
):
    """monthly, today=2026-07-06, last_period_end=2026-06-30 (reported June) -> NOT overdue.

    June is the latest closed period; May's due date has passed but June covers it, so the
    KRI is current. No surface should flag it.
    """
    monkeypatch.setattr(clock, "today", lambda: TODAY)
    risk = await create_test_risk(
        db_session, department_id=test_department.id, owner_id=test_user.id, risk_id_code="R-BT-JUNE"
    )
    kri = await create_test_kri(
        db_session,
        risk_id=risk.id,
        metric_name="Monthly reported June",
        overrides={"frequency": "monthly", "last_period_end": date(2026, 6, 30)},
    )

    assert kri.id not in await _overdue_listing_ids(db_session)
    assert kri.id not in await _monitoring_not_submitted_ids(db_session, today=TODAY)
    assert await count_overdue_kris(db_session, None) == 0


# ---------------------------------------------------------------------------
# Cross-surface consistency matrix: (frequency x staleness). All three surfaces
# must agree on overdue-ness for every case, and the aggregate expected count holds.
# ---------------------------------------------------------------------------
# Each entry: (metric_name, frequency, last_period_end, expected_overdue)
_MATRIX: list[tuple[str, str, date, bool]] = [
    # monthly: skipped an earlier period while the latest is in grace -> OVERDUE
    ("m-skip", "monthly", date(2026, 4, 30), True),
    # monthly: reported the latest closed period -> NOT overdue
    ("m-current", "monthly", date(2026, 6, 30), False),
    # weekly: 30 days stale -> OVERDUE
    ("w-30d", "weekly", date(2026, 6, 6), True),
    # weekly: reported the latest closed week -> NOT overdue
    ("w-current", "weekly", date(2026, 7, 5), False),
    # quarterly: 60 days stale (reported 2026-05-07, Q2 still open, Q1 due 2026-04-15
    # already covered by the 2026-05-07 report) -> NOT overdue
    ("q-60d", "quarterly", date(2026, 5, 7), False),
    # annually: 20 days stale -> trivially current -> NOT overdue
    ("a-20d", "annually", date(2026, 6, 16), False),
]


@pytest.mark.asyncio
async def test_three_surfaces_agree_on_overdue_matrix(
    db_session: AsyncSession, test_department, test_user, monkeypatch
):
    """snapshot, monitoring not_submitted, and get_overdue_kris agree per KRI and in aggregate."""
    monkeypatch.setattr(clock, "today", lambda: TODAY)
    risk = await create_test_risk(
        db_session, department_id=test_department.id, owner_id=test_user.id, risk_id_code="R-BT-MATRIX"
    )
    expected_overdue_ids: set[int] = set()
    for metric_name, frequency, last_period_end, expected_overdue in _MATRIX:
        kri = await create_test_kri(
            db_session,
            risk_id=risk.id,
            metric_name=metric_name,
            overrides={"frequency": frequency, "last_period_end": last_period_end},
        )
        if expected_overdue:
            expected_overdue_ids.add(kri.id)

    listing_ids = await _overdue_listing_ids(db_session)
    monitoring_ids = await _monitoring_not_submitted_ids(db_session, today=TODAY)

    # Surfaces 2 and 3 agree with each other and with the expected set.
    assert listing_ids == expected_overdue_ids
    assert monitoring_ids == expected_overdue_ids

    # Surface 1 (aggregate count) agrees on cardinality.
    assert await count_overdue_kris(db_session, None) == len(expected_overdue_ids)


# ---------------------------------------------------------------------------
# NEVER-REPORTED (null-history) consistency matrix. This is the coverage gap that
# let the overdue-unification divergence through: the not_submitted LIST FILTER must
# classify a never-reported KRI (last_period_end IS NULL) IDENTICALLY to the DETAIL
# classifier. A never-reported KRI stays `new` inside its initial (today-anchored)
# grace window and only becomes not_submitted once its first required period is
# strictly past due -- both surfaces key off the shared never_reported_is_overdue SSOT.
#
# On TODAY = 2026-07-06:
#   daily/weekly/monthly/quarterly -> latest closed period still in grace  -> new
#   annually                       -> 2025 period due 2026-01-15 past due  -> not_submitted
# ---------------------------------------------------------------------------
_NEVER_REPORTED_MATRIX: list[tuple[str, str, KRIMonitoringStatus]] = [
    ("nr-daily", "daily", KRIMonitoringStatus.new),
    ("nr-weekly", "weekly", KRIMonitoringStatus.new),
    ("nr-monthly", "monthly", KRIMonitoringStatus.new),
    ("nr-quarterly", "quarterly", KRIMonitoringStatus.new),
    ("nr-annually", "annually", KRIMonitoringStatus.not_submitted),
]


def _never_reported_detail_status(frequency: str) -> KRIMonitoringStatus:
    """DETAIL classifier status for a never-reported, in-range (non-breaching) KRI."""
    facts = KRIMonitoringFacts(
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        breach_status="within",
        frequency=frequency,
        last_period_end=None,
        has_submission_history=False,
    )
    return derive_kri_monitoring_snapshot(
        facts, KRIMonitoringConfig(warning_upper_margin_ratio=WARNING_MARGIN), today=TODAY
    ).monitoring_status


@pytest.mark.asyncio
async def test_never_reported_filter_membership_matches_detail_status(
    db_session: AsyncSession, test_department, test_user, monkeypatch
):
    """For null-history KRIs, THREE overdue surfaces agree per frequency:

      (a) get_overdue_kris listing membership   -> _overdue_listing_ids
      (b) not_submitted list-filter membership  -> _monitoring_not_submitted_ids
      (c) detail classifier status              -> _never_reported_detail_status

    All three key off the shared never_reported_is_overdue SSOT. Asserting (a) here is
    what closes the P1 gap: the get_overdue_kris listing previously appended EVERY
    never-reported KRI (its null-history guard only skipped up-to-date REPORTED rows),
    so it disagreed with the fixed detail classifier and not_submitted filter.
    """
    monkeypatch.setattr(clock, "today", lambda: TODAY)
    risk = await create_test_risk(
        db_session, department_id=test_department.id, owner_id=test_user.id, risk_id_code="R-BT-NR"
    )
    expected_not_submitted_ids: set[int] = set()
    for metric_name, frequency, expected_status in _NEVER_REPORTED_MATRIX:
        # Pin the detail-classifier expectation for this frequency (surface c).
        assert _never_reported_detail_status(frequency) == expected_status, frequency
        kri = await create_test_kri(
            db_session,
            risk_id=risk.id,
            metric_name=metric_name,
            overrides={"frequency": frequency, "last_period_end": None},
        )
        if expected_status == KRIMonitoringStatus.not_submitted:
            expected_not_submitted_ids.add(kri.id)

    monitoring_ids = await _monitoring_not_submitted_ids(db_session, today=TODAY)
    listing_ids = await _overdue_listing_ids(db_session)

    # Restrict every SQL/listing surface to THIS risk's null-history KRIs.
    risk_kri_ids = set(
        (
            await db_session.execute(
                select(KeyRiskIndicator.id).where(KeyRiskIndicator.risk_id == risk.id)
            )
        )
        .scalars()
        .all()
    )
    # (b) not_submitted FILTER membership == detail-derived not_submitted set.
    assert (monitoring_ids & risk_kri_ids) == expected_not_submitted_ids
    # (a) get_overdue_kris LISTING membership == detail-derived not_submitted set. This is
    # the surface the overdue-unification divergence broke for null-history rows.
    assert (listing_ids & risk_kri_ids) == expected_not_submitted_ids
