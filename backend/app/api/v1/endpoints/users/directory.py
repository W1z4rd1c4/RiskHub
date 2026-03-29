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
from app.schemas.user import UserDirectoryEntry, UserDirectoryListResponse

from ._visibility import build_visible_users_query

router = APIRouter()


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
    query = build_visible_users_query(current_user, department_id=department_id).options(
        selectinload(User.role),
        selectinload(User.department),
    )

    if not include_inactive:
        query = query.where(User.is_active.is_(True))

    if q:
        search_term = f"%{q}%"
        query = query.where(or_(User.name.ilike(search_term), User.email.ilike(search_term)))

    if role_name:
        query = query.where(User.role.has(Role.name == role_name))

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
        total=total,
        skip=skip,
        limit=limit,
    )
