from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ApprovalRequest
from app.services.outbox import OutboxService

TValue = TypeVar("TValue")
DeferredValue = TValue | Callable[[], TValue]
BeforeCommit = Callable[[], Awaitable[None]]


def _resolve_value(value: DeferredValue[TValue]) -> TValue:
    if callable(value):
        return value()
    return value


async def finalize_approval_resolution(
    db: AsyncSession,
    *,
    approval: ApprovalRequest,
    event_type: DeferredValue[str],
    idempotency_key: DeferredValue[str],
    payload: DeferredValue[dict[str, Any]],
    before_commit: BeforeCommit | None = None,
    outbox_service: type[OutboxService] | None = None,
) -> None:
    try:
        if before_commit is not None:
            await before_commit()

        resolved_outbox_service = outbox_service or OutboxService
        await resolved_outbox_service.enqueue(
            db=db,
            event_type=_resolve_value(event_type),
            aggregate_type="approval_request",
            aggregate_id=approval.id,
            idempotency_key=_resolve_value(idempotency_key),
            payload=_resolve_value(payload),
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise
