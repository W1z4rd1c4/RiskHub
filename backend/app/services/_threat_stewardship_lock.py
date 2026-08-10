from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_THREAT_STEWARD_LOCK_NAMESPACE = 0x5249


async def acquire_threat_steward_identity_locks(
    db: AsyncSession,
    *,
    user_ids: Iterable[int | None],
) -> None:
    """Serialize Threat-steward assignment and identity-loss work until commit.

    Locks are acquired in user-ID order so transitions between two stewards do
    not deadlock. PostgreSQL provides the production invariant; SQLite remains
    a no-op for the fast unit-test lane.
    """
    if db.get_bind().dialect.name != "postgresql":
        return

    for user_id in sorted(user_id for user_id in set(user_ids) if user_id is not None):
        await db.execute(
            text("SELECT pg_advisory_xact_lock(:namespace, :user_id)"),
            {"namespace": _THREAT_STEWARD_LOCK_NAMESPACE, "user_id": user_id},
        )


async def acquire_threat_steward_identity_lock(
    db: AsyncSession,
    *,
    user_id: int,
) -> None:
    await acquire_threat_steward_identity_locks(db, user_ids=(user_id,))
