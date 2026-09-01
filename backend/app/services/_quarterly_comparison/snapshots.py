from __future__ import annotations

from datetime import datetime
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import coerce_utc
from app.core.snapshot_service import (
    SNAPSHOT_METRIC_DEFINITION_IDS,
    SNAPSHOT_METRIC_DEFINITIONS_KEY,
    capture_snapshot_metrics,
    get_quarter_snapshot,
)
from app.models.quarterly_metric_snapshot import SnapshotType

SnapshotDepartmentId = int | None | Literal["unavailable"]


def resolve_snapshot_department_id(dept_ids: list[int] | None) -> SnapshotDepartmentId:
    if dept_ids is None:
        return None
    if len(dept_ids) == 1:
        return dept_ids[0]
    return "unavailable"


async def resolve_snapshot_metrics(
    db: AsyncSession,
    *,
    quarter_label: str,
    is_live_current_quarter: bool,
    dept_ids: list[int] | None,
    snapshot_department_id: SnapshotDepartmentId,
) -> tuple[
    dict,
    Literal["live", "stored", "missing"],
    datetime | None,
    SnapshotType | None,
    dict[str, str],
]:
    if snapshot_department_id == "unavailable":
        return {}, "missing", None, None, {}

    if is_live_current_quarter:
        return (
            await capture_snapshot_metrics(db, dept_ids),
            "live",
            None,
            None,
            dict(SNAPSHOT_METRIC_DEFINITION_IDS),
        )

    snapshot_record = await get_quarter_snapshot(db, quarter_label, department_id=snapshot_department_id)
    if not snapshot_record:
        return {}, "missing", None, None, {}
    metrics = dict(snapshot_record.metrics or {})
    metric_definitions = metrics.pop(SNAPSHOT_METRIC_DEFINITIONS_KEY, {})
    return (
        metrics,
        "stored",
        coerce_utc(snapshot_record.captured_at),
        snapshot_record.snapshot_type,
        metric_definitions if isinstance(metric_definitions, dict) else {},
    )
