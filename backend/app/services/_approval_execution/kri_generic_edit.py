from __future__ import annotations

import logging

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import activity_logger
from app.core.owner_reference_validation import validate_active_owner_reference
from app.models import ApprovalRequest, KeyRiskIndicator, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.services.kri_vendor_assignment import assign_vendors_to_kri, ensure_vendors_exist, normalize_vendor_ids

from .constants import EDITABLE_FIELDS
from .results import SideEffectResult
from .staleness import reject_if_stale_pending_change, reject_if_stale_value

logger = logging.getLogger("app.services.approval_execution_service")


async def _apply_kri_generic_edit(
    db: AsyncSession,
    approval: ApprovalRequest,
    kri: KeyRiskIndicator,
    changes: dict,
    current_user: User,
    approval_id: int,
    department_id: int | None,
) -> SideEffectResult:
    """Apply generic field edits to a KRI, with optional value recording."""
    from app.services.kri_history_service import KRIHistoryService

    value_change = changes.get("current_value")
    allowed_fields = EDITABLE_FIELDS.get("kri", set())
    applied_changes: dict = {}
    rejected_fields: list[str] = []
    current_vendor_ids = sorted(link.vendor_id for link in getattr(kri, "vendor_links", []) or [])
    legacy_field_aliases = {
        "measurement_unit": "unit",
        "reporting_frequency": "frequency",
    }

    for field, vals in changes.items():
        mapped_field = legacy_field_aliases.get(field, field)
        if mapped_field != "linked_vendor_ids":
            continue
        stale_result = reject_if_stale_value(
            approval,
            field="linked_vendor_ids",
            current_value=current_vendor_ids,
            expected_value=normalize_vendor_ids((vals or {}).get("old")),
        )
        if stale_result is not None:
            return stale_result
        break

    stale_result = reject_if_stale_pending_change(
        approval,
        target=kri,
        changes=changes,
        allowed_fields=allowed_fields - {"linked_vendor_ids", "current_value"},
        field_aliases=legacy_field_aliases,
    )
    if stale_result is not None:
        return stale_result

    for field, vals in changes.items():
        mapped_field = legacy_field_aliases.get(field, field)
        if mapped_field == "current_value":
            continue
        if mapped_field == "linked_vendor_ids":
            requested_vendor_ids = normalize_vendor_ids((vals or {}).get("new"))
            await ensure_vendors_exist(db, requested_vendor_ids)
            await assign_vendors_to_kri(
                db,
                kri=kri,
                linked_vendor_ids=requested_vendor_ids,
            )
            if requested_vendor_ids != current_vendor_ids:
                applied_changes["linked_vendor_ids"] = {
                    "old": current_vendor_ids,
                    "new": requested_vendor_ids,
                }
            current_vendor_ids = requested_vendor_ids
            continue
        if mapped_field not in allowed_fields:
            rejected_fields.append(field)
            continue
        if mapped_field == "reporting_owner_id":
            await validate_active_owner_reference(
                db,
                user_id=vals.get("new"),
                label="Reporting owner",
            )
        if hasattr(kri, mapped_field):
            setattr(kri, mapped_field, vals.get("new"))
            applied_changes[mapped_field] = {
                "old": vals.get("old"),
                "new": vals.get("new"),
            }

    if rejected_fields:
        logger.warning(f"Approval #{approval_id}: Rejected non-whitelisted fields for KRI: {rejected_fields}")

    if value_change is not None:
        old_kri_current_value = kri.current_value
        old_kri_last_period_end = kri.last_period_end
        old_kri_last_reported_at = kri.last_reported_at

        try:
            history_entry = await KRIHistoryService.record_value(
                db=db,
                kri=kri,
                value=value_change.get("new"),
                recorded_by_id=current_user.id,
                is_privileged=True,
            )

            await activity_logger.log_activity(
                db,
                entity_type=ActivityEntityType.KRI_VALUE,
                entity_id=history_entry.id,
                entity_name=f"{kri.metric_name} ({history_entry.period_end.isoformat()})",
                safe_entity_label=f"{kri.metric_name} ({history_entry.period_end.isoformat()})",
                action=ActivityAction.CREATE,
                actor=current_user,
                department_id=department_id,
                changes={
                    "value": {"old": value_change.get("old"), "new": value_change.get("new")},
                    "period_end": {"old": None, "new": history_entry.period_end.isoformat()},
                },
                description=f"Recorded via approval #{approval_id}",
            )

            if old_kri_current_value != kri.current_value:
                applied_changes["current_value"] = {
                    "old": old_kri_current_value,
                    "new": kri.current_value,
                }
            if old_kri_last_period_end != kri.last_period_end:
                applied_changes["last_period_end"] = {
                    "old": old_kri_last_period_end,
                    "new": kri.last_period_end,
                }
            if old_kri_last_reported_at != kri.last_reported_at:
                applied_changes["last_reported_at"] = {
                    "old": old_kri_last_reported_at,
                    "new": kri.last_reported_at,
                }

        except ValueError as e:
            logger.error(f"Failed to record value during approval: {str(e)}")
            raise HTTPException(status_code=400, detail=f"KRI value recording failed: {str(e)}")

    if applied_changes:
        await activity_logger.log_activity(
            db,
            entity_type=ActivityEntityType.KRI,
            entity_id=kri.id,
            entity_name=f"{kri.metric_name}",
            safe_entity_label=kri.metric_name,
            action=ActivityAction.UPDATE,
            actor=current_user,
            department_id=department_id,
            changes=applied_changes,
            description=f"Updated via approval #{approval_id}",
        )
    return SideEffectResult.applied()
