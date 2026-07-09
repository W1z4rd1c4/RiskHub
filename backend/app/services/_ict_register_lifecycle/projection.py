from __future__ import annotations

from app.core.security import check_permission
from app.models import Process, User
from app.schemas.process import ProcessListCapabilities, ProcessListResponse, ProcessRead
from app.services._authorization_capabilities import process_capabilities


def serialize_process_detail(process: Process, *, current_user: User) -> ProcessRead:
    base = ProcessRead.model_validate(process)
    return base.model_copy(update={"capabilities": process_capabilities(current_user, process)})


def build_process_collection_capabilities(current_user: User) -> ProcessListCapabilities:
    return ProcessListCapabilities(can_create=check_permission(current_user, "processes", "write"))


def serialize_process_list(
    processes: list[Process],
    *,
    current_user: User,
    total: int,
    offset: int,
    limit: int,
) -> ProcessListResponse:
    return ProcessListResponse(
        items=[serialize_process_detail(process, current_user=current_user) for process in processes],
        total=total,
        offset=offset,
        limit=limit,
        capabilities=build_process_collection_capabilities(current_user),
    )
