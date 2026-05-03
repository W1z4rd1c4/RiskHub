from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.permissions import can_resolve_approvals
from app.db.session import get_db
from app.models import ApprovalRequest, ApprovalStatus, User
from app.schemas.approval_request import ApprovalRequestListResponse, ApprovalRequestRead, ApprovalRequestResolve
from app.services.approval_queue_visibility import (
    count_visible_pending_approvals_for_user,
    visible_pending_approvals_for_user,
)

from ._shared import _build_approval_read, logger

router = APIRouter()

_APPROVAL_AUTH_NOT_FOUND_RESPONSES: dict[int | str, dict[str, Any]] = {
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
    - Users with approval-resolution authority can approve any PENDING or PENDING_PRIVILEGED request.
    - Primary approver (Risk Owner): can approve PENDING requests they own.
      If requires_privileged_approval, moves to PENDING_PRIVILEGED instead of applying.
    """
    from app.services.approval_execution_service import approve_request_workflow

    logger.info(f"Processing approval request {approval_id}")

    try:
        approval = await approve_request_workflow(
            db,
            approval_id=approval_id,
            current_user=current_user,
            resolution_notes=resolve_data.resolution_notes,
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error applying approval %s", approval_id)
        raise HTTPException(status_code=500, detail="Failed to process approval request")

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
    Only users with approval-resolution authority can reject.
    Requires mandatory resolution_notes.
    """
    from app.services.approval_execution_service import reject_request_workflow

    approval = await reject_request_workflow(
        db,
        approval_id=approval_id,
        current_user=current_user,
        resolution_notes=resolve_data.resolution_notes,
    )

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
    from app.services.approval_execution_service import cancel_request_workflow

    approval = await cancel_request_workflow(db, approval_id=approval_id, current_user=current_user)

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
    - Approval resolvers: count of all pending requests (PENDING + PENDING_PRIVILEGED)
    - Non-privileged users: own requests, primary-approver requests, and visible
      scenario-approver requests
    """
    if can_resolve_approvals(current_user):
        # Count all pending/pending_privileged for approvers
        result = await db.execute(
            select(func.count())
            .select_from(ApprovalRequest)
            .where(ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]))
        )
        return {"count": result.scalar() or 0}

    count = await count_visible_pending_approvals_for_user(db, current_user=current_user)
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
    List pending approval requests that need this user's approval.
    """
    approvals = await visible_pending_approvals_for_user(
        db,
        current_user=current_user,
        include_requester=False,
    )
    total = len(approvals)
    page = approvals[skip : skip + limit]

    return ApprovalRequestListResponse(
        items=[_build_approval_read(a, current_user) for a in page], total=total, skip=skip, limit=limit
    )
