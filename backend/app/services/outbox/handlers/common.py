"""Shared handler helpers."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.user_query_options import user_selectinload_options
from app.models import User

OutboxHandler = Callable[[AsyncSession, Any], Awaitable[None]]


async def get_active_user_with_permissions(db: AsyncSession, user_id: int) -> User | None:
    result = await db.execute(
        select(User)
        .options(*user_selectinload_options(include_permissions=True))
        .where(User.id == user_id, User.is_active.is_(True))
    )
    return result.scalar_one_or_none()
