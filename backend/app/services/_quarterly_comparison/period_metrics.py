from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Control, Risk
from app.models.activity_log import ActivityLog
from app.models.control import ControlStatus
from app.models.control_execution import ControlExecution, ExecutionResult


async def get_quarter_period_metrics(
    db: AsyncSession,
    start: datetime,
    end: datetime,
    dept_ids: Optional[list[int]],
) -> dict:
    risk_conditions = [
        Risk.created_at >= start,
        Risk.created_at < end,
        Risk.live(),
    ]
    if dept_ids is not None:
        risk_conditions.append(Risk.department_id.in_(dept_ids))
    new_risks = await db.scalar(select(func.count(Risk.id)).where(*risk_conditions))

    archived_conditions = [
        Risk.updated_at >= start,
        Risk.updated_at < end,
        Risk.archived(),
    ]
    if dept_ids is not None:
        archived_conditions.append(Risk.department_id.in_(dept_ids))
    archived_risks = await db.scalar(select(func.count(Risk.id)).where(*archived_conditions))

    audit_activity_query = select(func.count(ControlExecution.id)).where(
        ControlExecution.executed_at >= start,
        ControlExecution.executed_at < end,
    )
    if dept_ids is not None:
        audit_activity_query = audit_activity_query.join(Control, ControlExecution.control_id == Control.id).where(
            Control.department_id.in_(dept_ids)
        )
    audit_activity = await db.scalar(audit_activity_query)

    failed_audits_query = select(func.count(ControlExecution.id)).where(
        ControlExecution.executed_at >= start,
        ControlExecution.executed_at < end,
        ControlExecution.result == ExecutionResult.failed.value,
    )
    if dept_ids is not None:
        failed_audits_query = failed_audits_query.join(Control, ControlExecution.control_id == Control.id).where(
            Control.department_id.in_(dept_ids)
        )
    failed_audits = await db.scalar(failed_audits_query)

    controls_with_executions = select(ControlExecution.control_id.distinct()).where(
        ControlExecution.executed_at >= start, ControlExecution.executed_at < end
    )
    unaudited_controls_query = select(func.count(Control.id)).where(
        Control.status == ControlStatus.active.value,
        Control.live(),
        Control.id.notin_(controls_with_executions),
    )
    if dept_ids is not None:
        unaudited_controls_query = unaudited_controls_query.where(Control.department_id.in_(dept_ids))
    unaudited_controls = await db.scalar(unaudited_controls_query)

    activity_volume_query = select(func.count(ActivityLog.id)).where(
        ActivityLog.created_at >= start,
        ActivityLog.created_at < end,
    )
    if dept_ids is not None:
        activity_volume_query = activity_volume_query.where(ActivityLog.department_id.in_(dept_ids))
    activity_volume = await db.scalar(activity_volume_query)

    return {
        "new_risks": new_risks or 0,
        "archived_risks": archived_risks or 0,
        "audit_activity": audit_activity or 0,
        "failed_audits": failed_audits or 0,
        "unaudited_controls": unaudited_controls or 0,
        "activity_volume": activity_volume or 0,
    }
