from __future__ import annotations

from datetime import UTC, date, datetime, time
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.models.activity_log import ActivityAction, ActivityEntityType, ActivityLog
from app.models.kri_history import KRIValueHistory


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
    async def apply_kri_value_as_of(
        db: AsyncSession,
        *,
        rows: list[dict[str, Any]],
        as_of_date: date | None,
        id_key: str = "id",
    ) -> list[dict[str, Any]]:
        target_date = as_of_date or utc_now().date()
        kri_ids = [int(row[id_key]) for row in rows if row.get(id_key) is not None]
        if not kri_ids:
            return rows

        result = await db.execute(
            select(KRIValueHistory)
            .where(
                KRIValueHistory.kri_id.in_(kri_ids),
                KRIValueHistory.period_end <= target_date,
            )
            .order_by(
                KRIValueHistory.kri_id.asc(),
                KRIValueHistory.period_end.desc(),
                KRIValueHistory.recorded_at.desc(),
            )
        )
        entries = result.scalars().all()

        latest_by_kri: dict[int, KRIValueHistory] = {}
        for entry in entries:
            if entry.kri_id not in latest_by_kri:
                latest_by_kri[entry.kri_id] = entry

        for row in rows:
            kri_id = row.get(id_key)
            if kri_id is None:
                continue
            latest_entry = latest_by_kri.get(int(kri_id))
            if latest_entry is None:
                continue
            row["current_value"] = latest_entry.value
            row["lower_limit"] = latest_entry.lower_limit
            row["upper_limit"] = latest_entry.upper_limit
            row["unit"] = latest_entry.unit
            row["breach_status"] = latest_entry.breach_status
            row["last_period_end"] = latest_entry.period_end
            row["last_reported_at"] = latest_entry.recorded_at

        return rows

    @staticmethod
    def _undo_archive_without_change_set(row: dict[str, Any], entity_type: ActivityEntityType) -> None:
        if entity_type in (ActivityEntityType.RISK, ActivityEntityType.CONTROL):
            if row.get("status") in {"archived", "inactive"}:
                row["status"] = "active"
            return

        if entity_type == ActivityEntityType.KRI:
            row["is_archived"] = False
            row["archived_at"] = None
            row["archived_by_id"] = None
            row["status"] = "active"
            return

        if entity_type == ActivityEntityType.VENDOR:
            if row.get("status") == "inactive":
                row["status"] = "active"
