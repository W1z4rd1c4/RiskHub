from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import is_issue_owner_assignable_to_department
from app.models import User


async def _validate_user_exists(db: AsyncSession, user_id: int | None) -> None:
    if user_id is None:
        return
    exists = (await db.execute(select(User.id).where(User.id == user_id))).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"User {user_id} not found")


async def _ensure_owner_assignable(
    db: AsyncSession,
    *,
    owner_user_id: int | None,
    department_id: int,
    denied_status: int = status.HTTP_403_FORBIDDEN,
) -> None:
    if owner_user_id is None:
        return
    allowed = await is_issue_owner_assignable_to_department(
        db,
        owner_user_id=owner_user_id,
        issue_department_id=department_id,
    )
    if not allowed:
        raise HTTPException(
            status_code=denied_status,
            detail="Owner user must have global scope or belong to the issue department",
        )
