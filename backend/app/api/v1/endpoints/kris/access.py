from __future__ import annotations

from typing import Any

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


async def apply_kri_department_scope(
    target: Any,
    *,
    current_user: User,
    department_id: int | None,
    db: AsyncSession | None = None,
) -> Any:
    """Apply KRI department scoping to a list payload or SQLAlchemy query."""
    dept_ids = get_user_department_ids(current_user)
    if isinstance(target, list):
        if department_id is not None:
            if dept_ids is not None and department_id not in dept_ids:
                return []
            return [item for item in target if item.get("department_id") == department_id]
        if dept_ids is not None:
            return [item for item in target if item.get("department_id") in dept_ids]
        return target

    if db is None:
        raise ValueError("db is required when applying KRI department scope to a query")

    visibility_clause = await kri_visibility_clause(db, current_user, department_id=department_id)
    if visibility_clause is not None:
        return target.where(visibility_clause)
    return target


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
