from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import coerce_utc, utc_now
from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.kri_history import KRIValueHistory

from . import clock
from .logging import logger
from .periods import (
    due_date,
    is_period_end_boundary,
    is_within_reporting_window,
    latest_closed_period_for_date,
    period_bounds_for_date,
)


class DuplicateKRIPeriodError(ValueError):
    """Raised when a KRI already has a value recorded for the selected period."""


async def record_value(
    db: AsyncSession,
    kri: KeyRiskIndicator,
    value: float,
    recorded_by_id: Optional[int] = None,
    recorded_at: Optional[datetime] = None,
    period_end: Optional[clock.date] = None,
    is_privileged: bool = False,
    allow_open_period: bool = False,
) -> KRIValueHistory:
    """
    Record a new KRI value and create a history entry.

    Args:
        db: Database session
        kri: The KRI to record value for
        value: The value to record
        recorded_by_id: ID of user recording the value
        recorded_at: Timestamp of recording (defaults to now)
        period_end: Period end date (for backdating by privileged users)
        is_privileged: Whether user can backdate outside current window
        allow_open_period: Whether to allow recording for current open period
                          (used when applying approved submissions)

    Returns:
        Created KRIValueHistory entry

    Raises:
        ValueError: If non-privileged user tries to record outside window
    """
    now = utc_now()
    today = clock.today()

    # Determine period (default to latest closed period)
    latest_start, latest_end = latest_closed_period_for_date(today, kri.frequency)
    # Get current (possibly open) period for allow_open_period check
    current_start, current_end = period_bounds_for_date(today, kri.frequency)

    if period_end is None:
        period_end = latest_end
        period_start = latest_start
    else:
        # Check if period_end is in the future
        if period_end > today:
            # Allow only if it's exactly the current open period end AND allow_open_period is enabled
            if allow_open_period and is_privileged and period_end == current_end:
                period_start = current_start
            else:
                raise ValueError("Cannot record a future period")
        else:
            if not is_period_end_boundary(period_end, kri.frequency):
                raise ValueError("period_end must align to a calendar period boundary")
            period_start, _ = period_bounds_for_date(period_end, kri.frequency)

    existing_entry_id = await db.scalar(
        select(KRIValueHistory.id)
        .where(
            KRIValueHistory.kri_id == kri.id,
            KRIValueHistory.period_end == period_end,
        )
        .limit(1)
    )
    if existing_entry_id is not None:
        raise DuplicateKRIPeriodError(f"KRI value already recorded for period ending {period_end}")

    if not is_privileged and period_end < latest_end:
        raise ValueError("Non-privileged users cannot backdate to older periods")

    # Non-privileged users must be within window even for current period
    if not is_privileged and not is_within_reporting_window(period_end):
        raise ValueError(f"Reporting window closed. Due date was {due_date(period_end)}")

    # Calculate breach status
    if value < kri.lower_limit:
        breach_status = "below"
    elif value > kri.upper_limit:
        breach_status = "above"
    else:
        breach_status = "within"

    history_recorded_at = coerce_utc(recorded_at) or now

    # Create history entry
    history_entry = KRIValueHistory(
        kri_id=kri.id,
        period_start=period_start,
        period_end=period_end,
        recorded_at=history_recorded_at,
        recorded_by_id=recorded_by_id,
        value=value,
        lower_limit=kri.lower_limit,
        upper_limit=kri.upper_limit,
        unit=kri.unit,
        breach_status=breach_status,
    )
    db.add(history_entry)

    # Update KRI current value and period tracking
    should_update_current = kri.last_period_end is None or period_end >= kri.last_period_end
    if should_update_current:
        kri.current_value = value
        kri.last_period_end = period_end
        kri.last_reported_at = history_recorded_at

    await db.flush()
    logger.info(f"Recorded KRI {kri.id} value {value} for period {period_start} to {period_end}")

    return history_entry
