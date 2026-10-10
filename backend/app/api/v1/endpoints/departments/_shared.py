from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import and_, func, literal, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthorizationError, ValidationError
from app.core.pagination import MAX_PAGE_SIZE
from app.core.permissions import check_department_access, get_user_department_ids
from app.models import Control, Department, KeyRiskIndicator, Risk, User
from app.models.global_config import ConfigDefaults, build_risk_level_ranges, get_config_int
from app.services._access_workflow.policy import (
    build_department_access_roster_query,
    can_view_department_access_roster,
    resolve_department_access_roster_target,
)
from app.services.kri_populations import breaching_clause, live_clause

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


def _counts_by_department(rows) -> dict[int, int]:
    return {dept_id: int(count) for dept_id, count in rows if dept_id is not None}


async def _count_active_users_by_dept(
    db: AsyncSession, *, current_user: User, department_ids: list[int]
) -> dict[int, int]:
    """Count only the canonical roster the actor can open for each visible department."""
    if not can_view_department_access_roster(current_user):
        return {}
    queries = []
    for department_id in department_ids:
        try:
            target = resolve_department_access_roster_target(current_user, department_id)
        except (AuthorizationError, ValidationError):
            # A Department Head may see a shell without being allowed another roster.
            continue
        roster = build_department_access_roster_query(current_user, department_id=target)
        queries.append(select(literal(department_id), func.count()).select_from(roster.subquery()))
    counts: dict[int, int] = {}
    # Bound compound SELECT size while avoiding a query for each department.
    for start in range(0, len(queries), 100):
        result = await db.execute(union_all(*queries[start:start + 100]))
        counts.update(_counts_by_department(result.all()))
    return counts


async def _count_risks_by_dept(db: AsyncSession) -> dict[int, int]:
    """Non-archived risk count per department."""
    result = await db.execute(
        select(Risk.department_id, func.count(Risk.id))
        .where(Risk.live())
        .group_by(Risk.department_id)
    )
    return _counts_by_department(result.all())


async def _count_high_risks_by_dept(db: AsyncSession) -> dict[int, int]:
    """Non-archived risk count with net_score >= HIGH_RISK_MIN_NET_SCORE per department.

    Uses the configured high_risk_min_net_score threshold for consistency with
    department high-risk drilldowns.
    """
    high_risk_min_net_score = await get_config_int(
        db,
        "high_risk_min_net_score",
        ConfigDefaults.HIGH_RISK_MIN_NET_SCORE,
    )
    result = await db.execute(
        select(Risk.department_id, func.count(Risk.id))
        .where(and_(Risk.live(), Risk.net_score >= high_risk_min_net_score))
        .group_by(Risk.department_id)
    )
    return _counts_by_department(result.all())


async def _count_controls_by_dept(db: AsyncSession) -> dict[int, int]:
    """Non-archived control count per department."""
    result = await db.execute(
        select(Control.department_id, func.count(Control.id))
        .where(Control.live())
        .group_by(Control.department_id)
    )
    return _counts_by_department(result.all())


async def _count_kris_by_dept(db: AsyncSession) -> dict[int, int]:
    """KRI count linked to non-archived risks, grouped by risk's department."""
    result = await db.execute(
        select(Risk.department_id, func.count(KeyRiskIndicator.id))
        .join(Risk)
        .where(live_clause())
        .group_by(Risk.department_id)
    )
    return _counts_by_department(result.all())


async def _count_breaching_kris_by_dept(db: AsyncSession) -> dict[int, int]:
    """KRI count outside limits, linked to non-archived risks, per department."""
    result = await db.execute(
        select(Risk.department_id, func.count(KeyRiskIndicator.id))
        .join(Risk)
        .where(breaching_clause())
        .group_by(Risk.department_id)
    )
    return _counts_by_department(result.all())


async def _sum_net_scores_by_dept(db: AsyncSession) -> dict[int, int]:
    """Total net_score for non-archived risks per department."""
    result = await db.execute(
        select(Risk.department_id, func.sum(Risk.net_score))
        .where(Risk.live())
        .group_by(Risk.department_id)
    )
    return {dept_id: (total or 0) for dept_id, total in result.all()}
