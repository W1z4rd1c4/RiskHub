from __future__ import annotations

from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.snapshot_service import capture_snapshot_metrics, get_quarter_snapshot

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
) -> tuple[dict, Literal["live", "stored", "missing"]]:
    if snapshot_department_id == "unavailable":
        return {}, "missing"

    if is_live_current_quarter:
        return await capture_snapshot_metrics(db, dept_ids), "live"

    snapshot_record = await get_quarter_snapshot(db, quarter_label, department_id=snapshot_department_id)
    if not snapshot_record:
        return {}, "missing"
    return dict(snapshot_record.metrics or {}), "stored"
