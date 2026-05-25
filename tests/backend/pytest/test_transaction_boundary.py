from __future__ import annotations

import logging

import pytest

from app.services.transaction_boundary import commit_service_boundary


class RecordingSession:
    def __init__(self, *, fail_commit: bool = False) -> None:
        self.fail_commit = fail_commit
        self.commits = 0
        self.rollbacks = 0

    async def commit(self) -> None:
        self.commits += 1
        if self.fail_commit:
            raise RuntimeError("commit failed")

    async def rollback(self) -> None:
        self.rollbacks += 1


@pytest.mark.asyncio
async def test_commit_service_boundary_rolls_back_and_logs_boundary_on_commit_failure(caplog) -> None:
    session = RecordingSession(fail_commit=True)
    caplog.set_level(logging.ERROR, logger="app.services.transaction_boundary")

    with pytest.raises(RuntimeError, match="commit failed"):
        await commit_service_boundary(session, boundary="test_failure_boundary")

    assert session.commits == 1
    assert session.rollbacks == 1
    assert any(
        record.message == "service_transaction.commit_failed"
        and getattr(record, "transaction_boundary", None) == "test_failure_boundary"
        for record in caplog.records
    )


@pytest.mark.asyncio
async def test_commit_service_boundary_commits_once_on_success() -> None:
    session = RecordingSession()

    await commit_service_boundary(session, boundary="test_success_boundary")

    assert session.commits == 1
    assert session.rollbacks == 0
