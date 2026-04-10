import logging
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import activity_logger
from app.core.owner_reference_validation import validate_active_owner_reference
from app.models import ApprovalRequest, KeyRiskIndicator, User, VendorKRILink
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.services.kri_vendor_assignment import assign_vendors_to_kri, ensure_vendors_exist, normalize_vendor_ids

from .constants import EDITABLE_FIELDS

logger = logging.getLogger("app.services.approval_execution_service")


async def _apply_edit_kri(
    db: AsyncSession,
    approval: ApprovalRequest,
    current_user: User,
) -> None:
    """Apply pending_changes to KRI.

    Three distinct flows based on pending_changes shape:
    1. History correction: `history_entry_id` present
    2. Value submission: `period_end` and `current_value` present
    3. Generic edit: everything else (+ optional value recording)
    """
    changes = approval.pending_changes
    if not changes:
        return

    result = await db.execute(
        select(KeyRiskIndicator)
        .options(
            selectinload(KeyRiskIndicator.risk),
            selectinload(KeyRiskIndicator.vendor_links).selectinload(VendorKRILink.vendor),
        )
        .where(KeyRiskIndicator.id == approval.resource_id)
    )
    kri = result.scalar_one_or_none()
    if not kri:
        return

    department_id = kri.risk.department_id if kri.risk else None

    # Branch 1: History correction
    if "history_entry_id" in changes:
        await _apply_kri_history_correction(db, kri, changes, current_user, approval.id, department_id)

    # Branch 2: Value submission with period_end
    elif "period_end" in changes and "current_value" in changes:
        await _apply_kri_value_submission(db, kri, changes, current_user, approval.id, department_id)

    # Branch 3: Generic edit (+ optional value recording)
    else:
        await _apply_kri_generic_edit(db, kri, changes, current_user, approval.id, department_id)


async def _apply_kri_history_correction(
    db: AsyncSession,
    kri: KeyRiskIndicator,
    changes: dict,
    current_user: User,
    approval_id: int,
    department_id: int | None,
) -> None:
    """Apply history correction to a KRI history entry."""
    from app.services.kri_history_service import KRIHistoryService

    entry_id = changes.get("history_entry_id")
    new_value = changes.get("new_value")
    old_value = changes.get("old_value")

    if entry_id is None or new_value is None:
        raise HTTPException(status_code=400, detail="Invalid KRI history correction payload")

    # Capture current KRI state for change tracking
    old_kri_current_value = kri.current_value
    old_kri_last_period_end = kri.last_period_end
    old_kri_last_reported_at = kri.last_reported_at

    logger.info(f"Applying KRI history correction: entry {entry_id}, val {new_value}")

    try:
        updated_entry = await KRIHistoryService.apply_history_correction(
            db=db,
            entry_id=entry_id,
            new_value=new_value,
            corrected_by_id=current_user.id,
        )

        # Log KRI_VALUE activity
        await activity_logger.log_activity(
            db,
            entity_type=ActivityEntityType.KRI_VALUE,
            entity_id=entry_id,
            entity_name=f"{kri.metric_name} ({updated_entry.period_end.isoformat()})",
            safe_entity_label=f"{kri.metric_name} ({updated_entry.period_end.isoformat()})",
            action=ActivityAction.UPDATE,
            actor=current_user,
            department_id=department_id,
            changes={"value": {"old": old_value, "new": new_value}},
            description=f"Corrected via approval #{approval_id}",
        )

        # Log KRI changes if any
        kri_changes = _build_kri_changes(kri, old_kri_current_value, old_kri_last_period_end, old_kri_last_reported_at)
        if kri_changes:
            await activity_logger.log_activity(
                db,
                entity_type=ActivityEntityType.KRI,
                entity_id=kri.id,
                entity_name=f"{kri.metric_name}",
                safe_entity_label=kri.metric_name,
                action=ActivityAction.UPDATE,
                actor=current_user,
                department_id=department_id,
                changes=kri_changes,
                description=f"Updated via approval #{approval_id} (history correction)",
            )

    except ValueError as e:
        logger.error(f"KRI history correction failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Unexpected error in KRI history correction approval flow")
        raise HTTPException(status_code=500, detail="Internal server error during KRI approval execution")


async def _apply_kri_value_submission(
    db: AsyncSession,
    kri: KeyRiskIndicator,
    changes: dict,
    current_user: User,
    approval_id: int,
    department_id: int | None,
) -> None:
    """Apply value submission (new history entry) to a KRI."""
    from datetime import date as date_type

    from app.services.kri_history_service import KRIHistoryService

    value_change = changes.get("current_value")
    period_end_str = changes.get("period_end")
    recorded_at_str = changes.get("recorded_at")

    if value_change is None or period_end_str is None:
        raise HTTPException(status_code=400, detail="Invalid KRI value submission payload")

    period_end = date_type.fromisoformat(period_end_str)
    recorded_at = datetime.fromisoformat(recorded_at_str) if recorded_at_str else None

    # Capture current KRI state
    old_kri_current_value = kri.current_value
    old_kri_last_period_end = kri.last_period_end
    old_kri_last_reported_at = kri.last_reported_at

    try:
        logger.info(f"Recording KRI value for approval: {value_change.get('new')}")
        history_entry = await KRIHistoryService.record_value(
            db=db,
            kri=kri,
            value=value_change.get("new"),
            recorded_by_id=current_user.id,
            recorded_at=recorded_at,
            period_end=period_end,
            is_privileged=True,
        )

        # Log KRI_VALUE creation
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
                "period_end": {"old": None, "new": period_end.isoformat()},
            },
            description=f"Recorded via approval #{approval_id}",
        )

        # Log KRI changes if any
        kri_changes = _build_kri_changes(kri, old_kri_current_value, old_kri_last_period_end, old_kri_last_reported_at)
        if kri_changes:
            await activity_logger.log_activity(
                db,
                entity_type=ActivityEntityType.KRI,
                entity_id=kri.id,
                entity_name=f"{kri.metric_name}",
                safe_entity_label=kri.metric_name,
                action=ActivityAction.UPDATE,
                actor=current_user,
                department_id=department_id,
                changes=kri_changes,
                description=f"Updated via approval #{approval_id} (value submission)",
            )

    except ValueError as e:
        logger.error(f"KRI value recording failed (submit): {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Unexpected error in KRI value submission approval flow")
        raise HTTPException(status_code=500, detail="Internal server error during KRI approval execution")


async def _apply_kri_generic_edit(
    db: AsyncSession,
    kri: KeyRiskIndicator,
    changes: dict,
    current_user: User,
    approval_id: int,
    department_id: int | None,
) -> None:
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

    # Apply non-value field changes with whitelist enforcement
    for field, vals in changes.items():
        mapped_field = legacy_field_aliases.get(field, field)
        if mapped_field == "current_value":
            continue  # Handled separately by KRIHistoryService
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

    # Log rejected fields (security audit, no values logged)
    if rejected_fields:
        logger.warning(f"Approval #{approval_id}: Rejected non-whitelisted fields for KRI: {rejected_fields}")

    # Handle optional value recording
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

            # Log KRI_VALUE creation
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

            # Track KRI field changes from value recording
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

    # Log KRI field changes
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


def _build_kri_changes(
    kri: KeyRiskIndicator,
    old_current_value,
    old_last_period_end,
    old_last_reported_at,
) -> dict:
    """Build a changes dict for KRI field tracking."""
    changes: dict[str, dict[str, object]] = {}
    if old_current_value != kri.current_value:
        changes["current_value"] = {"old": old_current_value, "new": kri.current_value}
    if old_last_period_end != kri.last_period_end:
        changes["last_period_end"] = {"old": old_last_period_end, "new": kri.last_period_end}
    if old_last_reported_at != kri.last_reported_at:
        changes["last_reported_at"] = {"old": old_last_reported_at, "new": kri.last_reported_at}
    return changes
