from __future__ import annotations


class SchedulerJobError(Exception):
    """Base class for scheduler job failures with expected operational meaning."""

    category = "expected"


class RetryableSchedulerJobError(SchedulerJobError):
    """Transient scheduler job failure."""

    category = "retryable"


class FatalSchedulerJobError(SchedulerJobError):
    """Deterministic scheduler job failure."""

    category = "fatal"


def format_scheduler_error(exc: Exception) -> str:
    if isinstance(exc, SchedulerJobError):
        return f"[expected:{exc.category}] {exc}"
    return str(exc)
