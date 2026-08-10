from __future__ import annotations

from app.models import Process, User
from app.schemas.process import ProcessCapabilities
from app.services._ict_register_lifecycle.policy import (
    can_read_process_record,
    can_update_process_record,
)


def process_capabilities(
    current_user: User,
    process: Process,
    *,
    protected_change_requires_approval: bool,
    ownership_pending: bool = False,
    governed_mutation_pending: bool = False,
    pending_requested_by_id: int | None = None,
) -> ProcessCapabilities:
    """Per-row Process action capabilities (ADR-001 capability SSOT).

    Process Owner and the Owning Department Head receive record-specific read
    and update access. That assignment does not grant archive/restore or any
    linked-register permission.
    """
    from app.core.permissions import has_permission

    can_read = can_read_process_record(current_user, process)
    can_write = can_update_process_record(current_user, process)
    can_delete = has_permission(current_user, "processes", "delete") and can_read
    is_active = not process.is_archived
    return ProcessCapabilities(
        can_read=bool(can_read),
        can_update=bool(can_write and is_active and not ownership_pending and not governed_mutation_pending),
        can_archive=bool(
            can_read and can_delete and is_active and not governed_mutation_pending
        ),
        can_restore=bool(
            can_read
            and can_delete
            and process.is_archived
            and not governed_mutation_pending
        ),
        protected_change_requires_approval=protected_change_requires_approval,
        can_request_change=bool(can_write and is_active and not governed_mutation_pending),
        can_cancel_pending_change=bool(
            governed_mutation_pending and pending_requested_by_id == current_user.id
        ),
        has_pending_change=governed_mutation_pending,
        business_edit_blocked=governed_mutation_pending,
    )
