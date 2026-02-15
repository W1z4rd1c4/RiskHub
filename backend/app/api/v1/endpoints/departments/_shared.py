from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import MAX_PAGE_SIZE
from app.core.permissions import check_department_access, get_user_department_ids
from app.models import Control, Department, KeyRiskIndicator, Risk, User
from app.models.control import ControlStatus
from app.models.global_config import ConfigDefaults, build_risk_level_ranges
from app.models.risk import RiskStatus

# Risk level score ranges (uses ConfigDefaults for consistency)
RISK_LEVEL_RANGES = build_risk_level_ranges(
    ConfigDefaults.MEDIUM_RISK_MIN_NET_SCORE,
    ConfigDefaults.HIGH_RISK_MIN_NET_SCORE,
    ConfigDefaults.CRITICAL_RISK_MIN_NET_SCORE,
)


def _get_scoped_department_ids(current_user: User) -> Optional[list[int]]:
    """
    Return visible department IDs for the user.

    Returns None if user sees all departments (privileged).
    """
    return get_user_department_ids(current_user)


async def _assert_department_in_scope(department_id: int, db: AsyncSession, current_user: User) -> Department:
    """
    Load department by id and verify user access.

    Raises HTTPException 404 if not found; 403 if out of scope.
    """
    result = await db.execute(select(Department).where(Department.id == department_id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    check_department_access(department_id, current_user)
    return dept


def _clamp_pagination(skip: int, limit: int) -> tuple[int, int]:
    """
    Enforce pagination bounds.

    Returns (skip, limit) where limit is clamped to MAX_PAGE_SIZE.
    """
    return max(0, skip), min(limit, MAX_PAGE_SIZE)


async def _count_active_users_by_dept(db: AsyncSession) -> dict[int, int]:
    """Active user count per department."""
    result = await db.execute(
        select(User.department_id, func.count(User.id)).where(User.is_active.is_(True)).group_by(User.department_id)
    )
    return dict(result.all())


async def _count_risks_by_dept(db: AsyncSession) -> dict[int, int]:
    """Non-archived risk count per department."""
    result = await db.execute(
        select(Risk.department_id, func.count(Risk.id))
        .where(Risk.status != RiskStatus.archived.value)
        .group_by(Risk.department_id)
    )
    return dict(result.all())


async def _count_high_risks_by_dept(db: AsyncSession) -> dict[int, int]:
    """Non-archived risk count with net_score >= HIGH_RISK_MIN_NET_SCORE per department.

    Uses ConfigDefaults.HIGH_RISK_MIN_NET_SCORE (10) for consistency with dashboard.
    """
    result = await db.execute(
        select(Risk.department_id, func.count(Risk.id))
        .where(and_(Risk.status != RiskStatus.archived.value, Risk.net_score >= ConfigDefaults.HIGH_RISK_MIN_NET_SCORE))
        .group_by(Risk.department_id)
    )
    return dict(result.all())


async def _count_controls_by_dept(db: AsyncSession) -> dict[int, int]:
    """Non-archived control count per department."""
    result = await db.execute(
        select(Control.department_id, func.count(Control.id))
        .where(Control.status != ControlStatus.archived.value)
        .group_by(Control.department_id)
    )
    return dict(result.all())


async def _count_kris_by_dept(db: AsyncSession) -> dict[int, int]:
    """KRI count linked to non-archived risks, grouped by risk's department."""
    result = await db.execute(
        select(Risk.department_id, func.count(KeyRiskIndicator.id))
        .join(Risk)
        .where(Risk.status != RiskStatus.archived.value)
        .group_by(Risk.department_id)
    )
    return dict(result.all())


async def _count_breaching_kris_by_dept(db: AsyncSession) -> dict[int, int]:
    """KRI count outside limits, linked to non-archived risks, per department."""
    result = await db.execute(
        select(Risk.department_id, func.count(KeyRiskIndicator.id))
        .join(Risk)
        .where(
            and_(
                Risk.status != RiskStatus.archived.value,
                or_(
                    KeyRiskIndicator.current_value < KeyRiskIndicator.lower_limit,
                    KeyRiskIndicator.current_value > KeyRiskIndicator.upper_limit,
                ),
            )
        )
        .group_by(Risk.department_id)
    )
    return dict(result.all())


async def _sum_net_scores_by_dept(db: AsyncSession) -> dict[int, int]:
    """Total net_score for non-archived risks per department."""
    result = await db.execute(
        select(Risk.department_id, func.sum(Risk.net_score))
        .where(Risk.status != RiskStatus.archived.value)
        .group_by(Risk.department_id)
    )
    return {dept_id: (total or 0) for dept_id, total in result.all()}
