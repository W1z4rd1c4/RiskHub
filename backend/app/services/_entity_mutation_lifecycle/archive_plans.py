from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.permissions import check_department_access
from app.core.security import check_permission
from app.models import Control, KeyRiskIndicator, Risk, User

from .policy import raise_missing_permission


async def assert_can_request_delete_risk(
    db: AsyncSession,
    *,
    risk_id: int,
    current_user: User,
) -> Risk:
    if not check_permission(current_user, "risks", "delete"):
        raise_missing_permission("risks", "delete")

    risk = (await db.execute(select(Risk).where(Risk.id == risk_id))).scalar_one_or_none()
    if risk is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk not found")

    if risk.owner_id != current_user.id:
        check_department_access(risk.department_id, current_user)

    return risk


async def assert_can_request_delete_control(
    db: AsyncSession,
    *,
    control_id: int,
    current_user: User,
) -> Control:
    if not check_permission(current_user, "controls", "delete"):
        raise_missing_permission("controls", "delete")

    control = (await db.execute(select(Control).where(Control.id == control_id))).scalar_one_or_none()
    if control is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Control not found")

    check_department_access(control.department_id, current_user)
    return control


async def assert_can_request_delete_kri(
    db: AsyncSession,
    *,
    kri_id: int,
    current_user: User,
) -> KeyRiskIndicator:
    if not check_permission(current_user, "risks", "delete"):
        raise_missing_permission("risks", "delete")

    kri = (
        await db.execute(
            select(KeyRiskIndicator)
            .join(Risk)
            .where(KeyRiskIndicator.id == kri_id)
            .options(joinedload(KeyRiskIndicator.risk))
        )
    ).scalar_one_or_none()
    if kri is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KRI not found")

    check_department_access(kri.risk.department_id, current_user)
    return kri
