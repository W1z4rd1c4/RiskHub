from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, User

from .delete_side_effects import _apply_delete_side_effects
from .edit_risk_control import _apply_edit_risk_control
from .kri_side_effects import _apply_edit_kri


async def apply_side_effects(
    db: AsyncSession,
    approval: ApprovalRequest,
    current_user: User,
) -> None:
    """Apply the side effects for an approved request.

    - DELETE: archive the resource
    - EDIT: apply pending_changes to the resource
    """
    if approval.action_type == ApprovalActionType.DELETE:
        await _apply_delete_side_effects(db, approval, current_user)

    elif approval.action_type == ApprovalActionType.EDIT:
        if approval.resource_type in (ApprovalResourceType.RISK, ApprovalResourceType.CONTROL):
            await _apply_edit_risk_control(db, approval, current_user)
        elif approval.resource_type == ApprovalResourceType.KRI:
            await _apply_edit_kri(db, approval, current_user)
