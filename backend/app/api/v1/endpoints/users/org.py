from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.db.session import get_db
from app.models import User
from app.schemas import UserRead

router = APIRouter()


@router.get("/{user_id}/subordinates", response_model=list[UserRead])
async def get_user_subordinates(
    user_id: int,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get all direct subordinates of a user.
    Requires: admin/manager access OR self-lookup.
    """
    from app.core.permissions import can_manage_users

    # Allow self-lookup or admin/manager access
    if current_user.id != user_id and not can_manage_users(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied - can only view own subordinates or requires admin access",
        )

    result = await db.execute(
        select(User)
        .options(
            selectinload(User.subordinates).options(
                selectinload(User.role),
                selectinload(User.department),
                selectinload(User.manager),
            )
        )
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user.subordinates

