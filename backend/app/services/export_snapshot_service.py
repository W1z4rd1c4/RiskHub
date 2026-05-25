from __future__ import annotations

from datetime import UTC, date, datetime, time
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.models.activity_log import ActivityAction, ActivityEntityType, ActivityLog


class ExportSnapshotService:
    """
    Reconstruct point-in-time rows for exports using ActivityLog reverse replay.
    """

    @staticmethod
    def as_of_cutoff(as_of_date: date | None) -> datetime:
        target_date = as_of_date or utc_now().date()
        return datetime.combine(target_date, time.max).replace(tzinfo=UTC)

    @staticmethod
    async def apply_as_of_snapshot(
        db: AsyncSession,
        *,
        rows: list[dict[str, Any]],
        entity_type: ActivityEntityType,
        as_of_date: date | None,
        id_key: str = "id",
    ) -> list[dict[str, Any]]:
        """
        Reverse-replay changes newer than as_of cutoff.
        """
        cutoff = ExportSnapshotService.as_of_cutoff(as_of_date)
        now = utc_now()
        if cutoff >= now or not rows:
            return rows

        row_map = {int(row[id_key]): dict(row) for row in rows if row.get(id_key) is not None}
        if not row_map:
            return rows

        result = await db.execute(
            select(ActivityLog)
            .where(
                ActivityLog.entity_type == entity_type.value,
                ActivityLog.entity_id.in_(list(row_map.keys())),
                ActivityLog.created_at > cutoff,
            )
            .order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc())
        )
        logs = result.scalars().all()

        for log in logs:
            entity_id = int(log.entity_id)
            row = row_map.get(entity_id)

            # Created after cutoff => remove from historical snapshot.
            if log.action == ActivityAction.CREATE.value:
                row_map.pop(entity_id, None)
                continue

            if row is None:
                continue

            changes = log.changes or {}
            if changes:
                for field, change in changes.items():
                    if not isinstance(change, dict) or "old" not in change:
                        continue
                    if field in row:
                        row[field] = change.get("old")
                continue

            # Fallback for archive events logged without explicit changes.
            if log.action in (ActivityAction.ARCHIVE.value, ActivityAction.DELETE.value):
                ExportSnapshotService._undo_archive_without_change_set(row, entity_type)

        return list(row_map.values())

    @staticmethod
    def _undo_archive_without_change_set(row: dict[str, Any], entity_type: ActivityEntityType) -> None:
        if entity_type in (ActivityEntityType.RISK, ActivityEntityType.CONTROL, ActivityEntityType.VENDOR):
            row["is_archived"] = False
            row["archived_at"] = None
            row["archived_by_id"] = None
            if row.get("status") in {"archived", "inactive"}:
                row["status"] = "active"
            return

        if entity_type == ActivityEntityType.KRI:
            row["is_archived"] = False
            row["archived_at"] = None
            row["archived_by_id"] = None
            row["status"] = "active"
