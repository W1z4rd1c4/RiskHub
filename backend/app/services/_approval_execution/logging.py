from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit.approval import approval_approved
from app.models import ApprovalRequest, ApprovalStatus, User

from .loading import get_approval_department_id


async def log_approval_approve(
    db: AsyncSession,
    approval: ApprovalRequest,
    actor: User,
    previous_status: ApprovalStatus,
) -> None:
    """Log the final APPROVE action for an approval request."""
    department_id = await get_approval_department_id(db, approval)
    await approval_approved(
        db,
        actor=actor,
        approval=approval,
        department_id=department_id,
        changes={"status": {"old": previous_status.value, "new": approval.status.value}},
    )
