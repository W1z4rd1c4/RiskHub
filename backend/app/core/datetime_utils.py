from __future__ import annotations

from datetime import UTC, datetime


def utc_now() -> datetime:
    """Return the current UTC time as a timezone-aware datetime."""
    return datetime.now(UTC)


def coerce_utc(value: datetime | None) -> datetime | None:
    """Coerce a datetime to timezone-aware UTC.

    - None stays None
    - naive datetimes are treated as UTC
    - aware datetimes are converted to UTC
    """
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)

