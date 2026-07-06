from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.key_risk_indicator import KeyRiskIndicator, kri_breach_condition
from app.models.risk import Risk, RiskStatus
from app.services._kri_history import clock
from app.services._kri_history.periods import overdue_required_period_end


def _live_kri_count_query(department_ids: list[int] | None) -> Select:
    """Count query over live KRIs of live risks; snapshots must never include archived rows."""
    query = (
        select(func.count(KeyRiskIndicator.id))
        .join(Risk, KeyRiskIndicator.risk_id == Risk.id)
        .where(KeyRiskIndicator.live(), Risk.live())
    )
    if department_ids is not None:
        query = query.where(Risk.department_id.in_(department_ids))
    return query


async def count_kri_breaches(db: AsyncSession, department_ids: list[int] | None) -> int:
    query = _live_kri_count_query(department_ids).where(kri_breach_condition())
    return await db.scalar(query) or 0


async def calculate_kri_health(db: AsyncSession, department_ids: list[int] | None) -> int:
    total_kris_query = _live_kri_count_query(department_ids)
    kris_within_query = _live_kri_count_query(department_ids).where(
        KeyRiskIndicator.current_value >= KeyRiskIndicator.lower_limit,
        KeyRiskIndicator.current_value <= KeyRiskIndicator.upper_limit,
    )
    total_kris = await db.scalar(total_kris_query) or 0
    if total_kris == 0:
        # No measurable KRIs is vacuously healthy; 0 would read as all-breaching.
        return 100
    kris_within = await db.scalar(kris_within_query)
    return round((kris_within or 0) / total_kris * 100)


def _is_overdue(frequency: str, last_period_end: clock.date, *, today: clock.date) -> bool:
    """Frequency-aware overdue test, portable across SQLite and Postgres.

    Delegates the anchor to the ``_kri_history`` period-algebra SSOT
    ``overdue_required_period_end`` (ADR-012), the single definition now shared by
    the ``_monitoring_status`` ``not_submitted`` list filter and ``get_overdue_kris``.
    A KRI is overdue when it has not reported for the most recent calendar-aligned
    period whose ``due_date`` (period end + ``REPORTING_GRACE_DAYS``) has already
    passed; the SSOT returns that *required* period end and the KRI is overdue iff
    ``last_period_end`` predates it.

    The earlier rule normalized ``last_period_end`` UP to its containing period end
    and checked the *next* period, which treated a partially-reported cadence as if
    the containing period had been reported -- so a quarterly KRI last reporting
    mid-Q1 read as NOT overdue for Q1 even after Q1's due date passed. Frequency-blind
    flat windows likewise treated a 20-day-stale weekly and annual KRI identically;
    this does neither. Computed in Python so the result matches ``_monitoring_status``
    on either dialect, rather than the old ``date + int`` SQL that was a no-op on SQLite.
    """
    required_period_end = overdue_required_period_end(today, frequency)
    return last_period_end < required_period_end


async def count_overdue_kris(db: AsyncSession, department_ids: list[int] | None) -> int:
    # Load live KRIs of live risks (respecting department scoping + archive/parent
    # exclusion) that have reported at least once, then decide overdue-ness per KRI
    # in Python via the period SSOT -- portable and frequency-aware.
    query = (
        select(KeyRiskIndicator.frequency, KeyRiskIndicator.last_period_end)
        .join(Risk, KeyRiskIndicator.risk_id == Risk.id)
        .where(
            KeyRiskIndicator.live(),
            Risk.live(),
            KeyRiskIndicator.last_period_end.isnot(None),
        )
    )
    if department_ids is not None:
        query = query.where(Risk.department_id.in_(department_ids))

    today = clock.today()
    rows = (await db.execute(query)).all()
    return sum(1 for frequency, last_period_end in rows if _is_overdue(frequency, last_period_end, today=today))


async def count_risks_without_kri(db: AsyncSession, department_ids: list[int] | None) -> int:
    risks_with_kri = select(KeyRiskIndicator.risk_id.distinct())
    query = select(func.count(Risk.id)).where(
        Risk.status == RiskStatus.active.value,
        Risk.live(),
        Risk.id.notin_(risks_with_kri),
    )
    if department_ids is not None:
        query = query.where(Risk.department_id.in_(department_ids))
    return await db.scalar(query) or 0
