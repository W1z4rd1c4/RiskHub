"""Behavior spec for the frequency-aware overdue-KRI snapshot count.

app/core/_snapshot_metrics/kri.py::count_overdue_kris is FREQUENCY-AWARE: a KRI
that last reported for ``last_period_end`` owes its next calendar-aligned
reporting period and is overdue once ``today`` passes that period's due date
(period end + ``REPORTING_GRACE_DAYS``), reusing the period-algebra SSOT in
``app.services._kri_history.periods`` (``due_date``, ``period_bounds_for_date``,
governed by ADR-012). So a 20-day-stale weekly KRI is treated DIFFERENTLY from a
20-day-stale annual KRI, and the snapshot overdue count now AGREES with the
``_monitoring_status`` frequency semantics.

NOTE (history): this file previously CHARACTERIZED a bug -- ``count_overdue_kris``
used a flat, frequency-blind ``func.date(last_period_end) + 15 < current_date()``
predicate that, on SQLite (the default test DB), degenerated to an INTEGER-vs-TEXT
comparison and counted EVERY non-NULL ``last_period_end`` (a ``date + int`` no-op),
while doing real flat-+15 arithmetic on Postgres. The ADR-006 rebaseline that made
overdue frequency-aware (ratified) removed that divergence; because the fixed
compute runs in Python, the expectations below are now DIALECT-INVARIANT (a single
assertion per case, no sqlite/postgres branch).
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core._snapshot_metrics.kri import count_overdue_kris
from app.services._kri_history import clock
from tests.backend.pytest.factories import create_test_kri, create_test_risk

# ---------------------------------------------------------------------------
# Frequency-aware overdue: a KRI's overdue-ness depends on its frequency, not a
# flat day window. All expected values below are dialect-invariant (Python-side
# compute over the period SSOT). Staleness-boundary cases pin clock.today to a
# fixed TODAY: under the ADR-012 backtracking anchor a 20-day-stale WEEKLY KRI
# flips overdue-ness with the weekday (overdue Tue-Fri, current Sat-Mon), so a
# live calendar clock would rot the expectations. Same vantage date as
# test_char_kri_overdue_backtracking.py.
# ---------------------------------------------------------------------------
# A fixed "today" (a Monday) so calendar-aligned periods are deterministic.
TODAY = date(2026, 7, 6)
DAYS_STALE = 20  # both KRIs' last_period_end is this many days before TODAY


async def _seed_weekly_and_annual_stale(db: AsyncSession, *, department_id: int, owner_id: int) -> None:
    """One weekly + one annual live KRI, each last reported DAYS_STALE days before TODAY."""
    # last_period_end is derived from the pinned TODAY so the KRIs are exactly
    # DAYS_STALE days stale at the monkeypatched vantage on every run date.
    stale_period_end = TODAY - timedelta(days=DAYS_STALE)

    risk = await create_test_risk(db, department_id=department_id, owner_id=owner_id, risk_id_code="R-OVERDUE-001")
    await create_test_kri(
        db,
        risk_id=risk.id,
        metric_name="Weekly stale",
        overrides={"frequency": "weekly", "last_period_end": stale_period_end},
    )
    await create_test_kri(
        db,
        risk_id=risk.id,
        metric_name="Annual stale",
        overrides={"frequency": "annually", "last_period_end": stale_period_end},
    )


@pytest.mark.asyncio
async def test_snapshot_overdue_is_frequency_aware_for_20_day_stale_kris(
    db_session: AsyncSession, test_department, test_user, monkeypatch
):
    """Neither a weekly nor an annual KRI 20 days stale is overdue at TODAY.

    At TODAY (Mon 2026-07-06) the latest weekly period whose due date has
    strictly passed ends 2026-06-14, and the weekly KRI's last_period_end
    2026-06-16 is not before it (the week ending 2026-06-21 is due exactly
    TODAY, so not yet strictly past). The annual KRI owes only 2025 ->
    trivially current. -> 0. (Under the old flat/SQLite-no-op predicate BOTH
    counted -> 2.) Pinned because one weekday later the backtracking anchor
    tips the weekly KRI overdue.
    """
    monkeypatch.setattr(clock, "today", lambda: TODAY)
    await _seed_weekly_and_annual_stale(db_session, department_id=test_department.id, owner_id=test_user.id)

    assert await count_overdue_kris(db_session, None) == 0
    assert await count_overdue_kris(db_session, [test_department.id]) == 0


@pytest.mark.asyncio
async def test_snapshot_overdue_ignores_a_5_day_fresh_weekly_kri(
    db_session: AsyncSession, test_department, test_user
):
    """A 5-day-fresh weekly KRI is well within its reporting window -> NOT overdue.

    Dialect-invariant now: the Python period compute yields 0 on both SQLite and
    Postgres. (The old predicate wrongly counted it on SQLite -> 1 while Postgres
    correctly returned 0; that divergence is gone.)
    """
    fresh_period_end = (datetime.now(UTC) - timedelta(days=5)).date()
    risk = await create_test_risk(
        db_session, department_id=test_department.id, owner_id=test_user.id, risk_id_code="R-OVERDUE-FRESH"
    )
    await create_test_kri(
        db_session,
        risk_id=risk.id,
        metric_name="Weekly fresh",
        overrides={"frequency": "weekly", "last_period_end": fresh_period_end},
    )

    assert await count_overdue_kris(db_session, None) == 0


@pytest.mark.asyncio
async def test_snapshot_overdue_ignores_null_last_period_end(
    db_session: AsyncSession, test_department, test_user
):
    """A never-reported KRI (last_period_end IS NULL) is NOT overdue.

    count_overdue_kris requires last_period_end IS NOT NULL, so brand-new KRIs are
    excluded regardless of frequency.
    """
    risk = await create_test_risk(
        db_session, department_id=test_department.id, owner_id=test_user.id, risk_id_code="R-OVERDUE-NULL"
    )
    await create_test_kri(
        db_session,
        risk_id=risk.id,
        metric_name="Never reported",
        overrides={"frequency": "weekly", "last_period_end": None},
    )

    assert await count_overdue_kris(db_session, None) == 0


# ---------------------------------------------------------------------------
# Frequency-aware, cross-DB-correct behavior: overdue-ness DIFFERS by frequency.
# ---------------------------------------------------------------------------
WEEKLY_OVERDUE_STALE_DAYS = 30  # >= 7-day period + 15-day grace + margin -> unambiguously overdue
WEEKLY_WITHIN_GRACE_DAYS = 5  # well inside the weekly reporting window -> NOT overdue
ANNUAL_NOT_OVERDUE_STALE_DAYS = 20  # trivially inside an annual cadence -> NOT overdue


async def _seed_frequency_mix(db: AsyncSession, *, department_id: int, owner_id: int) -> None:
    """Three live KRIs whose overdue-ness DIFFERS by frequency under the correct rule.

    Only the clearly-stale weekly KRI is overdue; the annual (20 days stale) and the
    within-grace weekly (5 days stale) are not. Under the old SQLite no-op ALL THREE
    counted (any non-null last_period_end), which is exactly what this test now rules out.
    Staleness is measured back from the pinned TODAY.
    """
    risk = await create_test_risk(db, department_id=department_id, owner_id=owner_id, risk_id_code="R-OVERDUE-FREQ")
    await create_test_kri(
        db,
        risk_id=risk.id,
        metric_name="Weekly overdue",
        overrides={
            "frequency": "weekly",
            "last_period_end": TODAY - timedelta(days=WEEKLY_OVERDUE_STALE_DAYS),
        },
    )
    await create_test_kri(
        db,
        risk_id=risk.id,
        metric_name="Annual not overdue",
        overrides={
            "frequency": "annually",
            "last_period_end": TODAY - timedelta(days=ANNUAL_NOT_OVERDUE_STALE_DAYS),
        },
    )
    await create_test_kri(
        db,
        risk_id=risk.id,
        metric_name="Weekly within grace",
        overrides={
            "frequency": "weekly",
            "last_period_end": TODAY - timedelta(days=WEEKLY_WITHIN_GRACE_DAYS),
        },
    )


@pytest.mark.asyncio
async def test_frequency_aware_overdue_is_portable(db_session: AsyncSession, test_department, test_user, monkeypatch):
    """Overdue is frequency-aware and correct on SQLite (no flat +15 no-op).

    Semantics at the pinned TODAY (reusing app.services._kri_history period algebra):
      - weekly KRI 30 days stale  -> OVERDUE (last 2026-06-06 < required 2026-06-14)
      - annual KRI 20 days stale  -> NOT overdue
      - weekly KRI  5 days stale  -> NOT overdue (within grace)
    So exactly ONE of the three seeded KRIs is overdue, on either backend.
    (Pinned: on a live clock the annual case reads overdue every Jan 17-19,
    when the prior-year period end becomes required while the KRI's report
    still predates it.)
    """
    monkeypatch.setattr(clock, "today", lambda: TODAY)
    await _seed_frequency_mix(db_session, department_id=test_department.id, owner_id=test_user.id)

    assert await count_overdue_kris(db_session, None) == 1
    assert await count_overdue_kris(db_session, [test_department.id]) == 1


@pytest.mark.asyncio
async def test_quarterly_kri_missing_a_closed_period_is_overdue(
    db_session: AsyncSession, test_department, test_user, monkeypatch
):
    """Regression: a KRI that has NOT reported for a fully closed, past-due period is overdue.

    A QUARTERLY KRI whose last reported period ended 2026-02-15, evaluated on
    2026-04-20, has NOT reported for Q1 (ends 2026-03-31, due 2026-04-15). Q1's
    due date is past, so the KRI is overdue -> counted. The earlier
    normalize-to-next-period rule wrongly rounded 2026-02-15 UP to the Q1 end
    (as if Q1 were reported) and reported NOT overdue until Q2's due date. The
    fix compares against the latest period whose due date has strictly passed,
    reusing the ``_kri_history`` period SSOT.
    """
    monkeypatch.setattr(clock, "today", lambda: date(2026, 4, 20))
    risk = await create_test_risk(
        db_session, department_id=test_department.id, owner_id=test_user.id, risk_id_code="R-OVERDUE-QPART"
    )
    await create_test_kri(
        db_session,
        risk_id=risk.id,
        metric_name="Quarterly missed Q1",
        overrides={"frequency": "quarterly", "last_period_end": date(2026, 2, 15)},
    )

    assert await count_overdue_kris(db_session, None) == 1
    assert await count_overdue_kris(db_session, [test_department.id]) == 1
