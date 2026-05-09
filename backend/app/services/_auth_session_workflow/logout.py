from __future__ import annotations

from .transactions import AuthCommitSession, commit_auth_transaction


async def commit_logout(db: AuthCommitSession) -> None:
    await commit_auth_transaction(db, boundary="logout")


async def commit_logout_all(db: AuthCommitSession) -> None:
    await commit_auth_transaction(db, boundary="logout_all")
