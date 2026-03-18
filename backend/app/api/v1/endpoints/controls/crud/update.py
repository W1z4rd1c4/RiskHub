from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.api.v1.endpoints._monitoring_response import load_monitoring_response_context, serialize_control_read
from app.core.datetime_utils import utc_now
from app.core.activity_logger import build_change_set, log_activity
from app.core.permissions import check_department_access, is_control_owner
from app.core.security import check_permission
from app.db.session import get_db
from app.models import Control, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.control import ControlRead, ControlUpdate

from .._helpers import _build_pending_changes, _first_high_risk_linked_risk

router = APIRouter()


async def _load_control_or_404(db: AsyncSession, control_id: int) -> Control:
    result = await db.execute(select(Control).where(Control.id == control_id))
    control = result.scalar_one_or_none()
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")
    return control


async def _assert_control_update_access(
    db: AsyncSession,
    *,
    control: Control,
    control_id: int,
    current_user: User,
) -> tuple[bool, bool]:
    has_write = check_permission(current_user, "controls", "write")
    is_owner = await is_control_owner(db, current_user.id, control_id)

    if not has_write and not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: controls:write or control owner required",
        )

    if not is_owner:
        check_department_access(control.department_id, current_user)

    return has_write, is_owner


async def _assert_no_pending_control_delete(db: AsyncSession, control_id: int) -> None:
    from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus

    existing_delete = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.CONTROL,
            ApprovalRequest.resource_id == control_id,
            ApprovalRequest.action_type == ApprovalActionType.DELETE,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
        )
    )
    if existing_delete.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Cannot update control while deletion is pending approval")


async def _create_control_edit_approval_if_required(
    db: AsyncSession,
    *,
    control: Control,
    current_user: User,
    update_data: dict,
    is_owner: bool,
):
    from fastapi.responses import JSONResponse

    from app.core.approval_helpers import (
        check_control_requires_privileged_approval,
        create_approval_request_with_audit,
        get_primary_approver_for_control,
    )
    from app.core.permissions import can_resolve_approvals, has_sensitive_field_changes
    from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus

    if can_resolve_approvals(current_user):
        return None

    requires_approval = False
    approval_reason = ""
    pending_changes = {}
    is_priority_linked = False

    is_priority_linked, high_risk = await _first_high_risk_linked_risk(db, control.id)
    if is_priority_linked and high_risk:
        requires_approval = True
        approval_reason = f"Edit to control linked to critical risk {high_risk.risk_id_code}"
        pending_changes = _build_pending_changes(control, update_data)

    if not requires_approval:
        old_data = {"control_owner_id": control.control_owner_id, "department_id": control.department_id}
        has_sensitive, changed = has_sensitive_field_changes("control", old_data, update_data)
        if has_sensitive:
            requires_approval = True
            approval_reason = f"Change to sensitive fields: {', '.join(changed.keys())}"
            pending_changes = changed

    if not requires_approval and is_owner:
        requires_approval = True
        approval_reason = "Control owner edit requires Risk Owner approval"
        pending_changes = _build_pending_changes(control, update_data)
        is_priority_linked = await check_control_requires_privileged_approval(db, control.id)

    if not requires_approval:
        return None

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

    primary_approver_id = await get_primary_approver_for_control(db, control.id)
    if primary_approver_id == current_user.id:
        primary_approver_id = None

    name_snippet = (control.name or "").strip()[:50]
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.CONTROL,
        resource_id=control.id,
        resource_name=name_snippet or "Unknown control",
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

async def _reload_control_with_relationships(db: AsyncSession, control_id: int) -> Control:
    result = await db.execute(
        select(Control)
        .options(
            selectinload(Control.department),
            selectinload(Control.control_owner),
            selectinload(Control.executions),
        )
        .where(Control.id == control_id)
    )
    return result.scalar_one()


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

    control = await _load_control_or_404(db, control_id)
    _, is_owner = await _assert_control_update_access(
        db,
        control=control,
        control_id=control_id,
        current_user=current_user,
    )
    update_data = control_data.model_dump(exclude_unset=True)
    await _assert_no_pending_control_delete(db, control.id)

    approval_response = await _create_control_edit_approval_if_required(
        db,
        control=control,
        current_user=current_user,
        update_data=update_data,
        is_owner=is_owner,
    )
    if approval_response is not None:
        return approval_response

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
    reloaded_control = await _reload_control_with_relationships(db, control.id)
    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    return serialize_control_read(reloaded_control, monitoring_context)
