"""Behavior spec: never-reported KRIs are classified IDENTICALLY by the monitoring
``not_submitted`` LIST FILTER and the DETAIL classifier (regression for the
overdue-unification divergence).

A never-reported KRI (``last_period_end IS NULL``) keeps a TODAY-anchored new-vs-overdue
window: while its first required period is still inside its reporting grace window it is
``new``; only once that period's ``due_date`` (period end + ``REPORTING_GRACE_DAYS``) has
STRICTLY passed does it become ``not_submitted``. This is the single
``app.services._kri_history.periods.never_reported_is_overdue`` SSOT, shared by:

  * DETAIL  -> ``derive_kri_monitoring_snapshot`` (null-history branch)
  * FILTER  -> ``apply_kri_monitoring_status_filter`` (monitoring_status == not_submitted)

RED (before the fix): the ``not_submitted`` SQL filter matched ``last_period_end IS NULL``
UNCONDITIONALLY, so a freshly-created monthly KRI (DETAIL == ``new`` on 2026-07-06) was
ALSO returned by the ``not_submitted`` filter -- filter disagreed with detail, and the same
KRI landed in both the ``new`` and ``not_submitted`` result sets. GREEN: the filter gates
the null-history clause on ``never_reported_is_overdue`` and agrees with the detail rule.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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

# Pinned "today" so calendar-aligned periods are deterministic. On this date a
# never-reported MONTHLY KRI's latest closed period is June (ends 2026-06-30, due
# 2026-07-15, still in grace) -> DETAIL == new. A never-reported ANNUALLY KRI's latest
# closed period is 2025 (ends 2025-12-31, due 2026-01-15, strictly past due) -> not_submitted.
TODAY = date(2026, 7, 6)
WARNING_MARGIN = 0.10


def _never_reported_facts(frequency: str) -> KRIMonitoringFacts:
    """Facts for a never-reported, in-range (non-breaching) KRI."""
    return KRIMonitoringFacts(
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        breach_status="within",
        frequency=frequency,
        last_period_end=None,
        has_submission_history=False,
    )


def _detail_status(frequency: str, *, today: date = TODAY) -> KRIMonitoringStatus:
    return derive_kri_monitoring_snapshot(
        _never_reported_facts(frequency),
        KRIMonitoringConfig(warning_upper_margin_ratio=WARNING_MARGIN),
        today=today,
    ).monitoring_status


async def _monitoring_not_submitted_ids(db: AsyncSession, *, today: date) -> set[int]:
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
    """KRI ids the get_overdue_kris listing surface reports (dict rows -> id set)."""
    rows = await queries.get_overdue_kris(db)
    return {row["kri_id"] for row in rows}


# ---------------------------------------------------------------------------
# Case 1: never-reported MONTHLY KRI whose first required report is NOT yet past due.
# DETAIL == new, and the not_submitted FILTER must NOT return it.
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_never_reported_monthly_in_grace_is_new_and_excluded_from_not_submitted(
    db_session: AsyncSession, test_department, test_user
):
    # DETAIL: still inside the initial grace window -> new.
    assert _detail_status("monthly") == KRIMonitoringStatus.new

    risk = await create_test_risk(
        db_session, department_id=test_department.id, owner_id=test_user.id, risk_id_code="R-NR-M"
    )
    kri = await create_test_kri(
        db_session,
        risk_id=risk.id,
        metric_name="Never-reported monthly (in grace)",
        overrides={"frequency": "monthly", "last_period_end": None},
    )

    # FILTER must AGREE with the detail classifier: not_submitted must exclude it.
    assert kri.id not in await _monitoring_not_submitted_ids(db_session, today=TODAY)


# ---------------------------------------------------------------------------
# Case 2: never-reported ANNUALLY KRI whose first required report IS past due.
# DETAIL == not_submitted, and the not_submitted FILTER must return it.
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_never_reported_annual_past_due_is_not_submitted_on_both_surfaces(
    db_session: AsyncSession, test_department, test_user
):
    # DETAIL: 2025 annual period (due 2026-01-15) has strictly passed -> not_submitted.
    assert _detail_status("annually") == KRIMonitoringStatus.not_submitted

    risk = await create_test_risk(
        db_session, department_id=test_department.id, owner_id=test_user.id, risk_id_code="R-NR-A"
    )
    kri = await create_test_kri(
        db_session,
        risk_id=risk.id,
        metric_name="Never-reported annual (past due)",
        overrides={"frequency": "annually", "last_period_end": None},
    )

    # FILTER must AGREE: not_submitted includes it.
    assert kri.id in await _monitoring_not_submitted_ids(db_session, today=TODAY)


# ---------------------------------------------------------------------------
# Case 3 (P1 regression): the get_overdue_kris LISTING surface must gate a
# never-reported KRI through the SAME never_reported_is_overdue SSOT as the detail
# classifier and the not_submitted filter. Before the fix, its null-history guard
# only skipped up-to-date REPORTED rows, so EVERY never-reported KRI fell through
# and was appended -- daily/weekly/monthly/quarterly wrongly appeared overdue while
# the detail classifier and not_submitted filter (both fixed) classify them as `new`.
#
# On TODAY = 2026-07-06 the ONLY never-reported KRI whose first required period is
# strictly past due is the annual one (2025 period, due 2026-01-15); the other four
# are still inside their initial grace window -> must NOT appear in the listing.
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_never_reported_overdue_listing_only_includes_past_due_frequencies(
    db_session: AsyncSession, test_department, test_user, monkeypatch
):
    monkeypatch.setattr(clock, "today", lambda: TODAY)
    risk = await create_test_risk(
        db_session, department_id=test_department.id, owner_id=test_user.id, risk_id_code="R-NR-LIST"
    )
    ids_by_freq: dict[str, int] = {}
    for frequency in ("daily", "weekly", "monthly", "quarterly", "annually"):
        kri = await create_test_kri(
            db_session,
            risk_id=risk.id,
            metric_name=f"Never-reported {frequency}",
            overrides={"frequency": frequency, "last_period_end": None},
        )
        ids_by_freq[frequency] = kri.id

    listing_ids = await _overdue_listing_ids(db_session)
    this_risk_ids = set(ids_by_freq.values())

    # Only the annual KRI (first required period past due) is overdue; the daily/weekly/
    # monthly/quarterly KRIs are still `new` inside their initial grace window.
    assert (listing_ids & this_risk_ids) == {ids_by_freq["annually"]}
