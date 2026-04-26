from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.approval_helpers import check_control_requires_privileged_approval
from app.core.datetime_utils import coerce_utc, utc_now
from app.core.permissions import (
    can_access_department_id,
    can_read_control_id,
    can_read_issue_id,
    can_read_kri_id,
    can_read_risk_id,
    can_read_vendor,
    can_read_vendor_id,
    can_resolve_approvals,
    can_write_issue_id,
    has_permission,
    is_control_owner,
    is_high_risk_for_approval_async,
    is_issue_owner_assignable_to_department,
    is_kri_reporting_owner,
    is_risk_control_owner,
    is_risk_kri_reporting_owner,
)
from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Control,
    ControlStatus,
    Issue,
    IssueExceptionStatus,
    IssueRemediationStatus,
    IssueStatus,
    KeyRiskIndicator,
    Risk,
    RiskStatus,
    User,
)
from app.schemas.approval_request import ApprovalRequestCapabilities
from app.schemas.control import ControlCapabilities
from app.schemas.issue import IssueCapabilities
from app.schemas.kri import KRICapabilities
from app.schemas.risk import RiskCapabilities
from app.services._kri_history.workflow import can_request_history_correction

PENDING_APPROVAL_STATUSES = (ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED)


async def _pending_approvals(
    db: AsyncSession,
    *,
    resource_type: ApprovalResourceType,
    resource_id: int,
) -> list[ApprovalRequest]:
    result = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == resource_type,
            ApprovalRequest.resource_id == resource_id,
            ApprovalRequest.status.in_(PENDING_APPROVAL_STATUSES),
        )
    )
    return list(result.scalars().all())


def _has_pending_action(approvals: list[ApprovalRequest], action: ApprovalActionType) -> bool:
    return any(approval.action_type == action for approval in approvals)


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


def _is_active_issue_exception(exception, now) -> bool:
    expires_at = coerce_utc(exception.expires_at)
    return bool(
        exception.status == IssueExceptionStatus.approved.value
        and expires_at is not None
        and expires_at > now
    )


async def risk_capabilities(db: AsyncSession, *, current_user: User, risk: Risk) -> RiskCapabilities:
    approvals = await _pending_approvals(
        db,
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
    )
    has_pending_delete = _has_pending_action(approvals, ApprovalActionType.DELETE)
    has_pending_update = _has_pending_action(approvals, ApprovalActionType.EDIT)
    is_archived = risk.status == RiskStatus.archived.value
    is_owner = risk.owner_id == current_user.id
    can_read = await can_read_risk_id(db, current_user, risk.id)
    has_update_authority = has_permission(current_user, "risks", "write") or is_owner
    can_update_scope = is_owner or can_access_department_id(current_user, risk.department_id)
    can_update = bool(can_read and has_update_authority and can_update_scope and not has_pending_delete)
    can_delete = bool(has_permission(current_user, "risks", "delete") and can_update_scope)
    can_create_kri = bool(
        can_read
        and has_permission(current_user, "risks", "write")
        and can_access_department_id(current_user, risk.department_id)
        and not is_archived
    )
    is_resolver = can_resolve_approvals(current_user)
    requires_privileged_delete = await is_high_risk_for_approval_async(risk, db)
    requires_privileged_update = bool(risk.is_priority)
    can_manage_risk_control_links = can_access_department_id(current_user, risk.department_id)
    if not can_manage_risk_control_links:
        can_manage_risk_control_links = await is_risk_kri_reporting_owner(db, current_user.id, risk.id)
    if not can_manage_risk_control_links:
        can_manage_risk_control_links = await is_risk_control_owner(db, current_user.id, risk.id)
    can_link_controls = bool(
        can_read
        and can_manage_risk_control_links
        and not is_archived
        and has_permission(current_user, "risks", "write")
        and has_permission(current_user, "controls", "read")
    )
    return RiskCapabilities(
        can_read=can_read,
        can_update=bool(can_update and not is_archived),
        can_update_sensitive_fields=bool(can_update and is_resolver and not is_archived),
        can_request_update_approval=bool(can_update and not is_resolver and not has_pending_update and not is_archived),
        can_archive_immediately=bool(can_delete and is_resolver and not is_archived),
        can_request_archive_approval=bool(
            can_delete and not is_resolver and not has_pending_delete and not is_archived
        ),
        can_restore=bool(can_delete and is_archived),
        can_create_kri=can_create_kri,
        can_create_linked_control=bool(can_link_controls and has_permission(current_user, "controls", "write")),
        can_link_controls=can_link_controls,
        can_unlink_controls=can_link_controls,
        can_view_linked_controls=bool(can_read and has_permission(current_user, "controls", "read")),
        can_view_linked_vendors=bool(can_read and has_permission(current_user, "vendors", "read")),
        can_create_issue=bool(can_read and has_permission(current_user, "issues", "write")),
        has_pending_delete_approval=has_pending_delete,
        has_pending_update_approval=has_pending_update,
        requires_privileged_update_approval=requires_privileged_update,
        requires_privileged_delete_approval=requires_privileged_delete,
    )


async def control_capabilities(db: AsyncSession, *, current_user: User, control: Control) -> ControlCapabilities:
    approvals = await _pending_approvals(
        db,
        resource_type=ApprovalResourceType.CONTROL,
        resource_id=control.id,
    )
    has_pending_delete = _has_pending_action(approvals, ApprovalActionType.DELETE)
    has_pending_update = _has_pending_action(approvals, ApprovalActionType.EDIT)
    is_archived = control.status == ControlStatus.archived.value
    is_owner = await is_control_owner(db, current_user.id, control.id)
    can_read = await can_read_control_id(db, current_user, control.id)
    has_update_authority = has_permission(current_user, "controls", "write") or is_owner
    can_update_scope = is_owner or can_access_department_id(current_user, control.department_id)
    can_update = bool(can_read and has_update_authority and can_update_scope and not has_pending_delete)
    can_delete_scope = can_access_department_id(current_user, control.department_id)
    can_delete = bool(has_permission(current_user, "controls", "delete") and can_delete_scope)
    is_resolver = can_resolve_approvals(current_user)
    requires_privileged = await check_control_requires_privileged_approval(db, control.id)
    can_link_risk = bool(
        can_update
        and not is_archived
        and has_permission(current_user, "controls", "write")
        and has_permission(current_user, "risks", "read")
    )
    can_execute = bool(has_permission(current_user, "controls", "execute") and can_read)
    is_executable = control.status in {ControlStatus.active.value, ControlStatus.draft.value}
    return ControlCapabilities(
        can_read=can_read,
        can_update=bool(can_update and not is_archived),
        can_update_sensitive_fields=bool(can_update and is_resolver and not is_archived),
        can_request_update_approval=bool(can_update and not is_resolver and not has_pending_update and not is_archived),
        can_archive_immediately=bool(can_delete and is_resolver and not is_archived),
        can_request_archive_approval=bool(
            can_delete and not is_resolver and not has_pending_delete and not is_archived
        ),
        can_restore=bool(can_delete and is_archived),
        can_log_execution=bool(can_execute and is_executable),
        can_view_executions=can_read,
        can_link_risk=can_link_risk,
        can_unlink_risk=can_link_risk,
        can_view_linked_risks=bool(can_read and has_permission(current_user, "risks", "read")),
        can_view_linked_vendors=bool(can_read and has_permission(current_user, "vendors", "read")),
        can_create_issue=bool(can_read and has_permission(current_user, "issues", "write")),
        has_pending_delete_approval=has_pending_delete,
        has_pending_update_approval=has_pending_update,
        requires_privileged_update_approval=requires_privileged,
        requires_privileged_delete_approval=requires_privileged,
        is_archived=is_archived,
        is_executable=is_executable,
    )


async def kri_capabilities(db: AsyncSession, *, current_user: User, kri: KeyRiskIndicator) -> KRICapabilities:
    approvals = await _pending_approvals(
        db,
        resource_type=ApprovalResourceType.KRI,
        resource_id=kri.id,
    )
    edit_approvals = [approval for approval in approvals if approval.action_type == ApprovalActionType.EDIT]
    has_pending_edit = bool(edit_approvals)
    has_pending_delete = _has_pending_action(approvals, ApprovalActionType.DELETE)
    has_pending_update = any(_is_kri_base_update(approval) for approval in edit_approvals)
    has_pending_value = any(_is_kri_value_submission(approval) for approval in edit_approvals)
    has_pending_history = any(_is_kri_history_correction(approval) for approval in edit_approvals)
    risk = kri.risk
    can_read = await can_read_kri_id(db, current_user, kri.id)
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
    is_resolver = can_resolve_approvals(current_user)
    is_reporting_owner = await is_kri_reporting_owner(db, current_user.id, kri.id)
    can_correct_history = await can_request_history_correction(db, current_user, kri)
    can_submit_scope = bool(
        is_reporting_owner
        or (
            has_permission(current_user, "kri", "submit")
            and risk is not None
            and can_access_department_id(current_user, risk.department_id)
        )
    )
    requires_privileged = bool(risk and await is_high_risk_for_approval_async(risk, db))
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


def approval_capabilities(*, approval: ApprovalRequest, current_user: User) -> ApprovalRequestCapabilities:
    is_privileged = can_resolve_approvals(current_user)
    is_requester = approval.requested_by_id == current_user.id
    is_primary_approver = approval.primary_approver_id == current_user.id
    is_pending = approval.status in PENDING_APPROVAL_STATUSES
    can_approve = not is_requester and (
        (approval.status == ApprovalStatus.PENDING and (is_primary_approver or is_privileged))
        or (approval.status == ApprovalStatus.PENDING_PRIVILEGED and is_privileged)
    )
    can_reject = bool(is_pending and is_privileged)
    can_cancel_as_requester = bool(is_pending and is_requester)
    can_cancel_as_resolver = bool(is_pending and is_privileged)
    requires_privileged_resolution = bool(
        approval.requires_privileged_approval or approval.status == ApprovalStatus.PENDING_PRIVILEGED
    )
    would_apply_side_effects_on_approve = bool(
        can_approve
        and (
            is_privileged
            or (
                approval.status == ApprovalStatus.PENDING
                and is_primary_approver
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


async def issue_capabilities(db: AsyncSession, *, current_user: User, issue: Issue) -> IssueCapabilities:
    can_read = await can_read_issue_id(db, current_user, issue.id)
    can_write = await can_write_issue_id(db, current_user, issue.id)
    can_approve = bool(has_permission(current_user, "issues", "approve") and can_read)
    now = utc_now()
    active_exception = next(
        (
            exception
            for exception in (issue.exceptions or [])
            if _is_active_issue_exception(exception, now)
        ),
        None,
    )
    pending_exception = next(
        (
            exception
            for exception in (issue.exceptions or [])
            if exception.status == IssueExceptionStatus.requested.value
        ),
        None,
    )
    issue_status = getattr(issue.status, "value", issue.status)
    remediation = issue.remediation_plan
    remediation_status = getattr(remediation.status, "value", remediation.status) if remediation is not None else None
    remediation_complete = bool(
        remediation_status == IssueRemediationStatus.completed.value
        and remediation is not None
        and int(remediation.progress_percent or 0) >= 100
    )
    can_start_remediation = bool(
        can_write and issue_status in {IssueStatus.open.value, IssueStatus.triaged.value}
    )
    can_update_remediation = bool(
        can_write and issue_status in {IssueStatus.in_progress.value, IssueStatus.ready_for_validation.value}
    )
    can_mark_remediation_blocked = bool(
        can_update_remediation
        and (
            remediation_status in {IssueRemediationStatus.draft.value, IssueRemediationStatus.active.value}
            or (issue_status == IssueStatus.ready_for_validation.value and remediation_complete)
        )
    )
    can_mark_remediation_completed = bool(
        can_update_remediation
        and remediation_status in {IssueRemediationStatus.active.value, IssueRemediationStatus.blocked.value}
    )
    can_close = bool(can_write and issue_status == IssueStatus.ready_for_validation.value and remediation_complete)
    is_closed = bool(issue_status == IssueStatus.closed.value)
    can_assign_owner = bool(can_write and not is_closed)
    can_clear_owner = bool(
        can_write and not is_closed and await is_issue_owner_assignable_to_department(
            db,
            owner_user_id=None,
            issue_department_id=issue.department_id,
        )
    )
    can_link = bool(can_write and not is_closed)
    return IssueCapabilities(
        can_read=can_read,
        can_update=bool(can_write and not is_closed),
        can_change_department=bool(can_write and not is_closed and not (issue.links or [])),
        can_assign_owner=can_assign_owner,
        can_clear_owner=can_clear_owner,
        can_start_remediation=can_start_remediation,
        can_update_remediation_progress=can_update_remediation,
        can_mark_remediation_blocked=can_mark_remediation_blocked,
        can_mark_remediation_completed=can_mark_remediation_completed,
        can_request_exception=bool(can_write and not is_closed and active_exception is None),
        can_approve_exception=bool(can_approve and pending_exception is not None and active_exception is None),
        can_revoke_exception=bool(can_approve and active_exception is not None),
        can_close=can_close,
        can_link_risk=bool(can_link and has_permission(current_user, "risks", "read")),
        can_link_control=bool(can_link and has_permission(current_user, "controls", "read")),
        can_link_execution=bool(can_link and has_permission(current_user, "controls", "read")),
        can_link_kri=bool(can_link and has_permission(current_user, "risks", "read")),
        can_link_vendor=bool(can_link and has_permission(current_user, "vendors", "read")),
        can_unlink_entities=can_link,
        can_view_risk_contexts=bool(can_read and has_permission(current_user, "risks", "read")),
        can_view_vendor_contexts=bool(can_read and has_permission(current_user, "vendors", "read")),
        can_use_department_lookup=bool(can_write),
        can_use_owner_lookup=bool(can_write and can_access_department_id(current_user, issue.department_id)),
        is_owner=issue.owner_user_id == current_user.id,
        is_closed=is_closed,
        has_active_exception=active_exception is not None,
        has_pending_exception_request=pending_exception is not None,
    )


async def can_view_vendor_link(db: AsyncSession, *, current_user: User, vendor_id: int | None) -> bool:
    if vendor_id is None:
        return False
    if not has_permission(current_user, "vendors", "read"):
        return False
    return await can_read_vendor_id(db, current_user, vendor_id)


def can_view_loaded_vendor(*, current_user: User, vendor) -> bool:
    return bool(
        vendor is not None
        and has_permission(current_user, "vendors", "read")
        and can_read_vendor(vendor, current_user)
    )
