from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import (
    can_access_department_id,
    can_read_kri_id,
    has_permission,
    is_high_risk_for_approval_async,
    is_kri_reporting_owner,
)
from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, KeyRiskIndicator, User
from app.schemas.kri import KRICapabilities
from app.services._kri_history.workflow import can_request_history_correction
from app.services.approval_scenario_policy import approval_privilege_tier

from .common import has_pending_action, pending_approvals


def _is_kri_value_submission(approval: ApprovalRequest) -> bool:
    pending_changes = approval.pending_changes or {}
    return "current_value" in pending_changes and "recorded_at" in pending_changes


def _is_kri_history_correction(approval: ApprovalRequest) -> bool:
    pending_changes = approval.pending_changes or {}
    return "history_entry_id" in pending_changes


def _is_kri_base_update(approval: ApprovalRequest) -> bool:
    return (
        approval.action_type == ApprovalActionType.EDIT
        and not _is_kri_value_submission(approval)
        and not _is_kri_history_correction(approval)
    )


async def kri_capabilities(
    db: AsyncSession,
    *,
    current_user: User,
    kri: KeyRiskIndicator,
    preloaded_approvals: list[ApprovalRequest] | None = None,
    high_risk_min_net_score: int | None = None,
    can_read_override: bool | None = None,
    is_reporting_owner_override: bool | None = None,
) -> KRICapabilities:
    approvals = preloaded_approvals
    if approvals is None:
        approvals = await pending_approvals(
            db,
            resource_type=ApprovalResourceType.KRI,
            resource_id=kri.id,
        )
    edit_approvals = [approval for approval in approvals if approval.action_type == ApprovalActionType.EDIT]
    has_pending_edit = bool(edit_approvals)
    has_pending_delete = has_pending_action(approvals, ApprovalActionType.DELETE)
    has_pending_update = any(_is_kri_base_update(approval) for approval in edit_approvals)
    has_pending_value = any(_is_kri_value_submission(approval) for approval in edit_approvals)
    has_pending_history = any(_is_kri_history_correction(approval) for approval in edit_approvals)
    risk = kri.risk
    can_read = can_read_override if can_read_override is not None else await can_read_kri_id(db, current_user, kri.id)
    can_write = bool(
        can_read
        and has_permission(current_user, "risks", "write")
        and risk is not None
        and can_access_department_id(current_user, risk.department_id)
    )
    can_delete = bool(
        has_permission(current_user, "risks", "delete")
        and risk is not None
        and can_access_department_id(current_user, risk.department_id)
    )
    is_resolver = approval_privilege_tier(current_user).is_privileged
    is_reporting_owner = (
        is_reporting_owner_override
        if is_reporting_owner_override is not None
        else await is_kri_reporting_owner(db, current_user.id, kri.id)
    )
    can_correct_history = await can_request_history_correction(
        db,
        current_user,
        kri,
        can_read_override=can_read,
    )
    can_submit_scope = bool(
        is_reporting_owner
        or (
            has_permission(current_user, "kri", "submit")
            and risk is not None
            and can_access_department_id(current_user, risk.department_id)
        )
    )
    requires_privileged = bool(
        risk
        and (
            risk.is_priority
            or (
                high_risk_min_net_score is not None
                and risk.net_score >= high_risk_min_net_score
            )
            or (
                high_risk_min_net_score is None
                and await is_high_risk_for_approval_async(risk, db)
            )
        )
    )
    pending_edit_blocks_user_actions = bool(has_pending_edit and not is_resolver)
    can_update = bool(
        can_write and not kri.is_archived and not has_pending_delete and not pending_edit_blocks_user_actions
    )
    can_submit_value = bool(can_submit_scope and not kri.is_archived and not pending_edit_blocks_user_actions)
    can_request_history = bool(
        can_correct_history and not kri.is_archived and (is_resolver or not has_pending_edit)
    )
    return KRICapabilities(
        can_read=can_read,
        can_update=can_update,
        can_update_sensitive_fields=bool(can_write and is_resolver and not kri.is_archived),
        can_request_update_approval=bool(
            can_write and not is_resolver and not has_pending_edit and not kri.is_archived
        ),
        can_archive_immediately=bool(can_delete and is_resolver and not kri.is_archived),
        can_request_archive_approval=bool(
            can_delete and not is_resolver and not has_pending_delete and not kri.is_archived
        ),
        can_restore=bool(can_delete and kri.is_archived),
        can_submit_value=can_submit_value,
        can_submit_backdated_value=bool(can_submit_scope and is_resolver and not kri.is_archived),
        can_request_value_submission_approval=bool(
            can_submit_scope and not is_resolver and not has_pending_edit and not kri.is_archived
        ),
        can_view_history=can_read,
        can_request_history_correction=can_request_history,
        can_apply_history_correction_immediately=bool(can_correct_history and is_resolver and not kri.is_archived),
        can_link_vendors=bool(can_update and has_permission(current_user, "vendors", "read")),
        can_unlink_vendors=bool(can_update and has_permission(current_user, "vendors", "read")),
        can_view_linked_vendors=bool(can_read and has_permission(current_user, "vendors", "read")),
        can_create_issue=bool(can_read and has_permission(current_user, "issues", "write")),
        has_pending_delete_approval=has_pending_delete,
        has_pending_update_approval=has_pending_update,
        has_pending_value_submission_approval=has_pending_value,
        has_pending_history_correction_approval=has_pending_history,
        requires_privileged_update_approval=requires_privileged,
        requires_privileged_delete_approval=requires_privileged,
    )
