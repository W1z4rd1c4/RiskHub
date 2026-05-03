from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, User

from .delete_side_effects import _apply_delete_side_effects
from .edit_risk_control import _apply_edit_risk_control
from .kri_side_effects import _apply_edit_kri
from .results import SideEffectResult

SideEffectHandler = Callable[[AsyncSession, ApprovalRequest, User], Awaitable[SideEffectResult]]

SIDE_EFFECT_HANDLERS: dict[tuple[ApprovalActionType, ApprovalResourceType], SideEffectHandler] = {
    (ApprovalActionType.DELETE, ApprovalResourceType.RISK): _apply_delete_side_effects,
    (ApprovalActionType.DELETE, ApprovalResourceType.CONTROL): _apply_delete_side_effects,
    (ApprovalActionType.DELETE, ApprovalResourceType.KRI): _apply_delete_side_effects,
    (ApprovalActionType.EDIT, ApprovalResourceType.RISK): _apply_edit_risk_control,
    (ApprovalActionType.EDIT, ApprovalResourceType.CONTROL): _apply_edit_risk_control,
    (ApprovalActionType.EDIT, ApprovalResourceType.KRI): _apply_edit_kri,
}


async def apply_side_effects(
    db: AsyncSession,
    approval: ApprovalRequest,
    current_user: User,
) -> SideEffectResult:
    """Apply the side effects for an approved request.

    - DELETE: archive the resource
    - EDIT: apply pending_changes to the resource
    """
    handler = SIDE_EFFECT_HANDLERS.get((approval.action_type, approval.resource_type))
    if handler is None:
        return SideEffectResult.applied()
    return await handler(db, approval, current_user)
