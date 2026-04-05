"""Compatibility facade for the transactional outbox package."""

from app.services.outbox import (
    OUTBOX_BATCH_SIZE,
    OUTBOX_DISPATCH_INTERVAL_SECONDS,
    OUTBOX_MAX_ATTEMPTS,
    OUTBOX_RECLAIM_AFTER,
    OutboxService,
    dispatch_pending_outbox_events,
)

__all__ = [
    "OUTBOX_BATCH_SIZE",
    "OUTBOX_DISPATCH_INTERVAL_SECONDS",
    "OUTBOX_MAX_ATTEMPTS",
    "OUTBOX_RECLAIM_AFTER",
    "OutboxService",
    "dispatch_pending_outbox_events",
]
