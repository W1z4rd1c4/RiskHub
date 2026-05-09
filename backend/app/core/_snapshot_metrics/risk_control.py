from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.risk import ControlRiskLink, Risk, RiskStatus


async def count_priority_risks(db: AsyncSession, department_ids: list[int] | None) -> int:
    conditions = [
        Risk.is_priority.is_(True),
        Risk.live(),
    ]
    if department_ids is not None:
        conditions.append(Risk.department_id.in_(department_ids))
    return await db.scalar(select(func.count(Risk.id)).where(*conditions)) or 0


async def calculate_control_coverage(db: AsyncSession, department_ids: list[int] | None) -> int:
    total_active_risk_conditions = [Risk.status == RiskStatus.active.value, Risk.live()]
    if department_ids is not None:
        total_active_risk_conditions.append(Risk.department_id.in_(department_ids))
    total_active_risks = await db.scalar(select(func.count(Risk.id)).where(*total_active_risk_conditions)) or 1

    risks_with_controls_query = (
        select(func.count(Risk.id.distinct()))
        .select_from(Risk)
        .join(ControlRiskLink, ControlRiskLink.risk_id == Risk.id)
        .where(Risk.status == RiskStatus.active.value, Risk.live())
    )
    if department_ids is not None:
        risks_with_controls_query = risks_with_controls_query.where(Risk.department_id.in_(department_ids))
    risks_with_controls = await db.scalar(risks_with_controls_query)
    return round((risks_with_controls or 0) / total_active_risks * 100)


async def count_active_risks(db: AsyncSession, department_ids: list[int] | None) -> int:
    conditions = [Risk.status == RiskStatus.active.value, Risk.live()]
    if department_ids is not None:
        conditions.append(Risk.department_id.in_(department_ids))
    return await db.scalar(select(func.count(Risk.id)).where(*conditions)) or 0
