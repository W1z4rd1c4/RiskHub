from __future__ import annotations

from .transactions import AuthCommitSession, commit_auth_transaction


async def commit_sso_exchange(db: AuthCommitSession) -> None:
    await commit_auth_transaction(db, boundary="sso_exchange")


async def commit_failed_sso_audit(db: AuthCommitSession) -> None:
    await commit_auth_transaction(db, boundary="failed_sso_audit")
