from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_user_department_ids
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Control, ControlExecution, Department, KeyRiskIndicator, Risk, User
from app.models.control import ControlStatus
from app.models.global_config import ConfigDefaults
from app.models.risk import RiskStatus
from app.schemas.dashboard import DepartmentMetrics

router = APIRouter()


@router.get("/departments", response_model=list[DepartmentMetrics])
async def get_department_metrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    department_id: Optional[int] = Query(None, description="Filter to specific department"),
    include_archived: bool = Query(False, description="Include archived items"),
):
    """Get per-department statistics, optionally filtered to a single department."""
    dept_ids = get_user_department_ids(current_user)

    # Get departments (filtered if department_id provided)
    # Only include "active" departments: system departments or those with active users
    active_dept_ids = (
        select(User.department_id).where(and_(User.department_id.isnot(None), User.is_active.is_(True))).distinct()
    )

    dept_query = select(Department).where(or_(Department.is_system.is_(True), Department.id.in_(active_dept_ids)))

    if dept_ids is not None:
        dept_query = dept_query.where(Department.id.in_(dept_ids))
    elif department_id:
        dept_query = dept_query.where(Department.id == department_id)

    dept_result = await db.execute(dept_query)
    departments = dept_result.scalars().all()

    metrics = []
    for dept in departments:
        # Control count (exclude archived by default)
        control_query = select(func.count(Control.id)).where(Control.department_id == dept.id)
        if not include_archived:
            control_query = control_query.where(Control.status != ControlStatus.archived.value)
        control_count_result = await db.execute(control_query)
        control_count = control_count_result.scalar() or 0

        # Active control count for compliance rate
        active_control_result = await db.execute(
            select(func.count(Control.id)).where(
                Control.department_id == dept.id, Control.status == ControlStatus.active.value
            )
        )
        active_control_count = active_control_result.scalar() or 0

        # Risk count (exclude archived by default)
        risk_query = select(func.count(Risk.id)).where(Risk.department_id == dept.id)
        if not include_archived:
            risk_query = risk_query.where(Risk.status != RiskStatus.archived.value)
        risk_count_result = await db.execute(risk_query)
        risk_count = risk_count_result.scalar() or 0

        # High risk count (net_score >= high threshold, exclude archived by default)
        high_threshold = ConfigDefaults.HIGH_RISK_MIN_NET_SCORE
        high_risk_query = select(func.count(Risk.id)).where(
            Risk.department_id == dept.id, Risk.net_score >= high_threshold
        )
        if not include_archived:
            high_risk_query = high_risk_query.where(Risk.status != RiskStatus.archived.value)
        high_risk_result = await db.execute(high_risk_query)
        high_risk_count = high_risk_result.scalar() or 0

        # Audited control count (controls with at least one execution)
        audited_control_query = (
            select(func.count(Control.id.distinct())).join(ControlExecution).where(Control.department_id == dept.id)
        )
        if not include_archived:
            audited_control_query = audited_control_query.where(Control.status != ControlStatus.archived.value)
        audited_control_result = await db.execute(audited_control_query)
        audited_control_count = audited_control_result.scalar() or 0

        # Breaching KRI count (KRIs linked to department's risks, outside limits, non-archived)
        breaching_kri_query = (
            select(func.count(KeyRiskIndicator.id.distinct()))
            .join(Risk)
            .where(
                Risk.department_id == dept.id,
                Risk.status != RiskStatus.archived.value,
                KeyRiskIndicator.is_archived.is_(False),
                or_(
                    KeyRiskIndicator.current_value < KeyRiskIndicator.lower_limit,
                    KeyRiskIndicator.current_value > KeyRiskIndicator.upper_limit,
                ),
            )
        )
        breaching_kri_result = await db.execute(breaching_kri_query)
        breaching_kri_count = breaching_kri_result.scalar() or 0

        # Total KRI count (KRIs linked to department's risks, non-archived)
        total_kri_query = (
            select(func.count(KeyRiskIndicator.id.distinct()))
            .join(Risk)
            .where(
                Risk.department_id == dept.id,
                Risk.status != RiskStatus.archived.value,
                KeyRiskIndicator.is_archived.is_(False),
            )
        )
        total_kri_result = await db.execute(total_kri_query)
        total_kri_count = total_kri_result.scalar() or 0

        # Compliance rate
        compliance_rate = (active_control_count / control_count) if control_count > 0 else 0.0

        metrics.append(
            DepartmentMetrics(
                department_id=dept.id,
                department_name=dept.name,
                control_count=control_count,
                risk_count=risk_count,
                high_risk_count=high_risk_count,
                audited_control_count=audited_control_count,
                breaching_kri_count=breaching_kri_count,
                total_kri_count=total_kri_count,
                compliance_rate=round(compliance_rate, 2),
            )
        )

    return metrics
