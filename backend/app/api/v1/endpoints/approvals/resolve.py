from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.exceptions import DomainError
from app.db.session import get_db
from app.models import User
from app.schemas.approval_request import ApprovalRequestListResponse, ApprovalRequestRead, ApprovalRequestResolve
from app.services._approval_queue import (
    count_pending_approval_queue,
    list_my_approval_queue_page,
)
from app.services._approval_queue.projection import build_approval_read

from ._shared import logger

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
    except (HTTPException, DomainError):
        raise
    except Exception:
        logger.exception("Error applying approval %s", approval_id)
        raise HTTPException(status_code=500, detail="Failed to process approval request")

    return build_approval_read(approval, current_user)


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

    return build_approval_read(approval, current_user)


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

    return build_approval_read(approval, current_user)


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
    return await count_pending_approval_queue(db=db, current_user=current_user)


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
    return await list_my_approval_queue_page(db=db, current_user=current_user, skip=skip, limit=limit)
