from __future__ import annotations

from .transactions import AuthCommitSession, commit_auth_transaction


async def commit_failed_password_login(db: AuthCommitSession) -> None:
    await commit_auth_transaction(db, boundary="failed_password_login")


async def commit_successful_password_login(db: AuthCommitSession) -> None:
    await commit_auth_transaction(db, boundary="successful_password_login")
