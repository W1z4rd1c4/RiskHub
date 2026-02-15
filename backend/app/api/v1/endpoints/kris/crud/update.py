from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.activity_logger import build_change_set, log_activity
from app.core.permissions import check_department_access
from app.core.security import require_permission
from app.db.session import get_db
from app.models import KeyRiskIndicator, Risk, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.kri import KRIResponse, KRIUpdate

router = APIRouter()


@router.put("/{kri_id}", response_model=KRIResponse)
async def update_kri(
    kri_id: int,
    data: KRIUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    """
    Update a KRI. Non-privileged users editing any KRI
    will trigger an approval request instead of immediate update.
    """
    from app.core.permissions import can_resolve_approvals
    from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus

    result = await db.execute(
        select(KeyRiskIndicator)
        .join(Risk)
        .where(KeyRiskIndicator.id == kri_id)
        .options(joinedload(KeyRiskIndicator.risk))
    )
    kri = result.scalar_one_or_none()

    if not kri:
        raise HTTPException(status_code=404, detail="KRI not found")

    # Verify department access
    check_department_access(kri.risk.department_id, current_user)

    # Block updates on archived KRIs
    if kri.is_archived:
        raise HTTPException(status_code=409, detail="Cannot update archived KRI")

    update_data = data.model_dump(exclude_unset=True)

    # Reject current_value updates via PUT - must use POST /kris/{id}/values
    if "current_value" in update_data:
        raise HTTPException(
            status_code=400,
            detail="Cannot update current_value via PUT. Use POST /kris/{id}/values to record new values.",
        )

    # Validate limits if both provided
    new_lower = update_data.get("lower_limit", kri.lower_limit)
    new_upper = update_data.get("upper_limit", kri.upper_limit)
    if new_lower >= new_upper:
        raise HTTPException(status_code=400, detail="lower_limit must be less than upper_limit")

    # Check for pending DELETE request (block any updates if delete is pending)
    existing_delete = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.KRI,
            ApprovalRequest.resource_id == kri.id,
            ApprovalRequest.action_type == ApprovalActionType.DELETE,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
        )
    )
    if existing_delete.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Cannot update KRI while deletion is pending approval")

    # ALL KRI edits by non-privileged users require approval
    if not can_resolve_approvals(current_user):
        # Check for existing pending edit request
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

        pending_changes = {k: {"old": getattr(kri, k, None), "new": v} for k, v in update_data.items()}
        name_snippet = kri.metric_name[:50] if kri.metric_name else f"KRI-{kri.id}"

        approval = ApprovalRequest(
            resource_type=ApprovalResourceType.KRI,
            resource_id=kri.id,
            resource_name=name_snippet,
            requested_by_id=current_user.id,
            reason=f"Edit to KRI '{name_snippet}' requires approval",
            action_type=ApprovalActionType.EDIT,
            pending_changes=pending_changes,
            status=ApprovalStatus.PENDING,
        )
        from app.core.approval_helpers import create_approval_request_with_audit

        await create_approval_request_with_audit(
            db,
            approval=approval,
            actor=current_user,
            department_id=kri.risk.department_id,
        )

        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=202,
            content={
                "message": "Change requires approval",
                "approval_id": approval.id,
                "action_type": "edit",
                "pending_fields": list(pending_changes.keys()),
                "pending_changes": pending_changes,
            },
        )

    value_update = update_data.pop("current_value", None)
    extra_changes = {}
    if value_update is not None:
        extra_changes["current_value"] = {"old": kri.current_value, "new": value_update}
    changes = build_change_set(kri, update_data, extra_changes=extra_changes)

    for field, value in update_data.items():
        setattr(kri, field, value)

    if value_update is not None:
        from app.services.kri_history_service import KRIHistoryService

        try:
            await KRIHistoryService.record_value(
                db=db,
                kri=kri,
                value=value_update,
                recorded_by_id=current_user.id,
                is_privileged=can_resolve_approvals(current_user),
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    # Log activity within the same transaction
    await log_activity(
        db,
        entity_type=ActivityEntityType.KRI,
        entity_id=kri.id,
        entity_name=f"{kri.metric_name}",
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=kri.risk.department_id,
        changes=changes,
    )
    await db.commit()
    await db.refresh(kri)

    return KRIResponse.model_validate(kri)
