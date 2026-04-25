from sqlalchemy import String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.approval_request import ApprovalRequest, ApprovalResourceType, ApprovalStatus
from app.models.control import Control
from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.risk import Risk


async def count_pending_approvals(db: AsyncSession, department_ids: list[int] | None) -> int:
    pending_status_values = [ApprovalStatus.PENDING.value, ApprovalStatus.PENDING_PRIVILEGED.value]
    pending_approval_conditions = [cast(ApprovalRequest.status, String).in_(pending_status_values)]

    if department_ids is None:
        return await db.scalar(select(func.count(ApprovalRequest.id)).where(*pending_approval_conditions)) or 0

    pending_risks = await db.scalar(
        select(func.count(ApprovalRequest.id))
        .join(
            Risk,
            (ApprovalRequest.resource_type == ApprovalResourceType.RISK) & (ApprovalRequest.resource_id == Risk.id),
        )
        .where(*pending_approval_conditions, Risk.department_id.in_(department_ids))
    )
    pending_controls = await db.scalar(
        select(func.count(ApprovalRequest.id))
        .join(
            Control,
            (ApprovalRequest.resource_type == ApprovalResourceType.CONTROL)
            & (ApprovalRequest.resource_id == Control.id),
        )
        .where(*pending_approval_conditions, Control.department_id.in_(department_ids))
    )
    pending_kris = await db.scalar(
        select(func.count(ApprovalRequest.id))
        .join(
            KeyRiskIndicator,
            (ApprovalRequest.resource_type == ApprovalResourceType.KRI)
            & (ApprovalRequest.resource_id == KeyRiskIndicator.id),
        )
        .join(Risk, KeyRiskIndicator.risk_id == Risk.id)
        .where(*pending_approval_conditions, Risk.department_id.in_(department_ids))
    )

    return (pending_risks or 0) + (pending_controls or 0) + (pending_kris or 0)
