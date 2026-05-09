from __future__ import annotations

from .transactions import AuthCommitSession, commit_auth_transaction


async def commit_demo_login(db: AuthCommitSession) -> None:
    await commit_auth_transaction(db, boundary="demo_login")
