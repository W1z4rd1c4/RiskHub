from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.services._entity_mutation_lifecycle.archive_plans import (
    assert_can_request_delete_control,
    assert_can_request_delete_kri,
    assert_can_request_delete_risk,
)


async def assert_delete_request_allowed(
    db: AsyncSession,
    *,
    resource_type: str,
    resource_id: int,
    current_user: User,
):
    if resource_type == "risk":
        return await assert_can_request_delete_risk(db, risk_id=resource_id, current_user=current_user)
    if resource_type == "control":
        return await assert_can_request_delete_control(db, control_id=resource_id, current_user=current_user)
    return await assert_can_request_delete_kri(db, kri_id=resource_id, current_user=current_user)
