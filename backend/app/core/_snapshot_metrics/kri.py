from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.risk import Risk, RiskStatus


async def count_kri_breaches(db: AsyncSession, department_ids: list[int] | None) -> int:
    query = select(func.count(KeyRiskIndicator.id)).where(
        or_(
            KeyRiskIndicator.current_value < KeyRiskIndicator.lower_limit,
            KeyRiskIndicator.current_value > KeyRiskIndicator.upper_limit,
        )
    )
    if department_ids is not None:
        query = query.join(Risk, KeyRiskIndicator.risk_id == Risk.id).where(Risk.department_id.in_(department_ids))
    return await db.scalar(query) or 0


async def calculate_kri_health(db: AsyncSession, department_ids: list[int] | None) -> int:
    total_kris_query = select(func.count(KeyRiskIndicator.id))
    kris_within_query = select(func.count(KeyRiskIndicator.id)).where(
        KeyRiskIndicator.current_value >= KeyRiskIndicator.lower_limit,
        KeyRiskIndicator.current_value <= KeyRiskIndicator.upper_limit,
    )
    if department_ids is not None:
        total_kris_query = total_kris_query.join(Risk, KeyRiskIndicator.risk_id == Risk.id).where(
            Risk.department_id.in_(department_ids)
        )
        kris_within_query = kris_within_query.join(Risk, KeyRiskIndicator.risk_id == Risk.id).where(
            Risk.department_id.in_(department_ids)
        )
    total_kris = await db.scalar(total_kris_query) or 1
    kris_within = await db.scalar(kris_within_query)
    return round((kris_within or 0) / total_kris * 100)


async def count_overdue_kris(db: AsyncSession, department_ids: list[int] | None) -> int:
    query = select(func.count(KeyRiskIndicator.id)).where(
        KeyRiskIndicator.last_period_end.isnot(None),
        func.date(KeyRiskIndicator.last_period_end) + 15 < func.current_date(),
    )
    if department_ids is not None:
        query = query.join(Risk, KeyRiskIndicator.risk_id == Risk.id).where(Risk.department_id.in_(department_ids))
    return await db.scalar(query) or 0


async def count_risks_without_kri(db: AsyncSession, department_ids: list[int] | None) -> int:
    risks_with_kri = select(KeyRiskIndicator.risk_id.distinct())
    query = select(func.count(Risk.id)).where(
        Risk.status == RiskStatus.active.value,
        Risk.id.notin_(risks_with_kri),
    )
    if department_ids is not None:
        query = query.where(Risk.department_id.in_(department_ids))
    return await db.scalar(query) or 0
