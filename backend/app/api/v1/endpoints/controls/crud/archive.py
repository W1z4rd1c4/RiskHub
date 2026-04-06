from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.v1.endpoints.approvals._delete_authorization import assert_can_request_delete_control
from app.core.activity_logger import log_activity
from app.db.session import get_db
from app.models import Control, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.control import ControlStatusEnum

router = APIRouter()


@router.delete("/{control_id}", status_code=status.HTTP_202_ACCEPTED)
async def delete_control(
    control_id: int,
    reason: str = Query(..., min_length=1, description="Reason for deletion (mandatory)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Request deletion of a control.
    - Risk Manager/CRO/Admin: deletes immediately (204)
    - Others: creates approval request (202), item stays visible
    """
    from fastapi.responses import Response

    from app.core.permissions import can_resolve_approvals
    from app.models import ApprovalRequest, ApprovalResourceType, ApprovalStatus

    control = await assert_can_request_delete_control(
        db,
        control_id=control_id,
        current_user=current_user,
    )

    # Privileged users can delete immediately
    if can_resolve_approvals(current_user):
        control.status = ControlStatusEnum.archived.value
        control.updated_by_id = current_user.id

        # Log activity within the same transaction
        await log_activity(
            db,
            entity_type=ActivityEntityType.CONTROL,
            entity_id=control.id,
            entity_name=f"{control.name}",
            action=ActivityAction.ARCHIVE,
            actor=current_user,
            department_id=control.department_id,
        )
        await db.commit()

        return Response(status_code=status.HTTP_204_NO_CONTENT)

    # Check for existing pending request (both PENDING and PENDING_PRIVILEGED)
    existing = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.CONTROL,
            ApprovalRequest.resource_id == control.id,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Deletion request already pending")

    # Create approval request - ITEM STAYS VISIBLE
    name_snippet = (control.name or "").strip()[:50]

    # Get primary approver (Risk Owner of highest-priority linked risk)
    from app.core.approval_helpers import (
        check_control_requires_privileged_approval,
        create_approval_request_with_audit,
        get_primary_approver_for_control,
    )
    from app.models import ApprovalActionType

    primary_approver_id = await get_primary_approver_for_control(db, control.id)
    if primary_approver_id == current_user.id:
        primary_approver_id = None  # Prevent self-approval

    requires_privileged = await check_control_requires_privileged_approval(db, control.id)

    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.CONTROL,
        resource_id=control.id,
        resource_name=name_snippet or "Unknown control",
        requested_by_id=current_user.id,
        reason=reason,
        status=ApprovalStatus.PENDING,
        action_type=ApprovalActionType.DELETE,
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=requires_privileged,
    )

    await create_approval_request_with_audit(
        db,
        approval=approval,
        actor=current_user,
        department_id=control.department_id,
    )

    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content={
            "message": "Deletion request submitted for approval",
            "approval_id": approval.id,
            "action_type": "delete",
        },
    )
