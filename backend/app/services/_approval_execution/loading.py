from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError
from app.models import ApprovalRequest, ApprovalResourceType, Control, KeyRiskIndicator, Risk


async def load_approval(db: AsyncSession, approval_id: int) -> ApprovalRequest:
    """Load an approval with required relationships.

    Raises NotFoundError if not found.
    """
    result = await db.execute(
        select(ApprovalRequest)
        .options(
            selectinload(ApprovalRequest.requested_by),
            selectinload(ApprovalRequest.resolved_by),
            selectinload(ApprovalRequest.primary_approver),
            selectinload(ApprovalRequest.privileged_approver),
        )
        .where(ApprovalRequest.id == approval_id)
        .with_for_update()
    )
    approval = result.scalar_one_or_none()
    if not approval:
        raise NotFoundError("Approval request not found")
    return approval


async def get_approval_department_id(db: AsyncSession, approval: ApprovalRequest) -> int | None:
    """Get the department ID for an approval's resource."""
    if approval.resource_type == ApprovalResourceType.RISK:
        result = await db.execute(select(Risk.department_id).where(Risk.id == approval.resource_id))
        return result.scalar_one_or_none()
    if approval.resource_type == ApprovalResourceType.CONTROL:
        result = await db.execute(select(Control.department_id).where(Control.id == approval.resource_id))
        return result.scalar_one_or_none()
    if approval.resource_type == ApprovalResourceType.KRI:
        result = await db.execute(
            select(Risk.department_id)
            .join(KeyRiskIndicator, KeyRiskIndicator.risk_id == Risk.id)
            .where(KeyRiskIndicator.id == approval.resource_id)
        )
        return result.scalar_one_or_none()
    return None
