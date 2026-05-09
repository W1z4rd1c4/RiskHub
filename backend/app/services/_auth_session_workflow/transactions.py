from __future__ import annotations

from typing import Protocol


class AuthCommitSession(Protocol):
    async def commit(self) -> None: ...

    async def rollback(self) -> None: ...


async def commit_auth_transaction(db: AuthCommitSession, *, boundary: str) -> None:
    """Commit an auth/session transaction boundary and rollback if commit fails."""
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise
