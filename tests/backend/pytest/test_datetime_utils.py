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


def test_utc_aware_datetime_serializes_with_utc_offset():
    parsed = _DatetimeBoundaryModel(value="2026-05-06T12:30:00+02:00")

    assert parsed.model_dump_json() == '{"value":"2026-05-06T10:30:00+00:00"}'


def test_sqlalchemy_timestamp_defaults_use_utc_now_directly():
    from app.core.datetime_utils import utc_now
    from app.models.activity_log import ActivityLog
    from app.models.approval_request import ApprovalRequest
    from app.models.issue import Issue
    from app.models.notification import Notification

    timestamp_columns = (
        Issue.__table__.c.opened_at,
        ActivityLog.__table__.c.created_at,
        ApprovalRequest.__table__.c.created_at,
        Notification.__table__.c.created_at,
    )

    for column in timestamp_columns:
        assert column.default is not None
        assert column.default.arg.__module__ == utc_now.__module__
        assert column.default.arg.__name__ == utc_now.__name__
