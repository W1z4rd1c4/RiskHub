from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.db.session import get_db
from app.models import Role, User
from app.schemas import RoleRead
from app.schemas.user import UserLookup

from ._lifecycle import ensure_admin_user_lifecycle
from ._visibility import build_visible_users_query

router = APIRouter()


@router.get("/roles", response_model=list[RoleRead])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """List roles for admin-only user lifecycle flows."""
    ensure_admin_user_lifecycle(current_user)
    result = await db.execute(select(Role).where(Role.is_active.is_(True)))
    return result.scalars().all()


@router.get("/lookup", response_model=list[UserLookup])
async def lookup_users(
    q: str | None = None,
    include_inactive: bool = False,
    department_id: int | None = None,
    ids: list[int] | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Scoped user lookup for pickers/dropdowns.

    Returns users visible to the current user based on their access scope:
    - GLOBAL: All active users
    - DEPARTMENT: Same-department users
    - MANAGER: Self + direct reports

    Args:
        q: Optional text search (name or email)
        include_inactive: Include inactive users (default False)
        department_id: Optional filter by department (scoped to caller's access)
        ids: Optional exact user IDs to resolve (scoped to caller's access)
        skip: Number of records to skip (default 0)
        limit: Maximum number of records to return (default 50, max 200)
    """
    from sqlalchemy import or_

    from app.core.pagination import MAX_LOOKUP_SIZE

    # Enforce max lookup size
    limit = min(limit, MAX_LOOKUP_SIZE)
    if ids is not None and len(ids) > MAX_LOOKUP_SIZE:
        raise HTTPException(status_code=400, detail="Too many user ids requested")
    exact_ids = list(dict.fromkeys(ids or []))

    query = build_visible_users_query(current_user, department_id=department_id).options(
        selectinload(User.role),
        selectinload(User.department),
    )
    if exact_ids:
        query = query.where(User.id.in_(exact_ids))

    # Apply active filter
    if not include_inactive:
        query = query.where(User.is_active.is_(True))

    # Apply text search
    if q:
        search_term = f"%{q}%"
        query = query.where(or_(User.name.ilike(search_term), User.email.ilike(search_term)))

    # Deterministic ordering for stable paging
    if exact_ids:
        result = await db.execute(query.order_by(User.id))
    else:
        result = await db.execute(query.order_by(User.id).offset(skip).limit(limit))
    users = result.scalars().all()

    return [
        UserLookup(
            id=u.id,
            name=u.name,
            email=u.email,
            role_name=u.role.name if u.role else None,
            department_id=u.department_id,
            department_name=u.department.name if u.department else None,
            manager_id=u.manager_id,
        )
        for u in users
    ]
