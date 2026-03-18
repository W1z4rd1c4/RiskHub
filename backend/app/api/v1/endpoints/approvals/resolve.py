from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.approval_display import approval_resource_label
from app.core.activity_logger import log_activity
from app.core.datetime_utils import utc_now
from app.core.permissions import can_resolve_approvals
from app.db.session import get_db
from app.models import ApprovalRequest, ApprovalStatus, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.approval_request import ApprovalRequestListResponse, ApprovalRequestRead, ApprovalRequestResolve
from app.services.outbox_service import OutboxService

from ._shared import _build_approval_read, _get_approval_department_id, logger

router = APIRouter()

_APPROVAL_AUTH_NOT_FOUND_RESPONSES = {
    401: {"description": "Authentication required."},
    403: {"description": "Authenticated user is not allowed to resolve this approval."},
    404: {"description": "Approval request not found."},
}

@router.post("/{approval_id}/approve", response_model=ApprovalRequestRead, responses=_APPROVAL_AUTH_NOT_FOUND_RESPONSES)
async def approve_request(
    approval_id: int,
    resolve_data: ApprovalRequestResolve,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Approve a pending request and execute the action.

    Tiered approval flow:
    - Privileged users (CRO/Admin/Risk Manager): can approve any PENDING or PENDING_PRIVILEGED request.
    - Primary approver (Risk Owner): can approve PENDING requests they own.
      If requires_privileged_approval, moves to PENDING_PRIVILEGED instead of applying.
    """
    from app.services.approval_execution_service import (
        apply_side_effects,
        apply_status_transition,
        assert_can_approve,
        load_approval,
        log_approval_approve,
    )

    logger.info(f"Processing approval request {approval_id}")

    # 1) Load approval with relationships
    approval = await load_approval(db, approval_id)

    # 2) Authorize
    is_privileged, is_primary_approver = assert_can_approve(approval, current_user)

    previous_status = approval.status

    # 3) Transition status
    should_apply_changes = apply_status_transition(
        approval,
        current_user=current_user,
        resolution_notes=resolve_data.resolution_notes,
        is_privileged=is_privileged,
        is_primary_approver=is_primary_approver,
    )

    # 4) Apply side effects if approved
    if should_apply_changes:
        await apply_side_effects(db, approval, current_user)

        # Log approval APPROVE action
        if approval.status == ApprovalStatus.APPROVED:
            await log_approval_approve(db, approval, current_user, previous_status)

        # Commit changes
        try:
            logger.info("Flushing and committing changes...")
            await db.flush()
            await OutboxService.enqueue(
                db,
                event_type="approval.request_resolved",
                aggregate_type="approval_request",
                aggregate_id=approval.id,
                idempotency_key=f"approval.request_resolved:{approval.id}:{approval.status.value.lower()}",
                payload={"approval_id": approval.id, "approved": approval.status == ApprovalStatus.APPROVED},
            )
            await db.commit()
            logger.info("Commit successful")
        except Exception:
            logger.exception("Error applying approval %s", approval_id)
            await db.rollback()
            raise HTTPException(status_code=500, detail="Failed to process approval request")
    else:
        # PENDING → PENDING_PRIVILEGED: Log escalation and notify privileged users
        from app.services.approval_execution_service import get_approval_department_id

        # Log ESCALATE activity for audit trail
        department_id = await get_approval_department_id(db, approval)
        await log_activity(
            db,
            entity_type=ActivityEntityType.APPROVAL,
            entity_id=approval.id,
            entity_name=approval_resource_label(approval),
            action=ActivityAction.ESCALATE,
            actor=current_user,
            department_id=department_id,
            changes={"status": {"old": previous_status.value, "new": approval.status.value}},
            description=f"Escalated to privileged approval by {current_user.name}",
        )

        await OutboxService.enqueue(
            db,
            event_type="approval.request_created",
            aggregate_type="approval_request",
            aggregate_id=approval.id,
            idempotency_key=f"approval.request_created:{approval.id}:{approval.status.value.lower()}",
            payload={"approval_id": approval.id},
        )
        await db.commit()

    # Reload with relationships for response
    result = await db.execute(
        select(ApprovalRequest)
        .options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .where(ApprovalRequest.id == approval.id)
    )
    approval = result.scalar_one()

    return _build_approval_read(approval, current_user)


@router.post("/{approval_id}/reject", response_model=ApprovalRequestRead, responses=_APPROVAL_AUTH_NOT_FOUND_RESPONSES)
async def reject_request(
    approval_id: int,
    resolve_data: ApprovalRequestResolve,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Reject a pending request.
    Only Risk Manager, CRO, or Admin can reject.
    Requires mandatory resolution_notes.
    """
    if not can_resolve_approvals(current_user):
        raise HTTPException(status_code=403, detail="Only Risk Manager, CRO, or Admin can reject requests")

    result = await db.execute(
        select(ApprovalRequest)
        .options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .where(ApprovalRequest.id == approval_id)
    )
    approval = result.scalar_one_or_none()

    if not approval:
        raise HTTPException(status_code=404, detail="Approval request not found")

    # Allow rejecting any pending status (PENDING or PENDING_PRIVILEGED)
    if approval.status not in (ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED):
        raise HTTPException(status_code=400, detail=f"Cannot reject request with status: {approval.status.value}")

    previous_status = approval.status

    # Update approval status
    approval.status = ApprovalStatus.REJECTED
    approval.resolved_by_id = current_user.id
    approval.resolved_at = utc_now()
    approval.resolution_notes = resolve_data.resolution_notes

    department_id = await _get_approval_department_id(db, approval)
    await log_activity(
        db,
        entity_type=ActivityEntityType.APPROVAL,
        entity_id=approval.id,
        entity_name=approval_resource_label(approval),
        action=ActivityAction.REJECT,
        actor=current_user,
        department_id=department_id,
        changes={"status": {"old": previous_status.value, "new": approval.status.value}},
    )
    await OutboxService.enqueue(
        db,
        event_type="approval.request_resolved",
        aggregate_type="approval_request",
        aggregate_id=approval.id,
        idempotency_key=f"approval.request_resolved:{approval.id}:{approval.status.value.lower()}",
        payload={"approval_id": approval.id, "approved": False},
    )
    await db.commit()

    # Reload with relationships
    result = await db.execute(
        select(ApprovalRequest)
        .options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .where(ApprovalRequest.id == approval.id)
    )
    approval = result.scalar_one()

    return _build_approval_read(approval, current_user)


@router.post("/{approval_id}/cancel", response_model=ApprovalRequestRead, responses=_APPROVAL_AUTH_NOT_FOUND_RESPONSES)
async def cancel_request(
    approval_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Cancel own pending request.
    Only the original requester can cancel.
    """
    result = await db.execute(
        select(ApprovalRequest)
        .options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .where(ApprovalRequest.id == approval_id)
    )
    approval = result.scalar_one_or_none()

    if not approval:
        raise HTTPException(status_code=404, detail="Approval request not found")

    # §5.5: Request creator OR privileged users can cancel PENDING/PENDING_PRIVILEGED requests
    is_requester = approval.requested_by_id == current_user.id
    is_privileged = can_resolve_approvals(current_user)

    if not is_requester and not is_privileged:
        raise HTTPException(status_code=403, detail="Only the requester or privileged users can cancel requests")

    if approval.status not in (ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED):
        raise HTTPException(status_code=400, detail=f"Cannot cancel request with status: {approval.status.value}")

    # Update status
    approval.status = ApprovalStatus.CANCELLED
    approval.resolved_by_id = current_user.id
    approval.resolved_at = utc_now()

    # Log activity for cancellation - distinguish self vs privileged
    department_id = await _get_approval_department_id(db, approval)
    if is_requester:
        cancel_description = "Approval request cancelled by requester"
    else:
        cancel_description = f"Approval request cancelled by {current_user.name} (privileged)"
    await log_activity(
        db,
        entity_type=ActivityEntityType.APPROVAL,
        entity_id=approval.id,
        entity_name=approval_resource_label(approval),
        action=ActivityAction.CANCEL,
        actor=current_user,
        department_id=department_id,
        description=cancel_description,
    )

    await OutboxService.enqueue(
        db,
        event_type="approval.request_cancelled",
        aggregate_type="approval_request",
        aggregate_id=approval.id,
        idempotency_key=f"approval.request_cancelled:{approval.id}",
        payload={"approval_id": approval.id, "cancelled_by_user_id": current_user.id},
    )

    await db.commit()

    # Reload with relationships
    result = await db.execute(
        select(ApprovalRequest)
        .options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .where(ApprovalRequest.id == approval.id)
    )
    approval = result.scalar_one()

    return _build_approval_read(approval, current_user)


@router.get(
    "/pending/count",
    responses={
        401: {"description": "Authentication required."},
    },
)
async def get_pending_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Get count of pending approvals for badge display.
    - Privileged users: count of all pending requests (PENDING + PENDING_PRIVILEGED)
    - Non-privileged users: own requests in PENDING/PENDING_PRIVILEGED plus
      primary-approver requests in PENDING
    """
    if can_resolve_approvals(current_user):
        # Count all pending/pending_privileged for approvers
        result = await db.execute(
            select(func.count())
            .select_from(ApprovalRequest)
            .where(ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]))
        )
    else:
        # Count own pending + requests where user is primary approver
        result = await db.execute(
            select(func.count())
            .select_from(ApprovalRequest)
            .where(
                or_(
                    # Own pending requests
                    (ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]))
                    & (ApprovalRequest.requested_by_id == current_user.id),
                    # Requests where user is primary approver
                    (ApprovalRequest.status == ApprovalStatus.PENDING)
                    & (ApprovalRequest.primary_approver_id == current_user.id),
                )
            )
        )

    count = result.scalar() or 0
    return {"count": count}


@router.get(
    "/my-approvals",
    response_model=ApprovalRequestListResponse,
    responses={
        401: {"description": "Authentication required."},
    },
)
async def list_my_approval_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    """
    List approval requests where current user is the primary approver (Risk Owner).
    Returns all PENDING requests that need this user's approval.
    """
    base_query = select(ApprovalRequest).where(
        ApprovalRequest.primary_approver_id == current_user.id, ApprovalRequest.status == ApprovalStatus.PENDING
    )

    # Count total
    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Fetch with pagination
    query = (
        base_query.options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .offset(skip)
        .limit(limit)
        .order_by(ApprovalRequest.created_at.desc())
    )

    result = await db.execute(query)
    approvals = result.scalars().all()

    return ApprovalRequestListResponse(
        items=[_build_approval_read(a, current_user) for a in approvals], total=total, skip=skip, limit=limit
    )
