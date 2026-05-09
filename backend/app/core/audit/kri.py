from __future__ import annotations

from collections.abc import Mapping

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import log_activity
from app.core.audit.changes import resolve_audit_changes
from app.core.audit.labels import safe_entity_label
from app.core.audit.types import AuditLogActivity
from app.models import KeyRiskIndicator, KRIValueHistory, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.services._kri_history.governance import build_kri_value_history_activity_changes


def kri_display_name(kri: KeyRiskIndicator) -> str:
    return kri.metric_name or safe_entity_label("KRI", kri.id)


def _kri_department_id(kri: KeyRiskIndicator) -> int | None:
    risk = getattr(kri, "risk", None)
    return getattr(risk, "department_id", None)


async def kri_created(
    db: AsyncSession,
    *,
    actor: User,
    kri: KeyRiskIndicator,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await log_activity_func(
        db,
        entity_type=ActivityEntityType.KRI,
        entity_id=kri.id,
        entity_name=kri_display_name(kri),
        safe_entity_label=safe_entity_label("KRI", kri.id),
        action=ActivityAction.CREATE,
        actor=actor,
        department_id=_kri_department_id(kri),
    )


async def kri_updated(
    db: AsyncSession,
    *,
    actor: User,
    kri: KeyRiskIndicator,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    description: str | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await log_activity_func(
        db,
        entity_type=ActivityEntityType.KRI,
        entity_id=kri.id,
        entity_name=kri_display_name(kri),
        safe_entity_label=safe_entity_label("KRI", kri.id),
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=_kri_department_id(kri),
        changes=changes,
        description=description,
    )


async def kri_archived(
    db: AsyncSession,
    *,
    actor: User,
    kri: KeyRiskIndicator,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    description: str | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await log_activity_func(
        db,
        entity_type=ActivityEntityType.KRI,
        entity_id=kri.id,
        entity_name=kri_display_name(kri),
        safe_entity_label=safe_entity_label("KRI", kri.id),
        action=ActivityAction.ARCHIVE,
        actor=actor,
        department_id=_kri_department_id(kri),
        changes=changes,
        description=description,
    )


async def kri_restored(
    db: AsyncSession,
    *,
    actor: User,
    kri: KeyRiskIndicator,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    changes = resolve_audit_changes(changes=changes, before_data=before_data, after_data=after_data)
    await log_activity_func(
        db,
        entity_type=ActivityEntityType.KRI,
        entity_id=kri.id,
        entity_name=kri_display_name(kri),
        safe_entity_label=safe_entity_label("KRI", kri.id),
        safe_description="Restored KRI",
        safe_description_siem="Restored KRI",
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=_kri_department_id(kri),
        changes=changes,
        description=f"Restored KRI {kri.metric_name}",
    )


async def kri_value_created(
    db: AsyncSession,
    *,
    actor: User,
    kri: KeyRiskIndicator,
    history_entry: KRIValueHistory,
    value: float,
    old_value: float | None = None,
    description: str | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    entity_label = f"{kri.metric_name} ({history_entry.period_end.isoformat()})"
    await log_activity_func(
        db,
        entity_type=ActivityEntityType.KRI_VALUE,
        entity_id=history_entry.id,
        entity_name=entity_label,
        safe_entity_label=safe_entity_label("KRI-VALUE", history_entry.id),
        action=ActivityAction.CREATE,
        actor=actor,
        department_id=_kri_department_id(kri),
        changes=build_kri_value_history_activity_changes(
            old_value=old_value,
            new_value=value,
            period_end=history_entry.period_end,
        ),
        description=description,
    )


async def kri_value_mutation_updated(
    db: AsyncSession,
    *,
    actor: User,
    kri: KeyRiskIndicator,
    changes: dict[str, dict[str, object]],
    description: str,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    await log_activity_func(
        db,
        entity_type=ActivityEntityType.KRI,
        entity_id=kri.id,
        entity_name=kri_display_name(kri),
        safe_entity_label=safe_entity_label("KRI", kri.id),
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=_kri_department_id(kri),
        changes=changes,
        description=description,
    )


async def kri_history_corrected(
    db: AsyncSession,
    *,
    actor: User,
    kri: KeyRiskIndicator,
    history_entry: KRIValueHistory,
    changes: dict[str, dict[str, object]] | None,
    description: str | None = None,
    log_activity_func: AuditLogActivity = log_activity,
) -> None:
    entity_label = f"{kri_display_name(kri)} ({history_entry.period_end.isoformat()})"
    await log_activity_func(
        db,
        entity_type=ActivityEntityType.KRI_VALUE,
        entity_id=history_entry.id,
        entity_name=entity_label,
        safe_entity_label=safe_entity_label("KRI-VALUE", history_entry.id),
        action=ActivityAction.UPDATE,
        actor=actor,
        department_id=_kri_department_id(kri),
        changes=changes,
        description=description,
    )
