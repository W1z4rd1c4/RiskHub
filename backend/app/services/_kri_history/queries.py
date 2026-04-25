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
    latest_closed_period_for_date,
    period_bounds_for_date,
    reporting_owner_id,
)


def _int_sort_value(row: dict[str, object], key: str) -> int:
    value = row.get(key)
    return value if isinstance(value, int) else 0


async def get_history(
    db: AsyncSession,
    kri_id: int,
    from_date: Optional[clock.date] = None,
    to_date: Optional[clock.date] = None,
    page: int = 1,
    size: int = 20,
    offset: int | None = None,
    limit: int | None = None,
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

    # Paginate and order by recorded_at desc
    effective_limit = limit if limit is not None else size
    effective_offset = offset if offset is not None else (page - 1) * effective_limit

    query = query.order_by(KRIValueHistory.recorded_at.desc())
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
        _, period_end = latest_closed_period_for_date(today, kri.frequency)
        due = due_date(period_end)

        if today > due:
            # Check if updated since period end
            if kri.last_period_end and kri.last_period_end >= period_end:
                continue  # Already reported for this period

            days_overdue = (today - due).days
            reporting_owner = reporting_owner_id(kri)

            overdue.append(
                {
                    "kri_id": kri.id,
                    "metric_name": kri.metric_name,
                    "frequency": kri.frequency,
                    "period_end": period_end.isoformat(),
                    "due_date": due.isoformat(),
                    "days_overdue": days_overdue,
                    "reporting_owner_id": reporting_owner,
                    "reporting_owner_name": (
                        kri.reporting_owner.name
                        if kri.reporting_owner
                        else (
                            kri.risk.owner.name if kri.risk and hasattr(kri.risk, "owner") and kri.risk.owner else None
                        )
                    ),
                    "risk_id": kri.risk_id,
                    "department_id": kri.risk.department_id if kri.risk else None,
                }
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
            reporting_owner = reporting_owner_id(kri)

            due_soon.append(
                {
                    "kri_id": kri.id,
                    "metric_name": kri.metric_name,
                    "frequency": kri.frequency,
                    "period_end": period_end.isoformat(),
                    "due_date": due.isoformat(),
                    "days_until_due": days_until_due,
                    "reporting_owner_id": reporting_owner,
                    "reporting_owner_name": (
                        kri.reporting_owner.name
                        if kri.reporting_owner
                        else (
                            kri.risk.owner.name if kri.risk and hasattr(kri.risk, "owner") and kri.risk.owner else None
                        )
                    ),
                    "risk_id": kri.risk_id,
                    "department_id": kri.risk.department_id if kri.risk else None,
                }
            )

    # Sort by days until due ascending (most urgent first)
    due_soon.sort(key=lambda x: _int_sort_value(x, "days_until_due"))
    return due_soon
