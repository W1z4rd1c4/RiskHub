from __future__ import annotations

from sqlalchemy import false, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.core.permissions import (
    get_risk_ids_where_control_owner,
    get_risk_ids_where_kri_reporting_owner,
    get_user_department_ids,
)
from app.core.security import check_permission
from app.models import KeyRiskIndicator, Risk, User
from app.models.risk import RiskStatus


async def kri_read_scope_clause(db: AsyncSession, current_user: User) -> ColumnElement[bool] | None:
    """Return a set-based KRI visibility clause matching can_read_kri_id()."""
    if not check_permission(current_user, "risks", "read"):
        return false()

    dept_ids = get_user_department_ids(current_user)
    if dept_ids is None:
        return None

    clauses: list[ColumnElement[bool]] = [
        Risk.owner_id == current_user.id,
    ]
    if dept_ids:
        clauses.append(Risk.department_id.in_(dept_ids))

    reporting_owner_risk_ids = await get_risk_ids_where_kri_reporting_owner(db, current_user.id)
    if reporting_owner_risk_ids:
        clauses.append(KeyRiskIndicator.risk_id.in_(reporting_owner_risk_ids))

    control_owner_risk_ids = await get_risk_ids_where_control_owner(db, current_user.id)
    if control_owner_risk_ids:
        clauses.append(KeyRiskIndicator.risk_id.in_(control_owner_risk_ids))

    return or_(*clauses) if clauses else false()


async def can_create_kri_for_any_parent_risk(db: AsyncSession, current_user: User) -> bool:
    """Match POST /kris parent-risk access: risks:write plus department access."""
    if not check_permission(current_user, "risks", "write"):
        return False

    query = select(Risk.id).where(Risk.status != RiskStatus.archived.value).limit(1)
    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:
        if not dept_ids:
            return False
        query = query.where(Risk.department_id.in_(dept_ids))

    return (await db.scalar(query)) is not None
