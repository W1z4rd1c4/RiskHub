"""Support helpers for KRI deadline evaluation context."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.user_query_options import user_selectinload_options
from app.models.global_config import ConfigDefaults, get_config_float, get_config_int
from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.role import Role, RoleType
from app.models.user import User


def initialize_results() -> dict[str, int]:
    return {
        "due_soon": 0,
        "deadline": 0,
        "overdue": 0,
        "near_breach": 0,
        "breached": 0,
        "total_kris_checked": 0,
        "notifications_created": 0,
    }


async def load_kri_deadline_config(db: AsyncSession) -> dict[str, float | int]:
    return {
        "near_breach_threshold": await get_config_float(
            db, "near_breach_threshold", ConfigDefaults.NEAR_BREACH_THRESHOLD
        ),
        "duplicate_lookback_days": await get_config_int(
            db, "duplicate_lookback_days", ConfigDefaults.DUPLICATE_LOOKBACK_DAYS
        ),
        "reporting_grace_days": await get_config_int(db, "reporting_grace_days", ConfigDefaults.REPORTING_GRACE_DAYS),
        "advance_reminder_days": await get_config_int(
            db, "advance_reminder_days", ConfigDefaults.ADVANCE_REMINDER_DAYS
        ),
        "overdue_reminder_weeks": await get_config_int(
            db, "overdue_reminder_weeks", ConfigDefaults.OVERDUE_REMINDER_WEEKS
        ),
    }


async def list_active_kris(db: AsyncSession) -> list[KeyRiskIndicator]:
    stmt = (
        select(KeyRiskIndicator)
        .where(KeyRiskIndicator.is_archived.is_(False))
        .options(
            selectinload(KeyRiskIndicator.risk),
            selectinload(KeyRiskIndicator.reporting_owner),
        )
    )
    return list((await db.execute(stmt)).scalars().all())


async def list_risk_managers(db: AsyncSession) -> list[User]:
    role_names = [role.value for role in {RoleType.RISK_MANAGER, RoleType.CRO, RoleType.ADMIN}]
    stmt = (
        select(User)
        .join(Role, User.role_id == Role.id)
        .options(*user_selectinload_options(include_permissions=True))
        .where(User.is_active.is_(True))
        .where(Role.name.in_(role_names))
    )
    return list((await db.execute(stmt)).scalars().all())
