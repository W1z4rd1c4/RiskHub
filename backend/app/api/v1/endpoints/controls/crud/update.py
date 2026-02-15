from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.activity_logger import build_change_set, log_activity
from app.core.permissions import check_department_access
from app.core.security import check_permission
from app.db.session import get_db
from app.models import Control, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.control import ControlRead, ControlUpdate

from .._helpers import _build_pending_changes, _first_high_risk_linked_risk

router = APIRouter()


@router.patch("/{control_id}", response_model=ControlRead)
async def update_control(
    control_id: int,
    control_data: ControlUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Update a control. Requires controls:write permission OR being the control owner.
    Non-privileged users editing controls linked to critical risks or changing
    sensitive fields (owner, department) will trigger an approval request.
    """

    from app.core.permissions import (
        can_resolve_approvals,
        has_sensitive_field_changes,
        is_control_owner,
    )
    from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus

    result = await db.execute(select(Control).where(Control.id == control_id))
    control = result.scalar_one_or_none()

    if not control:
        raise HTTPException(status_code=404, detail="Control not found")

    # Check permission: either controls:write or is control owner
    has_write = check_permission(current_user, "controls", "write")
    is_owner = await is_control_owner(db, current_user.id, control_id)

    if not has_write and not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: controls:write or control owner required"
        )

    # Verify department access (skipped for control owners)
    if not is_owner:
        check_department_access(control.department_id, current_user)

    # Update fields
    update_data = control_data.model_dump(exclude_unset=True)

    # Check for pending DELETE request (block any updates if delete is pending)
    existing_delete = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.CONTROL,
            ApprovalRequest.resource_id == control.id,
            ApprovalRequest.action_type == ApprovalActionType.DELETE,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
        )
    )
    if existing_delete.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Cannot update control while deletion is pending approval")

    # Check for approval requirements (non-privileged users only)
    if not can_resolve_approvals(current_user):
        from app.core.approval_helpers import (
            check_control_requires_privileged_approval,
            create_approval_request_with_audit,
            get_primary_approver_for_control,
        )

        requires_approval = False
        approval_reason = ""
        pending_changes = {}
        is_priority_linked = False

        # Check 1: Is control linked to critical risk?
        is_priority_linked, high_risk = await _first_high_risk_linked_risk(db, control.id)
        if is_priority_linked and high_risk:
            requires_approval = True
            approval_reason = f"Edit to control linked to critical risk {high_risk.risk_id_code}"
            pending_changes = _build_pending_changes(control, update_data)

        # Check 2: Sensitive field changes (even if not linked to critical risk)
        if not requires_approval:
            old_data = {"control_owner_id": control.control_owner_id, "department_id": control.department_id}
            has_sensitive, changed = has_sensitive_field_changes("control", old_data, update_data)
            if has_sensitive:
                requires_approval = True
                approval_reason = f"Change to sensitive fields: {', '.join(changed.keys())}"
                pending_changes = changed

        # Check 3: Owner edits always require approval (even non-critical controls)
        if not requires_approval and is_owner:
            requires_approval = True
            approval_reason = "Control owner edit requires Risk Owner approval"
            pending_changes = _build_pending_changes(control, update_data)
            # Check if any linked risk is priority
            is_priority_linked = await check_control_requires_privileged_approval(db, control.id)

        if requires_approval:
            # Check for existing pending edit request
            existing = await db.execute(
                select(ApprovalRequest).where(
                    ApprovalRequest.resource_type == ApprovalResourceType.CONTROL,
                    ApprovalRequest.resource_id == control.id,
                    ApprovalRequest.action_type == ApprovalActionType.EDIT,
                    ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
                )
            )
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Edit request already pending for this control")

            # Get primary approver (Risk Owner of highest-priority linked risk)
            primary_approver_id = await get_primary_approver_for_control(db, control.id)
            if primary_approver_id == current_user.id:
                primary_approver_id = None  # Prevent self-approval

            # Store control name for display
            name_snippet = control.name[:50] if control.name else ""

            approval = ApprovalRequest(
                resource_type=ApprovalResourceType.CONTROL,
                resource_id=control.id,
                resource_name=f"Control #{control.id}: {name_snippet}",
                requested_by_id=current_user.id,
                reason=approval_reason,
                action_type=ApprovalActionType.EDIT,
                pending_changes=pending_changes,
                status=ApprovalStatus.PENDING,
                primary_approver_id=primary_approver_id,
                requires_privileged_approval=is_priority_linked,
            )

            await create_approval_request_with_audit(
                db,
                approval=approval,
                actor=current_user,
                department_id=control.department_id,
            )

            # Notify Approvers
            try:
                from app.models.notification import NotificationType
                from app.services.notification_service import NotificationService

                # 1. Notify Primary Approver (Risk Owner)
                if primary_approver_id:
                    await NotificationService.create_notification(
                        db=db,
                        user_id=primary_approver_id,
                        notification_type=NotificationType.APPROVAL_PENDING,
                        title="Control Edit Request",
                        message=f"Control '{name_snippet}' has been edited and requires your approval.",
                        resource_type="approval",
                        resource_id=approval.id,
                    )

                # 2. Notify other privileged approvers (CROs, Risk Managers)
                await NotificationService.notify_approvers(db, approval)

                await db.commit()
            except Exception as e:
                await db.rollback()
                import logging

                logging.getLogger(__name__).warning(
                    f"Failed to notify approvers for control edit approval #{approval.id}: {e}"
                )

            from fastapi.responses import JSONResponse

            return JSONResponse(
                status_code=status.HTTP_202_ACCEPTED,
                content={
                    "message": "Change requires approval",
                    "approval_id": approval.id,
                    "action_type": "edit",
                    "pending_fields": list(pending_changes.keys()),
                    "pending_changes": pending_changes,
                    "primary_approver_id": primary_approver_id,
                    "requires_privileged_approval": is_priority_linked,
                },
            )

    changes = build_change_set(control, update_data)

    for field, value in update_data.items():
        if hasattr(value, "value"):  # Handle enums
            value = value.value
        setattr(control, field, value)

    control.updated_by_id = current_user.id

    # Log activity within the same transaction
    await log_activity(
        db,
        entity_type=ActivityEntityType.CONTROL,
        entity_id=control.id,
        entity_name=f"{control.name}",
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=control.department_id,
        changes=changes,
    )
    await db.commit()
    await db.refresh(control)

    # Reload with relationships
    result = await db.execute(
        select(Control)
        .options(
            selectinload(Control.department),
            selectinload(Control.control_owner),
        )
        .where(Control.id == control.id)
    )
    return result.scalar_one()

