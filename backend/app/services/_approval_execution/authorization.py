from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.core.exceptions import AuthorizationError, ValidationError
from app.models import ApprovalRequest, ApprovalStatus, User
from app.services.approval_scenario_policy import (
    can_view_approval_resource,
    resolve_approval_privilege_tier,
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
        AuthorizationError if user cannot approve
        ValidationError if approval is not in a pending state
    """
    tier = await resolve_approval_privilege_tier(db, current_user, approval)

    if tier.is_requester:
        raise AuthorizationError("Users cannot approve their own requests")

    if approval.status == ApprovalStatus.PENDING:
        if tier.scenario_match is False:
            raise AuthorizationError("This approval scenario does not allow your role to approve this request")
        if (
            tier.scenario_match is True
            and not tier.is_primary_approver
            and not tier.is_privileged
            and not await can_view_approval_resource(db, current_user, approval)
        ):
            raise AuthorizationError("Access denied")
        if tier.scenario_match is None and not tier.is_primary_approver and not tier.is_privileged:
            raise AuthorizationError("Only the primary approver or a privileged user can approve this request")
    elif approval.status == ApprovalStatus.PENDING_PRIVILEGED:
        if tier.privileged_scenario_match is False or not tier.is_privileged:
            raise AuthorizationError("This request requires approval-resolution authority")
    else:
        raise ValidationError(f"Cannot approve request with status: {approval.status.value}")

    return tier.is_privileged, tier.is_primary_approver, tier.scenario_match is True


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
