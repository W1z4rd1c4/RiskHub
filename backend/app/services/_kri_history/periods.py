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


def is_within_reporting_window(period_end: clock.date) -> bool:
    """Check if we're currently within the reporting window for a period."""
    due = due_date(period_end)
    return clock.today() <= due
