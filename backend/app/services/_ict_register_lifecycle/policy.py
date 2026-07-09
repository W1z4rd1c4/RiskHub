from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.core.security import check_permission
from app.models import Process, User


async def load_process(db: AsyncSession, process_id: int) -> Process | None:
    result = await db.execute(select(Process).where(Process.id == process_id))
    return result.scalar_one_or_none()


async def assert_process_readable(db: AsyncSession, *, process_id: int, current_user: User) -> Process:
    if not check_permission(current_user, "processes", "read"):
        raise AuthorizationError("Permission denied: processes:read")
    process = await load_process(db, process_id)
    if not process:
        raise NotFoundError("Process not found")
    return process


async def assert_process_create_allowed(*, current_user: User) -> None:
    if not check_permission(current_user, "processes", "write"):
        raise AuthorizationError("Permission denied: processes:write")


async def assert_process_update_allowed(db: AsyncSession, *, process_id: int, current_user: User) -> Process:
    if not check_permission(current_user, "processes", "write"):
        raise AuthorizationError("Permission denied: processes:write")
    process = await load_process(db, process_id)
    if not process:
        raise NotFoundError("Process not found")
    if process.is_archived:
        raise ConflictError("Cannot update archived process")
    return process


async def _assert_process_delete_allowed(db: AsyncSession, *, process_id: int, current_user: User) -> Process:
    if not check_permission(current_user, "processes", "delete"):
        raise AuthorizationError("Permission denied: processes:delete")
    process = await load_process(db, process_id)
    if not process:
        raise NotFoundError("Process not found")
    return process


async def assert_process_archive_allowed(db: AsyncSession, *, process_id: int, current_user: User) -> Process:
    process = await _assert_process_delete_allowed(db, process_id=process_id, current_user=current_user)
    if process.is_archived:
        raise ValidationError("Process is already archived")
    return process


async def assert_process_restore_allowed(db: AsyncSession, *, process_id: int, current_user: User) -> Process:
    process = await _assert_process_delete_allowed(db, process_id=process_id, current_user=current_user)
    if not process.is_archived:
        raise ValidationError("Process is not archived")
    return process
