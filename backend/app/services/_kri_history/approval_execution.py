from __future__ import annotations

from datetime import date, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import activity_logger
from app.core.audit.kri import kri_history_corrected, kri_updated, kri_value_created
from app.models import KeyRiskIndicator, User
from app.models.kri_history import KRIValueHistory

from .governance import build_kri_value_mutation_changes, capture_kri_value_mutation_snapshot
from .service import KRIHistoryService


async def apply_approved_kri_value_submission(
    *,
    db: AsyncSession,
    kri: KeyRiskIndicator,
    value: float,
    old_value: float | None,
    recorded_by: User,
    recorded_at: datetime | None,
    period_end: date,
    approval_id: int,
) -> None:
    mutation_snapshot = capture_kri_value_mutation_snapshot(kri)
    history_entry = await KRIHistoryService.record_value(
        db=db,
        kri=kri,
        value=value,
        recorded_by_id=recorded_by.id,
        recorded_at=recorded_at,
        period_end=period_end,
        is_privileged=False,
        validation_date=recorded_at.date() if recorded_at else None,
    )

    await kri_value_created(
        db,
        kri=kri,
        history_entry=history_entry,
        value=value,
        old_value=old_value,
        actor=recorded_by,
        description=f"Recorded via approval #{approval_id}",
        log_activity_func=activity_logger.log_activity,
    )

    kri_changes = build_kri_value_mutation_changes(kri, mutation_snapshot)
    if kri_changes:
        await kri_updated(
            db,
            actor=recorded_by,
            kri=kri,
            changes=kri_changes,
            description=f"Updated via approval #{approval_id} (value submission)",
            log_activity_func=activity_logger.log_activity,
        )


async def record_approved_kri_current_value_edit(
    *,
    db: AsyncSession,
    kri: KeyRiskIndicator,
    value: float,
    old_value: float | None,
    recorded_by: User,
    approval_id: int,
) -> dict[str, dict[str, object]]:
    mutation_snapshot = capture_kri_value_mutation_snapshot(kri)
    history_entry = await KRIHistoryService.record_value(
        db=db,
        kri=kri,
        value=value,
        recorded_by_id=recorded_by.id,
        is_privileged=True,
    )

    await kri_value_created(
        db,
        kri=kri,
        history_entry=history_entry,
        value=value,
        old_value=old_value,
        actor=recorded_by,
        description=f"Recorded via approval #{approval_id}",
        log_activity_func=activity_logger.log_activity,
    )

    return build_kri_value_mutation_changes(kri, mutation_snapshot)


async def apply_approved_kri_history_correction(
    *,
    db: AsyncSession,
    kri: KeyRiskIndicator,
    entry: KRIValueHistory,
    new_value: float,
    old_value: float,
    corrected_by: User,
    approval_id: int,
) -> None:
    mutation_snapshot = capture_kri_value_mutation_snapshot(kri)
    updated_entry = await KRIHistoryService.apply_history_correction(
        db=db,
        entry_id=entry.id,
        new_value=new_value,
        corrected_by_id=corrected_by.id,
    )

    await kri_history_corrected(
        db,
        kri=kri,
        history_entry=updated_entry,
        actor=corrected_by,
        changes={"value": {"old": old_value, "new": new_value}},
        description=f"Corrected via approval #{approval_id}",
        log_activity_func=activity_logger.log_activity,
    )

    kri_changes = build_kri_value_mutation_changes(kri, mutation_snapshot)
    if kri_changes:
        await kri_updated(
            db,
            actor=corrected_by,
            kri=kri,
            changes=kri_changes,
            description=f"Updated via approval #{approval_id} (history correction)",
            log_activity_func=activity_logger.log_activity,
        )
