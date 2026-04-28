from typing import Optional

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.core.permissions import can_resolve_approvals
from app.models import ApprovalRequest, ApprovalStatus, User
from app.services.approval_scenario_policy import (
    can_view_approval_resource,
    scenario_allows_privileged_resolution,
    user_matches_approval_scenario_role,
)


async def assert_can_approve(
    db: AsyncSession,
    approval: ApprovalRequest,
    current_user: User,
) -> tuple[bool, bool, bool]:
    """Check if current_user can approve the given approval.

    Returns:
        Tuple of (is_privileged, is_primary_approver, is_scenario_approver)

    Raises:
        HTTPException 403 if user cannot approve
        HTTPException 400 if approval is not in a pending state
    """
    is_privileged = can_resolve_approvals(current_user)
    is_primary_approver = approval.primary_approver_id == current_user.id
    is_requester = approval.requested_by_id == current_user.id
    scenario_match = user_matches_approval_scenario_role(approval, current_user)
    privileged_scenario_match = scenario_allows_privileged_resolution(approval, current_user)

    if is_requester:
        raise HTTPException(
            status_code=403,
            detail="Users cannot approve their own requests",
        )

    if approval.status == ApprovalStatus.PENDING:
        if scenario_match is False:
            raise HTTPException(
                status_code=403,
                detail="This approval scenario does not allow your role to approve this request",
            )
        if (
            scenario_match is True
            and not is_primary_approver
            and not is_privileged
            and not await can_view_approval_resource(db, current_user, approval)
        ):
            raise HTTPException(status_code=403, detail="Access denied")
        if scenario_match is None and not is_primary_approver and not is_privileged:
            raise HTTPException(
                status_code=403,
                detail="Only the primary approver or a privileged user can approve this request",
            )
    elif approval.status == ApprovalStatus.PENDING_PRIVILEGED:
        if privileged_scenario_match is False or not is_privileged:
            raise HTTPException(
                status_code=403,
                detail="This request requires approval-resolution authority",
            )
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve request with status: {approval.status.value}",
        )

    return is_privileged, is_primary_approver, scenario_match is True


def apply_status_transition(
    approval: ApprovalRequest,
    *,
    current_user: User,
    resolution_notes: Optional[str],
    is_privileged: bool,
    is_primary_approver: bool,
    is_scenario_approver: bool,
) -> bool:
    """Apply the status transition for an approval.

    Mutates the approval object in place.

    Returns:
        True if side effects (DELETE/EDIT) should be applied,
        False if transitioning to PENDING_PRIVILEGED (no side effects yet).
    """
    if approval.status == ApprovalStatus.PENDING:
        if is_privileged:
            # Privileged user bypasses tiered approval
            approval.status = ApprovalStatus.APPROVED
            approval.resolved_by_id = current_user.id
            approval.resolved_at = utc_now()
            approval.resolution_notes = resolution_notes
            return True
        elif is_primary_approver or is_scenario_approver:
            # First-stage approver approving
            approval.primary_approved_at = utc_now()
            if approval.requires_privileged_approval:
                # Move to PENDING_PRIVILEGED
                approval.status = ApprovalStatus.PENDING_PRIVILEGED
                approval.resolution_notes = (
                    f"Primary approval by Risk Owner: {resolution_notes}"
                    if is_primary_approver
                    else f"Scenario approval: {resolution_notes}"
                )
                return False
            else:
                # No privileged approval needed, finalize
                approval.status = ApprovalStatus.APPROVED
                approval.resolved_by_id = current_user.id
                approval.resolved_at = utc_now()
                approval.resolution_notes = resolution_notes
                return True

    elif approval.status == ApprovalStatus.PENDING_PRIVILEGED:
        # Privileged user finalizing after primary approval
        approval.status = ApprovalStatus.APPROVED
        approval.privileged_approver_id = current_user.id
        approval.privileged_approved_at = utc_now()
        approval.resolved_by_id = current_user.id
        approval.resolved_at = utc_now()
        approval.resolution_notes = (approval.resolution_notes or "") + f"\nPrivileged approval: {resolution_notes}"
        return True

    # Should not reach here if assert_can_approve was called
    return False
