from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.core.permissions import (
    get_user_department_ids,
    kri_visibility_clause,
)
from app.core.security import check_permission
from app.models import Risk, User


async def kri_read_scope_clause(db: AsyncSession, current_user: User) -> ColumnElement[bool] | None:
    """Return a set-based KRI visibility clause matching can_read_kri_id()."""
    return await kri_visibility_clause(db, current_user)


async def can_create_kri_for_any_parent_risk(db: AsyncSession, current_user: User) -> bool:
    """Match POST /kris parent-risk access: risks:write plus department access."""
    if not check_permission(current_user, "risks", "write"):
        return False

    query = select(Risk.id).where(Risk.live()).limit(1)
    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:
        if not dept_ids:
            return False
        query = query.where(Risk.department_id.in_(dept_ids))

    return (await db.scalar(query)) is not None
