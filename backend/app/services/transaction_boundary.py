"""Transitional transaction boundary helpers for endpoint-to-service migration."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Protocol

from app.core.logging import get_logger


class CommitSession(Protocol):
    async def commit(self) -> None: ...

    async def rollback(self) -> None: ...


class DeferredCommitSession(CommitSession, Protocol):
    async def flush(self) -> None: ...


_DEFERRED_COMMIT_SESSIONS: ContextVar[tuple[DeferredCommitSession, ...]] = ContextVar(
    "deferred_service_boundary_commit_sessions",
    default=(),
)


@contextmanager
def defer_service_boundary_commits(db: DeferredCommitSession) -> Iterator[None]:
    """Make service commit boundaries flush-only inside one caller-owned unit of work."""
    token = _DEFERRED_COMMIT_SESSIONS.set((*_DEFERRED_COMMIT_SESSIONS.get(), db))
    try:
        yield
    finally:
        _DEFERRED_COMMIT_SESSIONS.reset(token)


def _deferred_session(db: CommitSession) -> DeferredCommitSession | None:
    return next(
        (session for session in _DEFERRED_COMMIT_SESSIONS.get() if session is db),
        None,
    )


def log_service_transaction_failure(
    event: str,
    *,
    boundary: str,
    error: BaseException,
) -> None:
    """Emit one structured transaction-failure event through the canonical sink."""
    get_logger("service_transaction").exception(
        event,
        transaction_boundary=boundary,
        error_type=type(error).__name__,
        error=str(error),
    )


async def rollback_service_boundary_after_failure(
    db: CommitSession,
    *,
    boundary: str,
) -> None:
    """Rollback without allowing a secondary failure to replace the active error."""
    try:
        await db.rollback()
    except BaseException as rollback_error:
        log_service_transaction_failure(
            "service_transaction.rollback_failed",
            boundary=boundary,
            error=rollback_error,
        )


async def commit_service_boundary(db: CommitSession, *, boundary: str) -> None:
    """Commit a named service-owned transaction boundary and rollback failed commits."""
    deferred_session = _deferred_session(db)
    try:
        if deferred_session is not None:
            await deferred_session.flush()
        else:
            await db.commit()
    except Exception as error:
        log_service_transaction_failure(
            (
                "service_transaction.flush_failed"
                if deferred_session is not None
                else "service_transaction.commit_failed"
            ),
            boundary=boundary,
            error=error,
        )
        await rollback_service_boundary_after_failure(db, boundary=boundary)
        raise


async def commit_service_transaction(db: CommitSession) -> None:
    """Commit a mutation from service-owned code while endpoint commits are retired."""
    await commit_service_boundary(db, boundary="legacy_service_transaction")
