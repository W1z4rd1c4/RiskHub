from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from pydantic import AfterValidator, PlainSerializer


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


def _validate_utc_aware_datetime(value: datetime) -> datetime:
    coerced = coerce_utc(value)
    if coerced is None:
        raise ValueError("datetime value is required")
    return coerced


UtcAwareDatetime = Annotated[
    datetime,
    AfterValidator(_validate_utc_aware_datetime),
    PlainSerializer(lambda value: value.isoformat(), return_type=str, when_used="json"),
]
