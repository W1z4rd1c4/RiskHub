from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import (
    check_department_access,
    is_control_owner,
    is_risk_control_owner,
    is_risk_kri_reporting_owner,
)
from app.models import Control, Risk, User


@dataclass(frozen=True)
class ControlRiskAccessDecision:
    allowed: bool
    status_code: int | None = None
    detail: str | None = None


async def load_control_for_link(control_id: int, db: AsyncSession) -> Control:
    control = (await db.execute(select(Control).where(Control.id == control_id))).scalar_one_or_none()
    if control is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Control not found")
    return control


async def load_risk_for_link(risk_id: int, db: AsyncSession) -> Risk:
    risk = (await db.execute(select(Risk).where(Risk.id == risk_id))).scalar_one_or_none()
    if risk is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk not found")
    return risk


async def assert_control_readable_for_link(db: AsyncSession, *, current_user: User, control: Control) -> None:
    if await is_control_owner(db, current_user.id, control.id):
        return
    try:
        check_department_access(control.department_id, current_user)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_403_FORBIDDEN:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Control not found") from exc
        raise


async def assert_control_writable_for_link(db: AsyncSession, *, current_user: User, control: Control) -> None:
    if not await is_control_owner(db, current_user.id, control.id):
        check_department_access(control.department_id, current_user)


async def risk_link_access_decision(
    db: AsyncSession,
    *,
    current_user: User,
    risk: Risk,
    allow_direct_owner: bool,
) -> ControlRiskAccessDecision:
    if await is_risk_kri_reporting_owner(db, current_user.id, risk.id):
        return ControlRiskAccessDecision(allowed=True)
    if await is_risk_control_owner(db, current_user.id, risk.id):
        return ControlRiskAccessDecision(allowed=True)
    if allow_direct_owner and risk.owner_id == current_user.id:
        return ControlRiskAccessDecision(allowed=True)
    try:
        check_department_access(risk.department_id, current_user)
        return ControlRiskAccessDecision(allowed=True)
    except HTTPException:
        return ControlRiskAccessDecision(allowed=False, status_code=403, detail="Access denied to risk")


async def assert_risk_writable_for_link(
    db: AsyncSession,
    *,
    current_user: User,
    risk: Risk,
    allow_direct_owner: bool,
) -> None:
    decision = await risk_link_access_decision(
        db,
        current_user=current_user,
        risk=risk,
        allow_direct_owner=allow_direct_owner,
    )
    if not decision.allowed:
        raise HTTPException(status_code=decision.status_code or 403, detail=decision.detail or "Access denied to risk")
