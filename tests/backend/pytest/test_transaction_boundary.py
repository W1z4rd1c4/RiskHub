from __future__ import annotations

import asyncio

import pytest
from structlog.testing import capture_logs

from app.core.logging import configure_logging_from_snapshot, get_active_logging_config
from app.services.transaction_boundary import (
    commit_service_boundary,
    defer_service_boundary_commits,
)


class RecordingSession:
    def __init__(
        self,
        *,
        fail_commit: bool = False,
        fail_flush: bool = False,
        fail_rollback: bool = False,
    ) -> None:
        self.fail_commit = fail_commit
        self.fail_flush = fail_flush
        self.fail_rollback = fail_rollback
        self.commits = 0
        self.flushes = 0
        self.rollbacks = 0

    async def commit(self) -> None:
        self.commits += 1
        if self.fail_commit:
            raise RuntimeError("commit failed")

    async def flush(self) -> None:
        self.flushes += 1
        if self.fail_flush:
            raise RuntimeError("flush failed")

    async def rollback(self) -> None:
        self.rollbacks += 1
        if self.fail_rollback:
            raise RuntimeError("rollback failed")


def assert_failure_event(
    events: list[dict[str, object]],
    *,
    event: str,
    boundary: str,
    error: str,
) -> None:
    matches = [entry for entry in events if entry.get("event") == event]
    assert matches == [
        {
            "event": event,
            "transaction_boundary": boundary,
            "error_type": "RuntimeError",
            "error": error,
            "exc_info": True,
            "log_level": "error",
        }
    ]


@pytest.mark.asyncio
async def test_failure_event_capture_survives_prior_canonical_logger_use() -> None:
    original_logging_config = get_active_logging_config()
    priming_session = RecordingSession(fail_commit=True)
    with pytest.raises(RuntimeError, match="commit failed"):
        await commit_service_boundary(priming_session, boundary="prime_cached_logger")

    captured_session = RecordingSession(fail_commit=True)
    try:
        configure_logging_from_snapshot(original_logging_config)
        with capture_logs() as events:
            with pytest.raises(RuntimeError, match="commit failed"):
                await commit_service_boundary(
                    captured_session,
                    boundary="capture_after_cached_logger_use",
                )
    finally:
        configure_logging_from_snapshot(original_logging_config)

    assert_failure_event(
        events,
        event="service_transaction.commit_failed",
        boundary="capture_after_cached_logger_use",
        error="commit failed",
    )


@pytest.mark.asyncio
async def test_commit_service_boundary_rolls_back_and_logs_boundary_on_commit_failure(
) -> None:
    session = RecordingSession(fail_commit=True)

    with capture_logs() as events:
        with pytest.raises(RuntimeError, match="commit failed"):
            await commit_service_boundary(session, boundary="test_failure_boundary")

    assert session.commits == 1
    assert session.rollbacks == 1
    assert_failure_event(
        events,
        event="service_transaction.commit_failed",
        boundary="test_failure_boundary",
        error="commit failed",
    )


@pytest.mark.asyncio
async def test_commit_service_boundary_commits_once_on_success() -> None:
    session = RecordingSession()

    await commit_service_boundary(session, boundary="test_success_boundary")

    assert session.commits == 1
    assert session.rollbacks == 0


@pytest.mark.asyncio
async def test_deferred_service_boundary_flushes_and_rolls_back_a_failed_flush(
) -> None:
    session = RecordingSession(fail_flush=True)

    with capture_logs() as events:
        with pytest.raises(RuntimeError, match="flush failed"):
            with defer_service_boundary_commits(session):
                await commit_service_boundary(session, boundary="test_deferred_boundary")

    assert session.flushes == 1
    assert session.commits == 0
    assert session.rollbacks == 1
    assert_failure_event(
        events,
        event="service_transaction.flush_failed",
        boundary="test_deferred_boundary",
        error="flush failed",
    )


@pytest.mark.asyncio
async def test_commit_failure_remains_primary_when_rollback_also_fails() -> None:
    session = RecordingSession(fail_commit=True, fail_rollback=True)

    with capture_logs() as events:
        with pytest.raises(RuntimeError, match="commit failed"):
            await commit_service_boundary(session, boundary="commit_then_rollback_failure")

    assert session.commits == 1
    assert session.rollbacks == 1
    assert_failure_event(
        events,
        event="service_transaction.rollback_failed",
        boundary="commit_then_rollback_failure",
        error="rollback failed",
    )


@pytest.mark.asyncio
async def test_flush_failure_remains_primary_when_rollback_also_fails() -> None:
    session = RecordingSession(fail_flush=True, fail_rollback=True)

    with capture_logs() as events:
        with pytest.raises(RuntimeError, match="flush failed"):
            with defer_service_boundary_commits(session):
                await commit_service_boundary(
                    session, boundary="flush_then_rollback_failure"
                )

    assert session.flushes == 1
    assert session.rollbacks == 1
    assert_failure_event(
        events,
        event="service_transaction.rollback_failed",
        boundary="flush_then_rollback_failure",
        error="rollback failed",
    )


@pytest.mark.asyncio
async def test_nested_same_session_scope_preserves_outer_deferral() -> None:
    session = RecordingSession()

    with defer_service_boundary_commits(session):
        await commit_service_boundary(session, boundary="outer_before_inner")
        with defer_service_boundary_commits(session):
            await commit_service_boundary(session, boundary="inner")
        await commit_service_boundary(session, boundary="outer_after_inner")

    await commit_service_boundary(session, boundary="after_outer")

    assert session.flushes == 3
    assert session.commits == 1


@pytest.mark.asyncio
async def test_nested_distinct_sessions_restore_context_across_tasks() -> None:
    outer_session = RecordingSession()
    inner_session = RecordingSession()
    unrelated_session = RecordingSession()

    with defer_service_boundary_commits(outer_session):
        await commit_service_boundary(outer_session, boundary="outer_before_inner")
        await commit_service_boundary(inner_session, boundary="inner_before_scope")
        with defer_service_boundary_commits(inner_session):
            await asyncio.gather(
                asyncio.create_task(
                    commit_service_boundary(outer_session, boundary="outer_in_inner")
                ),
                asyncio.create_task(
                    commit_service_boundary(inner_session, boundary="inner_in_inner")
                ),
            )
            await commit_service_boundary(unrelated_session, boundary="unrelated")
        await commit_service_boundary(outer_session, boundary="outer_after_inner")
        await commit_service_boundary(inner_session, boundary="inner_after_scope")

    await commit_service_boundary(outer_session, boundary="outer_after_scope")

    assert outer_session.flushes == 3
    assert outer_session.commits == 1
    assert inner_session.flushes == 1
    assert inner_session.commits == 2
    assert unrelated_session.flushes == 0
    assert unrelated_session.commits == 1
