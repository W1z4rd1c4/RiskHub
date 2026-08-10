from __future__ import annotations

from collections.abc import Iterable
from typing import Final

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.models import Process

_PROCESS_OWNER_LOCK_NAMESPACE = 0x5250
_OWNER_NOT_CHECKED: Final = object()


async def acquire_process_owner_identity_locks(
    db: AsyncSession,
    *,
    user_ids: Iterable[int | None],
) -> None:
    """Serialize Process-owner assignment and identity deactivation."""
    if db.get_bind().dialect.name != "postgresql":
        return

    for user_id in sorted(user_id for user_id in set(user_ids) if user_id is not None):
        await db.execute(
            text("SELECT pg_advisory_xact_lock(:namespace, :user_id)"),
            {"namespace": _PROCESS_OWNER_LOCK_NAMESPACE, "user_id": user_id},
        )


async def acquire_process_owner_identity_lock(
    db: AsyncSession,
    *,
    user_id: int,
) -> None:
    await acquire_process_owner_identity_locks(db, user_ids=(user_id,))


async def lock_process_for_owner_mutation(
    db: AsyncSession,
    *,
    process_id: int,
    user_ids: Iterable[int | None],
    expected_owner_user_id: int | None | object = _OWNER_NOT_CHECKED,
) -> Process | None:
    """Acquire the canonical identity -> Process-row ownership lock order.

    The optimistic owner snapshot lets callers discover which advisory locks
    are needed without first taking the Process row. If the owner changed
    while those locks were awaited, fail and retry rather than acquiring a
    new identity lock after the row lock and introducing an AB/BA deadlock.
    """
    await acquire_process_owner_identity_locks(db, user_ids=user_ids)
    process = (
        await db.execute(
            select(Process)
            .where(Process.id == process_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if (
        process is not None
        and expected_owner_user_id is not _OWNER_NOT_CHECKED
        and process.process_owner_user_id != expected_owner_user_id
    ):
        raise ConflictError("Process ownership changed concurrently; retry")
    return process


async def lock_processes_for_owner_deactivation(
    db: AsyncSession,
    *,
    user_id: int,
) -> list[Process]:
    """Lock every currently owned Process after locking the owner identity."""
    await acquire_process_owner_identity_lock(db, user_id=user_id)
    return list(
        (
            await db.execute(
                select(Process)
                .where(Process.process_owner_user_id == user_id)
                .order_by(Process.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    )
