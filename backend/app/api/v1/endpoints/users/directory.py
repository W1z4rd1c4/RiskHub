from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.pagination import MAX_LOOKUP_SIZE
from app.core.permissions import has_permission
from app.db.session import get_db
from app.models import Role, User
from app.schemas.user import UserDirectoryEntry, UserDirectoryListResponse, UserDirectoryRoleFacet

from ._visibility import build_visible_users_query

router = APIRouter()


def _apply_directory_filters(
    query,
    *,
    include_inactive: bool,
    q: str | None,
    role_name: str | None = None,
):
    if not include_inactive:
        query = query.where(User.is_active.is_(True))

    if q:
        search_term = f"%{q}%"
        query = query.where(or_(User.name.ilike(search_term), User.email.ilike(search_term)))

    if role_name:
        query = query.where(User.role.has(Role.name == role_name))

    return query


@router.get("/directory", response_model=UserDirectoryListResponse)
async def list_directory_users(
    q: str | None = None,
    role_name: str | None = None,
    include_inactive: bool = False,
    department_id: int | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List directory entries for the `/users` directory surface."""
    if not has_permission(current_user, "users", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    limit = min(limit, MAX_LOOKUP_SIZE)
    base_query = build_visible_users_query(current_user, department_id=department_id)
    query = _apply_directory_filters(
        base_query.options(
            selectinload(User.role),
            selectinload(User.department),
        ),
        include_inactive=include_inactive,
        q=q,
        role_name=role_name,
    )

    facet_query = _apply_directory_filters(
        build_visible_users_query(current_user, department_id=department_id),
        include_inactive=include_inactive,
        q=q,
    ).subquery()
    facet_result = await db.execute(
        select(
            facet_query.c.role_id,
            Role.name,
            Role.display_name,
            func.count().label("count"),
        )
        .join(Role, Role.id == facet_query.c.role_id)
        .group_by(facet_query.c.role_id, Role.name, Role.display_name)
        .order_by(Role.display_name.asc(), Role.name.asc())
    )
    available_roles = [
        UserDirectoryRoleFacet(
            name=row.name,
            display_name=row.display_name,
            count=row.count,
        )
        for row in facet_result
    ]

    total = (
        await db.execute(select(func.count()).select_from(query.order_by(None).subquery()))
    ).scalar_one()

    result = await db.execute(query.order_by(User.name.asc(), User.id.asc()).offset(skip).limit(limit))
    users = result.scalars().all()

    return UserDirectoryListResponse(
        items=[
            UserDirectoryEntry(
                id=user.id,
                name=user.name,
                email=user.email,
                role_name=user.role.name if user.role else None,
                role_display_name=user.role.display_name if user.role else None,
                department_id=user.department_id,
                department_name=user.department.name if user.department else None,
            )
            for user in users
        ],
        available_roles=available_roles,
        total=total,
        skip=skip,
        limit=limit,
    )
