from __future__ import annotations

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_user_department_ids
from app.models import Control, ControlExecution, Department, KeyRiskIndicator, Risk, User
from app.models.control import ControlStatus
from app.models.global_config import ConfigDefaults, get_config_int
from app.schemas.dashboard import DepartmentMetrics


def _count_map(rows) -> dict[int, int]:
    return {row.department_id: int(row.item_count or 0) for row in rows if row.department_id is not None}


async def load_department_dashboard_metrics(
    *,
    db: AsyncSession,
    current_user: User,
    department_id: int | None,
    include_archived: bool,
) -> list[DepartmentMetrics]:
    dept_ids = get_user_department_ids(current_user)

    active_dept_ids = (
        select(User.department_id).where(and_(User.department_id.isnot(None), User.is_active.is_(True))).distinct()
    )
    dept_query = select(Department).where(or_(Department.is_system.is_(True), Department.id.in_(active_dept_ids)))

    if dept_ids is not None:
        dept_query = dept_query.where(Department.id.in_(dept_ids))
    elif department_id:
        dept_query = dept_query.where(Department.id == department_id)

    departments = list((await db.execute(dept_query)).scalars().all())
    department_ids = [department.id for department in departments]
    if not department_ids:
        return []

    high_threshold = await get_config_int(
        db,
        "high_risk_min_net_score",
        ConfigDefaults.HIGH_RISK_MIN_NET_SCORE,
    )

    control_conditions = [Control.department_id.in_(department_ids)]
    if not include_archived:
        control_conditions.append(Control.live())
    control_counts = _count_map(
        (
            await db.execute(
                select(Control.department_id, func.count(Control.id).label("item_count"))
                .where(and_(*control_conditions))
                .group_by(Control.department_id)
            )
        ).all()
    )

    active_control_counts = _count_map(
        (
            await db.execute(
                select(Control.department_id, func.count(Control.id).label("item_count"))
                .where(
                    Control.department_id.in_(department_ids),
                    Control.status == ControlStatus.active.value,
                    Control.live(),
                )
                .group_by(Control.department_id)
            )
        ).all()
    )

    risk_conditions = [Risk.department_id.in_(department_ids)]
    if not include_archived:
        risk_conditions.append(Risk.live())
    risk_rows = (
        await db.execute(
            select(
                Risk.department_id,
                func.count(Risk.id).label("risk_count"),
                func.sum(case((Risk.net_score >= high_threshold, 1), else_=0)).label("high_risk_count"),
            )
            .where(and_(*risk_conditions))
            .group_by(Risk.department_id)
        )
    ).all()
    risk_counts = {row.department_id: int(row.risk_count or 0) for row in risk_rows if row.department_id is not None}
    high_risk_counts = {
        row.department_id: int(row.high_risk_count or 0) for row in risk_rows if row.department_id is not None
    }

    audited_control_conditions = [Control.department_id.in_(department_ids)]
    if not include_archived:
        audited_control_conditions.append(Control.live())
    audited_control_counts = _count_map(
        (
            await db.execute(
                select(Control.department_id, func.count(Control.id.distinct()).label("item_count"))
                .join(ControlExecution)
                .where(and_(*audited_control_conditions))
                .group_by(Control.department_id)
            )
        ).all()
    )

    breach_condition = or_(
        KeyRiskIndicator.current_value < KeyRiskIndicator.lower_limit,
        KeyRiskIndicator.current_value > KeyRiskIndicator.upper_limit,
    )
    kri_rows = (
        await db.execute(
            select(
                Risk.department_id,
                func.count(KeyRiskIndicator.id.distinct()).label("total_kri_count"),
                func.count(func.distinct(case((breach_condition, KeyRiskIndicator.id)))).label("breaching_kri_count"),
            )
            .select_from(KeyRiskIndicator)
            .join(Risk)
            .where(
                Risk.department_id.in_(department_ids),
                Risk.live(),
                KeyRiskIndicator.is_archived.is_(False),
            )
            .group_by(Risk.department_id)
        )
    ).all()
    total_kri_counts = {
        row.department_id: int(row.total_kri_count or 0) for row in kri_rows if row.department_id is not None
    }
    breaching_kri_counts = {
        row.department_id: int(row.breaching_kri_count or 0) for row in kri_rows if row.department_id is not None
    }

    metrics = []
    for dept in departments:
        control_count = control_counts.get(dept.id, 0)
        active_control_count = active_control_counts.get(dept.id, 0)
        compliance_rate = (active_control_count / control_count) if control_count > 0 else 0.0
        metrics.append(
            DepartmentMetrics(
                department_id=dept.id,
                department_name=dept.name,
                control_count=control_count,
                risk_count=risk_counts.get(dept.id, 0),
                high_risk_count=high_risk_counts.get(dept.id, 0),
                audited_control_count=audited_control_counts.get(dept.id, 0),
                breaching_kri_count=breaching_kri_counts.get(dept.id, 0),
                total_kri_count=total_kri_counts.get(dept.id, 0),
                compliance_rate=round(compliance_rate, 2),
            )
        )

    return metrics
