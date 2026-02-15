from sqlalchemy.ext.asyncio import AsyncSession

from app.core import activity_logger
from app.models import ApprovalRequest, ApprovalStatus, User
from app.models.activity_log import ActivityAction, ActivityEntityType

from .loading import get_approval_department_id


async def log_approval_approve(
    db: AsyncSession,
    approval: ApprovalRequest,
    actor: User,
    previous_status: ApprovalStatus,
) -> None:
    """Log the final APPROVE action for an approval request."""
    department_id = await get_approval_department_id(db, approval)
    await activity_logger.log_activity(
        db,
        entity_type=ActivityEntityType.APPROVAL,
        entity_id=approval.id,
        entity_name=approval.resource_name or f"{approval.resource_type.value}-{approval.resource_id}",
        action=ActivityAction.APPROVE,
        actor=actor,
        department_id=department_id,
        changes={"status": {"old": previous_status.value, "new": approval.status.value}},
    )

