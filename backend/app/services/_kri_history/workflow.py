from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import can_read_kri_id, check_department_access, has_permission, is_kri_reporting_owner
from app.models import KeyRiskIndicator, User

from . import clock
from .periods import latest_closed_period_for_date


async def ensure_can_read_history(db: AsyncSession, user: User, kri: KeyRiskIndicator) -> None:
    if not await can_read_kri_id(db, user, kri.id):
        raise HTTPException(status_code=403, detail="Access denied")


async def ensure_can_submit_value(db: AsyncSession, user: User, kri: KeyRiskIndicator) -> None:
    is_reporting_owner = await is_kri_reporting_owner(db, user.id, kri.id)
    if not (is_reporting_owner or has_permission(user, "kri", "submit")):
        raise HTTPException(
            status_code=403,
            detail="Permission denied: requires kri:submit permission or be reporting owner",
        )
    if not is_reporting_owner:
        check_department_access(kri.risk.department_id, user)


async def can_request_history_correction(
    db: AsyncSession,
    user: User,
    kri: KeyRiskIndicator,
    *,
    can_read_override: bool | None = None,
) -> bool:
    can_read = can_read_override if can_read_override is not None else await can_read_kri_id(db, user, kri.id)
    return has_permission(user, "risks", "write") and can_read


async def ensure_can_request_history_correction(db: AsyncSession, user: User, kri: KeyRiskIndicator) -> None:
    if not await can_request_history_correction(db, user, kri):
        raise HTTPException(status_code=403, detail="Access denied")


async def history_capabilities(db: AsyncSession, user: User, kri: KeyRiskIndicator) -> dict[str, bool]:
    return {
        "can_request_correction": await can_request_history_correction(db, user, kri),
    }


def latest_closed_period_end(kri: KeyRiskIndicator) -> clock.date:
    _, period_end = latest_closed_period_for_date(clock.today(), kri.frequency)
    return period_end
