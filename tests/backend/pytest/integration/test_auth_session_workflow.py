"""Integration scaffold for auth-session workflow transaction boundaries."""

from __future__ import annotations

from collections.abc import Awaitable, Callable

import pytest

pytestmark = pytest.mark.asyncio

WorkflowCommit = Callable[[object], Awaitable[None]]


class CommitTrackingSession:
    def __init__(self, *, fail_commit: bool = False) -> None:
        self.commits = 0
        self.rollbacks = 0
        self.fail_commit = fail_commit

    async def commit(self) -> None:
        self.commits += 1
        if self.fail_commit:
            raise RuntimeError("commit failed")

    async def rollback(self) -> None:
        self.rollbacks += 1


def _workflow_boundaries() -> list[tuple[str, WorkflowCommit]]:
    from app.services._auth_session_workflow import (
        commit_demo_login,
        commit_failed_password_login,
        commit_failed_sso_audit,
        commit_logout,
        commit_logout_all,
        commit_refresh_session,
        commit_sso_exchange,
        commit_successful_password_login,
    )

    return [
        ("sso_exchange", commit_sso_exchange),
        ("failed_sso_audit", commit_failed_sso_audit),
        ("refresh_session", commit_refresh_session),
        ("logout", commit_logout),
        ("logout_all", commit_logout_all),
        ("failed_password_login", commit_failed_password_login),
        ("successful_password_login", commit_successful_password_login),
        ("demo_login", commit_demo_login),
    ]


@pytest.mark.parametrize("name,commit_boundary", _workflow_boundaries())
async def test_auth_session_workflow_commits_once(name: str, commit_boundary: WorkflowCommit) -> None:
    db = CommitTrackingSession()

    await commit_boundary(db)

    assert db.commits == 1, name
    assert db.rollbacks == 0, name


@pytest.mark.parametrize("name,commit_boundary", _workflow_boundaries())
async def test_auth_session_workflow_rolls_back_on_commit_failure(
    name: str,
    commit_boundary: WorkflowCommit,
) -> None:
    db = CommitTrackingSession(fail_commit=True)

    with pytest.raises(RuntimeError, match="commit failed"):
        await commit_boundary(db)

    assert db.commits == 1, name
    assert db.rollbacks == 1, name
