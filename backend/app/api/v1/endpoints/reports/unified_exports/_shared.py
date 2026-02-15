from datetime import UTC, date, datetime, time
from typing import Any, Literal

from app.core.datetime_utils import coerce_utc
from app.models import Issue

ExportFormat = Literal["xlsx", "csv"]
KRIExportStatus = Literal["all", "within", "breach", "overdue", "archived"]


def _contains(haystack: Any, needle: str) -> bool:
    if haystack is None:
        return False
    return needle in str(haystack).lower()


def _safe_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _unique_ids(rows: list[dict[str, Any]], id_field: str) -> list[int]:
    values = {
        _safe_int(row.get(id_field))
        for row in rows
        if row.get(id_field) is not None and _safe_int(row.get(id_field)) > 0
    }
    return sorted(values)


def _as_of_datetime(as_of_date: date) -> datetime:
    return datetime.combine(as_of_date, time.max, tzinfo=UTC)


def _latest_exception(issue: Issue):
    if not issue.exceptions:
        return None
    return max(
        issue.exceptions,
        key=lambda ex: coerce_utc(ex.approved_at)
        or coerce_utc(ex.requested_at)
        or coerce_utc(ex.created_at)
        or datetime.min.replace(tzinfo=UTC),
    )


def _joined(values: list[str]) -> str:
    cleaned = [value.strip() for value in values if value and value.strip()]
    return "; ".join(sorted(set(cleaned)))


def _enum_value(value: Any) -> Any:
    return value.value if hasattr(value, "value") else value

