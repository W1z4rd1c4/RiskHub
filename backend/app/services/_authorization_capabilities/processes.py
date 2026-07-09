from __future__ import annotations

from app.core.permissions import has_permission
from app.models import Process, User
from app.schemas.process import ProcessCapabilities


def process_capabilities(current_user: User, process: Process) -> ProcessCapabilities:
    """Per-row Process action capabilities (ADR-001 capability SSOT).

    Processes carry no per-row ownership or department scope: visibility is
    the ``processes:read`` permission, maintenance is ``processes:write`` and
    archive/restore is ``processes:delete`` (risk manager and the CRO wildcard
    per the RBAC seed).
    """
    can_read = has_permission(current_user, "processes", "read")
    can_write = has_permission(current_user, "processes", "write")
    can_delete = has_permission(current_user, "processes", "delete")
    is_active = not process.is_archived
    return ProcessCapabilities(
        can_read=bool(can_read),
        can_update=bool(can_read and can_write and is_active),
        can_archive=bool(can_read and can_delete and is_active),
        can_restore=bool(can_read and can_delete and process.is_archived),
    )
