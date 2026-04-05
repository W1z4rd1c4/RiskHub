"""Transactional outbox package split by responsibility."""

from app.services.outbox.dispatcher import dispatch_pending_outbox_events
from app.services.outbox.store import (
    OUTBOX_BATCH_SIZE,
    OUTBOX_DISPATCH_INTERVAL_SECONDS,
    OUTBOX_MAX_ATTEMPTS,
    OUTBOX_RECLAIM_AFTER,
    OutboxService,
)

__all__ = [
    "OUTBOX_BATCH_SIZE",
    "OUTBOX_DISPATCH_INTERVAL_SECONDS",
    "OUTBOX_MAX_ATTEMPTS",
    "OUTBOX_RECLAIM_AFTER",
    "OutboxService",
    "dispatch_pending_outbox_events",
]
