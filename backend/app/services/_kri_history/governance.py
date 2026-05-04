from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal, Protocol

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import can_resolve_approvals
from app.models import KeyRiskIndicator, User
from app.models.kri_history import KRIValueHistory
from app.schemas.approval_request import ApprovalQueuedResponse
from app.schemas.kri import (
    KRIHistoryCapabilitiesRead,
    KRIHistoryEdit,
    KRIHistoryEntry,
    KRIHistoryListResponse,
    KRIRecordValue,
    KRIResponse,
)


class KRIValueMutationTarget(Protocol):
    current_value: float | None
    last_period_end: date | None
    last_reported_at: datetime | None


@dataclass(frozen=True)
class KRIValueMutationSnapshot:
    current_value: float | None
    last_period_end: date | None
    last_reported_at: datetime | None


@dataclass(frozen=True)
class KriValueGovernanceOutcome:
    status: Literal["direct_recorded", "approval_queued", "stale_period", "duplicate_period", "blocked"]
    response: KRIResponse | ApprovalQueuedResponse | None = None
    reason: str | None = None


@dataclass(frozen=True)
class KriCorrectionPlan:
    kri: KeyRiskIndicator
    entry: KRIValueHistory
    new_value: float
    reason: str | None


@dataclass(frozen=True)
class KriHistoryProjection:
    response: KRIHistoryListResponse
    total: int
    offset: int
    limit: int


def capture_kri_value_mutation_snapshot(kri: KRIValueMutationTarget) -> KRIValueMutationSnapshot:
    return KRIValueMutationSnapshot(
        current_value=kri.current_value,
        last_period_end=kri.last_period_end,
        last_reported_at=kri.last_reported_at,
    )


def build_kri_value_mutation_changes(
    kri: KRIValueMutationTarget,
    snapshot: KRIValueMutationSnapshot,
) -> dict[str, dict[str, object]]:
    changes: dict[str, dict[str, object]] = {}
    if snapshot.current_value != kri.current_value:
        changes["current_value"] = {"old": snapshot.current_value, "new": kri.current_value}
    if snapshot.last_period_end != kri.last_period_end:
        changes["last_period_end"] = {"old": snapshot.last_period_end, "new": kri.last_period_end}
    if snapshot.last_reported_at != kri.last_reported_at:
        changes["last_reported_at"] = {"old": snapshot.last_reported_at, "new": kri.last_reported_at}
    return changes


def build_kri_value_history_activity_changes(
    *,
    old_value: object,
    new_value: object,
    period_end: date,
) -> dict[str, dict[str, object]]:
    return {
        "value": {"old": old_value, "new": new_value},
        "period_end": {"old": None, "new": period_end.isoformat()},
    }


def describe_kri_limit_breach(
    *,
    value: float,
    lower_limit: float,
    upper_limit: float,
) -> str | None:
    if value < lower_limit:
        return f"Value {value} is below lower limit {lower_limit}"
    if value > upper_limit:
        return f"Value {value} exceeds upper limit {upper_limit}"
    return None


async def record_kri_value_governance(
    *,
    db: AsyncSession,
    kri_id: int,
    data: KRIRecordValue,
    current_user: User,
) -> KRIResponse | ApprovalQueuedResponse:
    from .intake import record_kri_value_intake

    return await record_kri_value_intake(
        db=db,
        kri_id=kri_id,
        data=data,
        current_user=current_user,
    )


async def list_kri_history_projection(
    *,
    db: AsyncSession,
    kri_id: int,
    current_user: User,
    include_archived: bool,
    from_date: date | None,
    to_date: date | None,
    offset: int,
    skip: int | None,
    limit: int,
    page: int | None,
    size: int | None,
    sort_by: str,
    sort_direction: str,
) -> KRIHistoryListResponse:
    from .loading import _load_kri_with_risk_or_404
    from .workflow import ensure_can_read_history, history_capabilities
    from app.services.kri_history_service import KRIHistoryService

    kri = await _load_kri_with_risk_or_404(db, kri_id)
    if kri.is_archived and not include_archived:
        raise HTTPException(status_code=404, detail="KRI not found")
    await ensure_can_read_history(db, current_user, kri)

    effective_limit = size if size is not None else limit
    effective_offset = skip if skip is not None else offset
    if page is not None:
        effective_offset = (page - 1) * effective_limit

    entries, total = await KRIHistoryService.get_history(
        db=db,
        kri_id=kri_id,
        from_date=from_date,
        to_date=to_date,
        offset=effective_offset,
        limit=effective_limit,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    items = []
    for entry in entries:
        item = KRIHistoryEntry.model_validate(entry)
        if entry.recorded_by:
            item.recorded_by_name = entry.recorded_by.name
        items.append(item)

    return KRIHistoryListResponse(
        items=items,
        total=total,
        offset=effective_offset,
        limit=effective_limit,
        capabilities=KRIHistoryCapabilitiesRead(**await history_capabilities(db, current_user, kri)),
    )


async def _create_kri_history_correction_approval(
    db: AsyncSession,
    *,
    kri: KeyRiskIndicator,
    entry: KRIValueHistory,
    entry_id: int,
    data: KRIHistoryEdit,
    current_user: User,
):
    from .approval_intake import create_kri_history_correction_approval

    return await create_kri_history_correction_approval(
        db,
        kri=kri,
        entry=entry,
        entry_id=entry_id,
        data=data,
        current_user=current_user,
    )


async def correct_kri_history_governance(
    *,
    db: AsyncSession,
    kri_id: int,
    entry_id: int,
    data: KRIHistoryEdit,
    current_user: User,
) -> KRIHistoryEntry | ApprovalQueuedResponse:
    from .loading import _load_kri_with_risk_or_404
    from .workflow import ensure_can_request_history_correction
    from app.services.approval_scenario_policy import load_approval_scenario_policy
    from app.services.kri_history_service import KRIHistoryService

    kri = await _load_kri_with_risk_or_404(db, kri_id, for_update=True)
    await ensure_can_request_history_correction(db, current_user, kri)

    entry = (
        await db.execute(
            select(KRIValueHistory).where(KRIValueHistory.id == entry_id, KRIValueHistory.kri_id == kri_id)
        )
    ).scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="History entry not found")

    scenario_policy = await load_approval_scenario_policy(
        db,
        "kri_history_correction",
        default_roles=["cro"],
    )
    if can_resolve_approvals(current_user) or not scenario_policy.requires_approval:
        try:
            updated_entry = await KRIHistoryService.apply_history_correction(
                db=db,
                entry_id=entry_id,
                new_value=data.value,
                corrected_by_id=current_user.id,
            )
            await db.commit()
            await db.refresh(updated_entry)
            return KRIHistoryEntry.model_validate(updated_entry)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    return await _create_kri_history_correction_approval(
        db,
        kri=kri,
        entry=entry,
        entry_id=entry_id,
        data=data,
        current_user=current_user,
    )
