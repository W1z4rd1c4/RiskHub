"""Transitional transaction boundary helpers for endpoint-to-service migration."""

from __future__ import annotations

import logging
from typing import Protocol

logger = logging.getLogger(__name__)


class CommitSession(Protocol):
    async def commit(self) -> None: ...

    async def rollback(self) -> None: ...


async def commit_service_boundary(db: CommitSession, *, boundary: str) -> None:
    """Commit a named service-owned transaction boundary and rollback failed commits."""
    try:
        await db.commit()
    except Exception:
        logger.exception(
            "service_transaction.commit_failed",
            extra={"transaction_boundary": boundary},
        )
        await db.rollback()
        raise


async def commit_service_transaction(db: CommitSession) -> None:
    """Commit a mutation from service-owned code while endpoint commits are retired."""
    await commit_service_boundary(db, boundary="legacy_service_transaction")
