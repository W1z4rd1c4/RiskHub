from datetime import UTC, datetime, timedelta, timezone

import pytest
from pydantic import BaseModel, ValidationError

from app.core.datetime_utils import UtcAwareDatetime


class _DatetimeBoundaryModel(BaseModel):
    value: UtcAwareDatetime | None = None


@pytest.mark.parametrize(
    ("raw_value", "expected"),
    [
        (None, None),
        (datetime(2026, 5, 6, 10, 30), datetime(2026, 5, 6, 10, 30, tzinfo=UTC)),
        (datetime(2026, 5, 6, 10, 30, tzinfo=UTC), datetime(2026, 5, 6, 10, 30, tzinfo=UTC)),
        (
            datetime(2026, 5, 6, 12, 30, tzinfo=timezone(timedelta(hours=2))),
            datetime(2026, 5, 6, 10, 30, tzinfo=UTC),
        ),
        ("2026-05-06T10:30:00Z", datetime(2026, 5, 6, 10, 30, tzinfo=UTC)),
        ("2026-05-06T12:30:00+02:00", datetime(2026, 5, 6, 10, 30, tzinfo=UTC)),
    ],
)
def test_utc_aware_datetime_coerces_boundary_values_to_utc(raw_value, expected):
    parsed = _DatetimeBoundaryModel(value=raw_value)

    assert parsed.value == expected


def test_utc_aware_datetime_rejects_invalid_string():
    with pytest.raises(ValidationError):
        _DatetimeBoundaryModel(value="not-a-datetime")
