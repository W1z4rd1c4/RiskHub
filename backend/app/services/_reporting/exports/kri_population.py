"""KRI export adapters: replay authorized parent facts, then classify centrally."""

from datetime import date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.activity_redaction import REDACTED_VALUE
from app.core.permissions import risk_visibility_clause
from app.models import Risk, User
from app.models.activity_log import ActivityEntityType
from app.services.export_snapshot_service import ExportSnapshotService
from app.services.kri_populations import KRIPopulationState, RiskPopulationState

from .shared import _safe_int


def population_state(row: dict[str, Any]) -> KRIPopulationState:
    last = row.get("last_period_end")
    if isinstance(last, str):
        try:
            last = date.fromisoformat(last)
        except ValueError:
            last = None
    if isinstance(last, datetime):
        last = last.date()
    parent = None
    if isinstance(row.get("risk_is_archived"), bool) and isinstance(row.get("risk_status"), str):
        parent = RiskPopulationState(is_archived=row["risk_is_archived"], status=row["risk_status"])
    return KRIPopulationState(
        is_archived=bool(row.get("is_archived")),
        risk=parent,
        frequency=str(row.get("frequency") or "quarterly"),
        last_period_end=last if isinstance(last, date) else None,
    )


async def apply_kri_parent_snapshot(
    db: AsyncSession, rows: list[dict[str, Any]], *, current_user: User, as_of_date: date
) -> list[dict[str, Any]]:
    """Bind the replay-selected parent, without resurrecting unreadable context.

    Missing, currently forbidden or post-cutoff-created parents cannot establish
    a historical KRI population. Never substitute the original/current parent.
    """
    ids = {_safe_int(row.get("risk_id")) for row in rows}
    if not ids:
        return []
    query = select(Risk).where(Risk.id.in_(ids)).options(selectinload(Risk.department))
    visibility = await risk_visibility_clause(db, current_user)
    if visibility is not None:
        query = query.where(visibility)
    parents = (await db.execute(query)).scalars().all()
    parent_rows = [
        {
            "id": risk.id,
            "is_archived": bool(risk.is_archived),
            "status": risk.status,
            "name": risk.name,
            "risk_id_code": risk.risk_id_code,
            "owner_id": risk.owner_id,
            "department_id": risk.department_id,
            "department_name": risk.department.name if risk.department else None,
        }
        for risk in parents
    ]
    replayed = await ExportSnapshotService.apply_as_of_snapshot(
        db, rows=parent_rows, entity_type=ActivityEntityType.RISK, as_of_date=as_of_date
    )
    by_id = {row["id"]: row for row in replayed}
    result = []
    for row in rows:
        parent = by_id.get(_safe_int(row.get("risk_id")))
        if parent is None:
            continue
        # Redacted/malformed replay facts are unavailable, not evidence of an
        # active historical parent or a never-reported KRI.
        if not isinstance(parent.get("is_archived"), bool):
            continue
        # Explicitly unavailable strings are different from supported legacy
        # values (whose canonical status/frequency fallback remains intact).
        if any(
            not isinstance(value, str) or not value.strip() or value == REDACTED_VALUE
            for value in (parent.get("status"), row.get("frequency"))
        ):
            continue
        if not isinstance(row.get("is_archived"), bool):
            continue
        last = row.get("last_period_end")
        if isinstance(last, str):
            try:
                last = date.fromisoformat(last)
            except ValueError:
                continue
        if last is not None and (not isinstance(last, date) or isinstance(last, datetime)):
            continue
        row["last_period_end"] = last
        # Overwrite all derived context after KRI replay: an audit payload must
        # not inject attributes belonging to a different or forbidden Risk.
        row.update(
            risk_is_archived=parent["is_archived"],
            risk_status=parent["status"],
            risk_name=parent["name"],
            risk_id_code=parent["risk_id_code"],
            risk_owner_id=parent["owner_id"],
            department_id=parent["department_id"],
            department_name=parent["department_name"],
        )
        result.append(row)
    return result
