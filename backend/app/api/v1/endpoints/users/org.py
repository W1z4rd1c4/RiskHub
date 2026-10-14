from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.permissions import can_manage_users
from app.core.user_query_options import user_selectinload_options
from app.db.session import get_db
from app.models import User
from app.schemas import UserRead
from app.services._access_workflow import build_access_users_query

router = APIRouter()


@router.get("/{user_id}/subordinates", response_model=list[UserRead])
async def get_user_subordinates(
    user_id: int,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get visible direct subordinates of a user.
    Requires user-management authority OR self-lookup. Like access rosters,
    platform-Admin rows are visible only to platform-Admin callers.
    """
    # Allow self-lookup or admin/manager access
    if current_user.id != user_id and not can_manage_users(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied - can only view own subordinates or requires admin access",
        )

    user_id_result = await db.execute(select(User.id).where(User.id == user_id))
    if user_id_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        build_access_users_query(current_user)
        .where(User.manager_id == user_id)
        .options(*user_selectinload_options())
    )
    return result.scalars().all()
