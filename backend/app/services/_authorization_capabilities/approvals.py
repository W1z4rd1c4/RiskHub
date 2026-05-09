from __future__ import annotations

from app.models import ApprovalRequest, ApprovalStatus, User
from app.schemas.approval_request import ApprovalRequestCapabilities
from app.services.approval_scenario_policy import approval_privilege_tier

from .common import PENDING_APPROVAL_STATUSES


def approval_capabilities(*, approval: ApprovalRequest, current_user: User) -> ApprovalRequestCapabilities:
    tier = approval_privilege_tier(current_user, approval)
    is_privileged = tier.is_privileged
    is_requester = tier.is_requester
    is_primary_approver = tier.is_primary_approver
    is_pending = approval.status in PENDING_APPROVAL_STATUSES
    scenario_match = tier.scenario_match
    privileged_scenario_match = tier.privileged_scenario_match
    if scenario_match is None:
        can_approve = not is_requester and (
            (approval.status == ApprovalStatus.PENDING and (is_primary_approver or is_privileged))
            or (approval.status == ApprovalStatus.PENDING_PRIVILEGED and is_privileged)
        )
        can_reject = bool(is_pending and is_privileged)
    else:
        can_approve = not is_requester and (
            (approval.status == ApprovalStatus.PENDING and scenario_match)
            or (
                approval.status == ApprovalStatus.PENDING_PRIVILEGED
                and is_privileged
                and privileged_scenario_match is True
            )
        )
        can_reject = not is_requester and bool(
            (approval.status == ApprovalStatus.PENDING and scenario_match)
            or (
                approval.status == ApprovalStatus.PENDING_PRIVILEGED
                and is_privileged
                and privileged_scenario_match is True
            )
        )
    can_cancel_as_requester = bool(is_pending and is_requester)
    can_cancel_as_resolver = bool(is_pending and is_privileged)
    requires_privileged_resolution = bool(
        approval.requires_privileged_approval or approval.status == ApprovalStatus.PENDING_PRIVILEGED
    )
    is_first_stage_approver = is_primary_approver or scenario_match is True
    would_apply_side_effects_on_approve = bool(
        can_approve
        and (
            is_privileged
            or (
                approval.status == ApprovalStatus.PENDING
                and is_first_stage_approver
                and not approval.requires_privileged_approval
            )
        )
    )
    return ApprovalRequestCapabilities(
        can_read=True,
        can_approve=can_approve,
        can_reject=can_reject,
        can_cancel=can_cancel_as_requester or can_cancel_as_resolver,
        can_cancel_as_requester=can_cancel_as_requester,
        can_cancel_as_resolver=can_cancel_as_resolver,
        can_view_pending_changes=bool(approval.pending_changes),
        can_view_resolution_notes=approval.resolution_notes is not None,
        can_inspect_side_effects=is_privileged,
        is_requester=is_requester,
        is_primary_approver=is_primary_approver,
        is_privileged_resolver=is_privileged,
        is_pending=is_pending,
        requires_privileged_resolution=requires_privileged_resolution,
        would_apply_side_effects_on_approve=would_apply_side_effects_on_approve,
    )
