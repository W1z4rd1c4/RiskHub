from dataclasses import dataclass
from datetime import datetime, timezone

from app.models.quarterly_metric_snapshot import SnapshotType


@dataclass(frozen=True)
class CurrentQuarterSnapshotContext:
    quarter_label: str
    year: int
    quarter_number: int
    department_id: int | None
    snapshot_type: SnapshotType


def get_quarter_label(dt: datetime) -> str:
    """Get quarter label like '2026-Q1' from a datetime."""
    quarter_num = get_quarter_number(dt)
    return f"{dt.year}-Q{quarter_num}"


def get_quarter_number(dt: datetime) -> int:
    """Get quarter number (1-4) from a datetime."""
    return (dt.month - 1) // 3 + 1


def get_quarter_start(year: int, quarter_num: int) -> datetime:
    """Get the start datetime of a quarter."""
    month = (quarter_num - 1) * 3 + 1
    return datetime(year, month, 1, tzinfo=timezone.utc)


def get_quarter_end(year: int, quarter_num: int) -> datetime:
    """Get the end datetime of a quarter (exclusive - start of next quarter)."""
    if quarter_num == 4:
        return datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    return datetime(year, quarter_num * 3 + 1, 1, tzinfo=timezone.utc)


def resolve_snapshot_department_id(department_ids: list[int] | None) -> int | None:
    """Resolve the stored snapshot department id for global or single-department captures."""
    return None if department_ids is None else (department_ids[0] if len(department_ids) == 1 else None)


def resolve_snapshot_type(notes: str | None) -> SnapshotType:
    return SnapshotType.QUARTER_END if notes is None else SnapshotType.MANUAL


def build_current_quarter_snapshot_context(
    *,
    now: datetime,
    department_ids: list[int] | None,
    notes: str | None,
) -> CurrentQuarterSnapshotContext:
    return CurrentQuarterSnapshotContext(
        quarter_label=get_quarter_label(now),
        year=now.year,
        quarter_number=get_quarter_number(now),
        department_id=resolve_snapshot_department_id(department_ids),
        snapshot_type=resolve_snapshot_type(notes),
    )
