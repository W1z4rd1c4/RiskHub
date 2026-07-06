from __future__ import annotations

from datetime import timedelta
from typing import Optional, Tuple

from app.models.key_risk_indicator import KeyRiskIndicator, KRIFrequency

from . import clock
from .constants import REPORTING_GRACE_DAYS


def _end_of_month(year: int, month: int) -> clock.date:
    """Get the last day of a given month."""
    if month == 12:
        next_month = clock.date(year + 1, 1, 1)
    else:
        next_month = clock.date(year, month + 1, 1)
    return next_month - timedelta(days=1)


def period_bounds_for_date(target_date: clock.date, frequency: str) -> Tuple[clock.date, clock.date]:
    """Return calendar-aligned period start/end for a date and frequency."""
    if frequency == KRIFrequency.daily.value:
        return target_date, target_date
    if frequency == KRIFrequency.weekly.value:
        period_start = target_date - timedelta(days=target_date.isoweekday() - 1)
        period_end = period_start + timedelta(days=6)
        return period_start, period_end
    if frequency == KRIFrequency.monthly.value:
        period_start = clock.date(target_date.year, target_date.month, 1)
        period_end = _end_of_month(target_date.year, target_date.month)
        return period_start, period_end
    if frequency == KRIFrequency.quarterly.value:
        quarter_index = (target_date.month - 1) // 3
        start_month = (quarter_index * 3) + 1
        period_start = clock.date(target_date.year, start_month, 1)
        period_end = _end_of_month(target_date.year, start_month + 2)
        return period_start, period_end
    if frequency == KRIFrequency.annually.value:
        return clock.date(target_date.year, 1, 1), clock.date(target_date.year, 12, 31)

    # Default to quarterly for unknown values
    quarter_index = (target_date.month - 1) // 3
    start_month = (quarter_index * 3) + 1
    period_start = clock.date(target_date.year, start_month, 1)
    period_end = _end_of_month(target_date.year, start_month + 2)
    return period_start, period_end


def latest_closed_period_for_date(target_date: clock.date, frequency: str) -> Tuple[clock.date, clock.date]:
    """Return the most recent closed period (end <= target_date)."""
    period_start, period_end = period_bounds_for_date(target_date, frequency)
    if period_end <= target_date:
        return period_start, period_end
    previous_date = period_start - timedelta(days=1)
    return period_bounds_for_date(previous_date, frequency)


def overdue_required_period_end(as_of: clock.date, frequency: str) -> clock.date:
    """End of the latest period whose ``due_date`` has STRICTLY passed as of ``as_of``.

    This is the single overdue/``not_submitted`` anchor shared by the KRI snapshot
    metrics, the monitoring-status list filter, and the overdue-KRI listing (ADR-012).
    A KRI is overdue when it has not reported for this period.

    ``due_date(pe) = pe + REPORTING_GRACE_DAYS``. The period is strictly past due when
    ``due_date(pe) < as_of`` i.e. ``pe <= as_of - REPORTING_GRACE_DAYS - 1``, so the
    answer is the latest closed period as of that back-dated anchor. Back-dating (rather
    than anchoring at ``as_of`` and then re-checking the grace window) is what makes a KRI
    that missed an *earlier* period read as overdue even while the most recent period is
    still inside its grace window -- the latest-closed-period-at-``as_of`` rule under-reports
    that case.
    """
    anchor = as_of - timedelta(days=REPORTING_GRACE_DAYS + 1)
    _, required_period_end = latest_closed_period_for_date(anchor, frequency)
    return required_period_end


def never_reported_is_overdue(as_of: clock.date, frequency: str) -> bool:
    """Whether a never-reported KRI (``last_period_end IS NULL``) is overdue as of ``as_of``.

    Single source of truth for the null-history overdue/``not_submitted`` decision, shared
    by the DETAIL classifier (``derive_kri_monitoring_snapshot``) and the monitoring
    ``not_submitted`` LIST FILTER (``_kri_frequency_status_clauses``) so the two cannot
    diverge for null-history rows.

    A never-reported KRI keeps a today-anchored new-vs-overdue window (distinct from the
    backtracking anchor used once it HAS reported): it is overdue only once the latest
    closed period's own ``due_date`` has strictly passed, i.e. ``as_of > due_date(pe)``
    where ``pe`` is ``latest_closed_period_for_date(as_of, frequency)``. Before that it is
    still ``new`` inside its initial grace window.
    """
    _, required_period_end = latest_closed_period_for_date(as_of, frequency)
    return as_of > due_date(required_period_end)


def is_period_end_boundary(period_end: clock.date, frequency: str) -> bool:
    """Validate that the given date is a calendar-aligned period end."""
    _, expected_end = period_bounds_for_date(period_end, frequency)
    return expected_end == period_end


def frequency_to_days(frequency: str) -> int:
    """Convert KRI frequency to number of days in a period."""
    mapping = {
        KRIFrequency.daily.value: 1,
        KRIFrequency.weekly.value: 7,
        KRIFrequency.monthly.value: 30,
        KRIFrequency.quarterly.value: 90,
        KRIFrequency.annually.value: 365,
    }
    return mapping.get(frequency, 90)  # Default to quarterly


def current_period(kri: KeyRiskIndicator, as_of: Optional[clock.date] = None) -> Tuple[clock.date, clock.date]:
    """
    Calculate the current reporting period for a KRI.

    Returns (period_start, period_end) aligned to calendar periods.
    """
    target_date = as_of or clock.today()
    return period_bounds_for_date(target_date, kri.frequency)


def due_date(period_end: clock.date) -> clock.date:
    """
    Calculate the due date for a period.

    Due date is period_end + 15 days (grace window).
    """
    return period_end + timedelta(days=REPORTING_GRACE_DAYS)


def reporting_owner_id(kri: KeyRiskIndicator) -> Optional[int]:
    """
    Get the reporting owner for a KRI.

    Falls back to risk owner if no explicit reporting owner is set.
    """
    if kri.reporting_owner_id:
        return kri.reporting_owner_id
    if kri.risk and kri.risk.owner_id:
        return kri.risk.owner_id
    return None


def is_within_reporting_window(period_end: clock.date, as_of: clock.date | None = None) -> bool:
    """Check if we're currently within the reporting window for a period."""
    due = due_date(period_end)
    return (as_of or clock.today()) <= due
