from __future__ import annotations

from datetime import timedelta
from typing import Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.kri_history import KRIValueHistory

from . import clock
from .periods import (
    due_date,
    never_reported_is_overdue,
    overdue_required_period_end,
    period_bounds_for_date,
    reporting_owner_id,
)


def _int_sort_value(row: dict[str, object], key: str) -> int:
    value = row.get(key)
    return value if isinstance(value, int) else 0


def _reporting_owner_name(kri: KeyRiskIndicator) -> str | None:
    if kri.reporting_owner:
        return kri.reporting_owner.name
    if kri.risk and hasattr(kri.risk, "owner") and kri.risk.owner:
        return kri.risk.owner.name
    return None


def _build_kri_period_due_row(
    kri: KeyRiskIndicator,
    *,
    period_end: clock.date,
    due: clock.date,
    metric_key: str,
    metric_value: int,
) -> dict[str, object]:
    return {
        "kri_id": kri.id,
        "metric_name": kri.metric_name,
        "frequency": kri.frequency,
        "period_end": period_end.isoformat(),
        "due_date": due.isoformat(),
        metric_key: metric_value,
        "reporting_owner_id": reporting_owner_id(kri),
        "reporting_owner_name": _reporting_owner_name(kri),
        "risk_id": kri.risk_id,
        "department_id": kri.risk.department_id if kri.risk else None,
    }


async def get_history(
    db: AsyncSession,
    kri_id: int,
    from_date: Optional[clock.date] = None,
    to_date: Optional[clock.date] = None,
    page: int = 1,
    size: int = 20,
    offset: int | None = None,
    limit: int | None = None,
    sort_by: str = "recorded_at",
    sort_direction: str = "desc",
) -> Tuple[list[KRIValueHistory], int]:
    """
    Get paginated history for a KRI.

    Args:
        db: Database session
        kri_id: ID of the KRI
        from_date: Optional start date filter
        to_date: Optional end date filter
        page: Page number (1-indexed)
        size: Page size

    Returns:
        Tuple of (history entries, total count)
    """
    from sqlalchemy import func

    query = (
        select(KRIValueHistory)
        .where(KRIValueHistory.kri_id == kri_id)
        .options(selectinload(KRIValueHistory.recorded_by))
    )

    if from_date:
        query = query.where(KRIValueHistory.period_end >= from_date)
    if to_date:
        query = query.where(KRIValueHistory.period_end <= to_date)

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Paginate and order deterministically.
    effective_limit = limit if limit is not None else size
    effective_offset = offset if offset is not None else (page - 1) * effective_limit

    if sort_by == "period":
        sort_columns = [KRIValueHistory.period_end, KRIValueHistory.recorded_at, KRIValueHistory.id]
    else:
        sort_columns = [KRIValueHistory.recorded_at, KRIValueHistory.id]
    if sort_direction == "asc":
        query = query.order_by(*(column.asc() for column in sort_columns))
    else:
        query = query.order_by(*(column.desc() for column in sort_columns))
    query = query.offset(effective_offset).limit(effective_limit)

    result = await db.execute(query)
    entries = result.scalars().all()

    return list(entries), total


async def get_overdue_kris(
    db: AsyncSession,
) -> list[dict]:
    """
    Get all KRIs that are overdue for reporting.

    Returns list of dicts with KRI info, due_date, and days_overdue.
    """
    today = clock.today()

    # Fetch all ACTIVE (non-archived) KRIs with their risk relationships
    stmt = (
        select(KeyRiskIndicator)
        .where(KeyRiskIndicator.is_archived.is_(False))
        .options(
            selectinload(KeyRiskIndicator.risk),
            selectinload(KeyRiskIndicator.reporting_owner),
        )
    )
    result = await db.execute(stmt)
    kris = result.scalars().all()

    overdue = []
    for kri in kris:
        # Overdue anchor is the latest STRICTLY past-due period (ADR-012 SSOT), shared
        # with the snapshot metrics and the monitoring not_submitted filter. This flags
        # a KRI that missed an EARLIER period even while the most recent period is still
        # inside its grace window; the previous latest-closed-at-today anchor + grace gate
        # under-reported that case. overdue_required_period_end always returns a period
        # whose due date is strictly before today, so no separate today > due gate is needed.
        period_end = overdue_required_period_end(today, kri.frequency)
        due = due_date(period_end)

        if kri.last_period_end is not None:
            # HAS-REPORTED: overdue iff the last report predates the latest strictly
            # past-due period end (backtracking anchor). Behavior unchanged.
            if kri.last_period_end >= period_end:
                continue
        else:
            # NEVER-REPORTED (last_period_end IS NULL): gate through the shared
            # never_reported_is_overdue SSOT so this listing agrees with the DETAIL
            # classifier and the not_submitted list filter. A never-reported KRI stays
            # `new` inside its initial (today-anchored) grace window and is overdue ONLY
            # once its first required period is strictly past due.
            if not never_reported_is_overdue(today, kri.frequency):
                continue

        days_overdue = (today - due).days
        overdue.append(
            _build_kri_period_due_row(
                kri,
                period_end=period_end,
                due=due,
                metric_key="days_overdue",
                metric_value=days_overdue,
            )
        )

    # Sort by days overdue descending
    overdue.sort(key=lambda x: _int_sort_value(x, "days_overdue"), reverse=True)
    return overdue


async def get_due_soon_kris(
    db: AsyncSession,
) -> list[dict]:
    """
    Get all KRIs that are due soon (within 7 days before period end).

    Returns list of dicts with KRI info, period_end, due_date, and days_until_due.
    """
    today = clock.today()
    advance_days = 7  # 7 days before period end

    # Fetch all ACTIVE (non-archived) KRIs with their risk relationships
    stmt = (
        select(KeyRiskIndicator)
        .where(KeyRiskIndicator.is_archived.is_(False))
        .options(
            selectinload(KeyRiskIndicator.risk),
            selectinload(KeyRiskIndicator.reporting_owner),
        )
    )
    result = await db.execute(stmt)
    kris = result.scalars().all()

    due_soon = []
    for kri in kris:
        # Get current period (not closed period)
        _, period_end = period_bounds_for_date(today, kri.frequency)

        # Check if already reported for this period
        if kri.last_period_end and kri.last_period_end >= period_end:
            continue  # Already reported

        # Check if within 7 days before period end
        advance_date = period_end - timedelta(days=advance_days)
        if today >= advance_date and today < period_end:
            days_until_due = (period_end - today).days
            due = due_date(period_end)
            due_soon.append(
                _build_kri_period_due_row(
                    kri,
                    period_end=period_end,
                    due=due,
                    metric_key="days_until_due",
                    metric_value=days_until_due,
                )
            )

    # Sort by days until due ascending (most urgent first)
    due_soon.sort(key=lambda x: _int_sort_value(x, "days_until_due"))
    return due_soon
