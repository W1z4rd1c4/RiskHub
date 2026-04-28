from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.approval_helpers import check_control_requires_privileged_approval
from app.core.permissions import (
    can_access_department_id,
    can_read_control_id,
    can_resolve_approvals,
    has_permission,
    is_control_owner,
)
from app.models import ApprovalActionType, ApprovalResourceType, Control, ControlStatus, User
from app.schemas.control import ControlCapabilities

from .common import has_pending_action, pending_approvals


async def control_capabilities(db: AsyncSession, *, current_user: User, control: Control) -> ControlCapabilities:
    approvals = await pending_approvals(
        db,
        resource_type=ApprovalResourceType.CONTROL,
        resource_id=control.id,
    )
    has_pending_delete = has_pending_action(approvals, ApprovalActionType.DELETE)
    has_pending_update = has_pending_action(approvals, ApprovalActionType.EDIT)
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
