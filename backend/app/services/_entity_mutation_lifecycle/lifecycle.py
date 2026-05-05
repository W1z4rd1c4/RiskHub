from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.services._entity_mutation_lifecycle.approval_plans import (
    create_control_edit_approval_if_required,
    create_kri_edit_approval_if_required,
    create_risk_edit_approval_if_required,
)
from app.services._entity_mutation_lifecycle.archive_plans import (
    archive_control_detail,
    archive_kri_detail,
    archive_risk_detail,
)
from app.services._entity_mutation_lifecycle.contracts import (
    EntityApprovalPlan,
    EntityDirectApplyPlan,
    EntityMutationKind,
    EntityMutationOptions,
    EntityMutationOutcome,
)
from app.services._entity_mutation_lifecycle.direct_apply import (
    apply_control_update_directly,
    apply_kri_update_directly,
    apply_risk_update_directly,
)
from app.services._entity_mutation_lifecycle.policy import (
    prepare_control_update,
    prepare_kri_update,
    prepare_risk_update,
)


async def update_risk_detail(
    *,
    db: AsyncSession,
    risk_id: int,
    update_data: dict[str, Any],
    current_user: User,
) -> EntityMutationOutcome:
    risk = await prepare_risk_update(db, risk_id=risk_id, update_data=update_data, current_user=current_user)
    approval_outcome = await create_risk_edit_approval_if_required(
        db,
        risk=risk,
        update_data=update_data,
        current_user=current_user,
    )
    if approval_outcome is not None:
        return approval_outcome
    return await apply_risk_update_directly(db, risk=risk, update_data=update_data, current_user=current_user)


async def update_control_detail(
    *,
    db: AsyncSession,
    control_id: int,
    update_data: dict[str, Any],
    current_user: User,
) -> EntityMutationOutcome:
    control, is_owner = await prepare_control_update(
        db,
        control_id=control_id,
        update_data=update_data,
        current_user=current_user,
    )
    approval_outcome = await create_control_edit_approval_if_required(
        db,
        control=control,
        current_user=current_user,
        update_data=update_data,
        is_owner=is_owner,
    )
    if approval_outcome is not None:
        return approval_outcome
    return await apply_control_update_directly(db, control=control, update_data=update_data, current_user=current_user)


async def update_kri_detail(
    *,
    db: AsyncSession,
    kri_id: int,
    update_data: dict[str, Any],
    current_user: User,
) -> EntityMutationOutcome:
    kri, normalized_vendor_ids, current_vendor_ids = await prepare_kri_update(
        db,
        kri_id=kri_id,
        update_data=update_data,
        current_user=current_user,
    )
    approval_outcome = await create_kri_edit_approval_if_required(
        db,
        kri=kri,
        update_data=update_data,
        normalized_vendor_ids=normalized_vendor_ids,
        current_vendor_ids=current_vendor_ids,
        current_user=current_user,
    )
    if approval_outcome is not None:
        return approval_outcome
    return await apply_kri_update_directly(
        db,
        kri=kri,
        update_data=update_data,
        normalized_vendor_ids=normalized_vendor_ids,
        current_vendor_ids=current_vendor_ids,
        current_user=current_user,
    )


__all__ = [
    "EntityApprovalPlan",
    "EntityDirectApplyPlan",
    "EntityMutationKind",
    "EntityMutationOptions",
    "EntityMutationOutcome",
    "archive_control_detail",
    "archive_kri_detail",
    "archive_risk_detail",
    "update_control_detail",
    "update_kri_detail",
    "update_risk_detail",
]
