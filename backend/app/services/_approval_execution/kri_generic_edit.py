from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import activity_logger
from app.core.audit.kri import kri_updated
from app.core.exceptions import ValidationError
from app.core.owner_reference_validation import validate_active_owner_reference
from app.models import ApprovalRequest, KeyRiskIndicator, User
from app.services._kri_history.approval_execution import record_approved_kri_current_value_edit
from app.services._vendor_links.kri_assignment import apply_kri_vendor_assignment_change, normalize_vendor_ids

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
            requested_vendor_ids, vendor_changes = await apply_kri_vendor_assignment_change(
                db,
                kri=kri,
                current_user=current_user,
                requested_vendor_ids=(vals or {}).get("new"),
                current_vendor_ids=current_vendor_ids,
            )
            applied_changes.update(vendor_changes)
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
        logger.warning("Approval #%s: Rejected non-whitelisted fields for KRI: %s", approval_id, rejected_fields)

    if value_change is not None:
        try:
            applied_changes.update(
                await record_approved_kri_current_value_edit(
                    db=db,
                    kri=kri,
                    value=value_change.get("new"),
                    old_value=value_change.get("old"),
                    recorded_by=current_user,
                    approval_id=approval_id,
                )
            )
        except ValueError as e:
            logger.error("Failed to record value during approval: %s", str(e))
            raise ValidationError(f"KRI value recording failed: {str(e)}")

    if applied_changes:
        await kri_updated(
            db,
            actor=current_user,
            kri=kri,
            changes=applied_changes,
            description=f"Updated via approval #{approval_id}",
            log_activity_func=activity_logger.log_activity,
        )
    return SideEffectResult.applied()
