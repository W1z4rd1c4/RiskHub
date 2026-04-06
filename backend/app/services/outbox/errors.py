"""Typed outbox execution error boundaries."""

from __future__ import annotations


class OutboxError(Exception):
    """Base class for outbox-specific failures."""


class RetryableOutboxError(OutboxError):
    """Transient failure; the event should remain eligible for retry."""


class FatalOutboxError(OutboxError):
    """Deterministic failure; the event should be dead-lettered."""


class OutboxPayloadError(FatalOutboxError):
    """Payload or event-type contract failure."""


class OutboxDependencyError(RetryableOutboxError):
    """External dependency or transport failure."""


class OutboxDomainStateError(FatalOutboxError):
    """Domain object state does not support processing this event."""
