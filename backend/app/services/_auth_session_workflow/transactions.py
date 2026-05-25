from __future__ import annotations

from typing import Protocol

from app.services.transaction_boundary import commit_service_boundary


class AuthCommitSession(Protocol):
    async def commit(self) -> None: ...

    async def rollback(self) -> None: ...


async def commit_auth_transaction(db: AuthCommitSession, *, boundary: str) -> None:
    """Commit an auth/session transaction boundary and rollback if commit fails."""
    await commit_service_boundary(db, boundary=f"auth.{boundary}")
