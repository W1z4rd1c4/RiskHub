from __future__ import annotations

from .transactions import AuthCommitSession, commit_auth_transaction


async def commit_refresh_session(db: AuthCommitSession) -> None:
    await commit_auth_transaction(db, boundary="refresh_session")
