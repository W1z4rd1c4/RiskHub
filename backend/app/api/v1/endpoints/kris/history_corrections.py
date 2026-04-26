from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import KeyRiskIndicator, User
from app.models.kri_history import KRIValueHistory
from app.schemas.kri import KRIHistoryEdit


async def create_kri_history_correction_approval(
    db: AsyncSession,
    *,
    kri: KeyRiskIndicator,
    entry: KRIValueHistory,
    entry_id: int,
    data: KRIHistoryEdit,
    current_user: User,
):
    from app.core.approval_helpers import build_approval_queued_response, create_approval_request_with_audit
    from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus

    existing = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.KRI,
            ApprovalRequest.resource_id == kri.id,
            ApprovalRequest.action_type == ApprovalActionType.EDIT,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Edit request already pending for this KRI")

    primary_approver_id = kri.risk.owner_id if kri.risk else None
    pending_changes = {
        "history_entry_id": entry_id,
        "old_value": entry.value,
        "new_value": data.value,
        "reason": data.reason,
        "period_end": entry.period_end.isoformat(),
    }

    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.KRI,
        resource_id=kri.id,
        resource_name=f"{kri.metric_name[:30]} (history correction)",
        requested_by_id=current_user.id,
        reason=data.reason,
        action_type=ApprovalActionType.EDIT,
        pending_changes=pending_changes,
        status=ApprovalStatus.PENDING,
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=True,
    )

    await create_approval_request_with_audit(
        db,
        approval=approval,
        actor=current_user,
        department_id=kri.risk.department_id,
        on_duplicate_detail="A correction request is already pending for this KRI.",
    )

    return build_approval_queued_response(
        message="History correction requires approval (CRO approval required per §5.3)",
        approval_id=approval.id,
        action_type="edit",
        pending_fields=list(pending_changes.keys()),
        pending_changes=pending_changes,
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=True,
    )
