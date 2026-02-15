from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql import case

from app.core.pagination import DEPARTMENT_RECENT_EXECUTIONS_LIMIT
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Control, ControlExecution, KeyRiskIndicator, Risk, User
from app.models.control import ControlStatus
from app.models.risk import RiskStatus
from app.schemas.department import ControlStats, DepartmentDetail, RecentExecution, RiskDistribution

from ._shared import RISK_LEVEL_RANGES, _assert_department_in_scope

router = APIRouter()


@router.get("/{department_id}", response_model=DepartmentDetail)
async def get_department(
    department_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("departments", "read")),
):
    """
    Get detailed department information with metrics.

    Access: 404 if department not found; 403 if out of user's scope.
    Excludes: Archived risks/controls/KRIs from counts and distributions.
    Metrics: risk_distribution uses RISK_LEVEL_RANGES; control_stats groups by form/frequency.
    """
    dept = await _assert_department_in_scope(department_id, db, current_user)

    # Count active users only (consistent with list_departments)
    user_count_result = await db.execute(
        select(func.count(User.id)).where(and_(User.department_id == department_id, User.is_active.is_(True)))
    )
    user_count = user_count_result.scalar() or 0

    # Count risks
    risk_count_result = await db.execute(
        select(func.count(Risk.id)).where(
            and_(Risk.department_id == department_id, Risk.status != RiskStatus.archived.value)
        )
    )
    risk_count = risk_count_result.scalar() or 0

    # Count controls (non-archived)
    control_count_result = await db.execute(
        select(func.count(Control.id)).where(
            and_(Control.department_id == department_id, Control.status != ControlStatus.archived.value)
        )
    )
    control_count = control_count_result.scalar() or 0

    # Count KRIs (only from non-archived risks)
    kri_count_result = await db.execute(
        select(func.count(KeyRiskIndicator.id))
        .join(Risk)
        .where(and_(Risk.department_id == department_id, Risk.status != RiskStatus.archived.value))
    )
    kri_count = kri_count_result.scalar() or 0

    # Risk distribution by level (single query, avoids N+1)
    risk_distribution_columns = []
    for level, (min_score, max_score) in RISK_LEVEL_RANGES.items():
        risk_distribution_columns.append(
            func.sum(
                case(
                    (
                        and_(
                            Risk.net_score >= min_score,
                            Risk.net_score <= max_score,
                        ),
                        1,
                    ),
                    else_=0,
                )
            ).label(level)
        )

    risk_distribution_stmt = select(*risk_distribution_columns).where(
        and_(
            Risk.department_id == department_id,
            Risk.status != RiskStatus.archived.value,
        )
    )
    risk_distribution_row = (await db.execute(risk_distribution_stmt)).one()
    risk_distribution = RiskDistribution(
        low=int(getattr(risk_distribution_row, "low") or 0),
        medium=int(getattr(risk_distribution_row, "medium") or 0),
        high=int(getattr(risk_distribution_row, "high") or 0),
        critical=int(getattr(risk_distribution_row, "critical") or 0),
    )

    # Risk by status (single grouped query)
    risk_by_status_stmt = (
        select(Risk.status, func.count(Risk.id))
        .where(
            and_(
                Risk.department_id == department_id,
                Risk.status != RiskStatus.archived.value,
            )
        )
        .group_by(Risk.status)
    )
    risk_by_status = {row[0]: row[1] for row in (await db.execute(risk_by_status_stmt)).all() if row[1] > 0}

    # Control stats
    control_stats = ControlStats(total=control_count, active=0, inactive=0, by_form={}, by_frequency={})

    # Controls by status (single grouped query for the two statuses we expose)
    control_status_stmt = (
        select(Control.status, func.count(Control.id))
        .where(
            and_(
                Control.department_id == department_id,
                Control.status.in_([ControlStatus.active.value, ControlStatus.inactive.value]),
            )
        )
        .group_by(Control.status)
    )
    status_counts = {row[0]: row[1] for row in (await db.execute(control_status_stmt)).all()}
    control_stats.active = int(status_counts.get(ControlStatus.active.value, 0))
    control_stats.inactive = int(status_counts.get(ControlStatus.inactive.value, 0))

    # Controls by form (single grouped query; preserves prior behavior including archived controls)
    control_form_stmt = (
        select(Control.control_form, func.count(Control.id))
        .where(Control.department_id == department_id)
        .group_by(Control.control_form)
    )
    control_stats.by_form = {
        row[0]: row[1] for row in (await db.execute(control_form_stmt)).all() if row[0] and row[1] > 0
    }

    # Controls by frequency (single grouped query; preserves prior behavior including archived controls)
    control_frequency_stmt = (
        select(Control.frequency, func.count(Control.id))
        .where(Control.department_id == department_id)
        .group_by(Control.frequency)
    )
    control_stats.by_frequency = {
        row[0]: row[1] for row in (await db.execute(control_frequency_stmt)).all() if row[0] and row[1] > 0
    }

    # Recent executions
    exec_result = await db.execute(
        select(ControlExecution)
        .join(Control)
        .options(selectinload(ControlExecution.control), selectinload(ControlExecution.executed_by))
        .where(Control.department_id == department_id)
        .order_by(ControlExecution.executed_at.desc())
        .limit(DEPARTMENT_RECENT_EXECUTIONS_LIMIT)
    )
    executions = exec_result.scalars().all()

    recent_executions = [
        RecentExecution(
            id=ex.id,
            control_id=ex.control_id,
            control_name=ex.control.name if ex.control else "Unknown",
            result=ex.result,
            executed_at=ex.executed_at,
            executed_by=ex.executed_by.name if ex.executed_by else "Unknown",
        )
        for ex in executions
    ]

    return DepartmentDetail(
        id=dept.id,
        name=dept.name,
        code=dept.code,
        description=dept.description,
        created_at=dept.created_at,
        updated_at=dept.updated_at,
        user_count=user_count,
        risk_count=risk_count,
        control_count=control_count,
        kri_count=kri_count,
        risk_distribution=risk_distribution,
        risk_by_status=risk_by_status,
        control_stats=control_stats,
        recent_executions=recent_executions,
    )

