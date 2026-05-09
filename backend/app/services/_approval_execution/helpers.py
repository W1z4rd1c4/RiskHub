from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.owner_reference_validation import validate_active_owner_reference
from app.models import ApprovalRequest

from .results import SideEffectResult
from .staleness import reject_if_stale_pending_change

MISSING_RESOURCE_REASON = "Resource was deleted before approval could be applied."


@dataclass(frozen=True)
class AppliedFieldChanges:
    applied_changes: dict[str, Any] = field(default_factory=dict)
    rejected_fields: list[str] = field(default_factory=list)
    stale_result: SideEffectResult | None = None


def missing_resource_auto_rejection(
    approval: ApprovalRequest,
    *,
    resource_label: str,
    logger=None,
) -> SideEffectResult:
    if logger is not None:
        logger.warning(
            "Approval #%s: %s %s no longer exists",
            approval.id,
            resource_label,
            approval.resource_id,
        )
    return SideEffectResult.auto_rejected(MISSING_RESOURCE_REASON)


async def apply_whitelisted_pending_changes(
    db: AsyncSession,
    *,
    approval: ApprovalRequest,
    target,
    changes: Mapping[str, Any],
    allowed_fields: set[str],
    owner_field_labels: Mapping[str, str] | None = None,
) -> AppliedFieldChanges:
    stale_result = reject_if_stale_pending_change(
        approval,
        target=target,
        changes=changes,
        allowed_fields=allowed_fields,
    )
    if stale_result is not None:
        return AppliedFieldChanges(stale_result=stale_result)

    applied_changes: dict[str, Any] = {}
    rejected_fields: list[str] = []
    owner_labels = owner_field_labels or {}

    for field_name, values in changes.items():
        if field_name not in allowed_fields:
            rejected_fields.append(field_name)
            continue
        if field_name in owner_labels:
            await validate_active_owner_reference(
                db,
                user_id=values.get("new"),
                label=owner_labels[field_name],
            )
        if hasattr(target, field_name):
            setattr(target, field_name, values.get("new"))
            applied_changes[field_name] = values

    return AppliedFieldChanges(applied_changes=applied_changes, rejected_fields=rejected_fields)
