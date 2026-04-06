"""Shared handler helpers."""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Role, RolePermission, User
from app.services.outbox.payloads import OutboxPayloadModel

OutboxHandler = Callable[[AsyncSession, OutboxPayloadModel], Awaitable[None]]


async def get_active_user_with_permissions(db: AsyncSession, user_id: int) -> User | None:
    result = await db.execute(
        select(User)
        .options(selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission))
        .where(User.id == user_id, User.is_active.is_(True))
    )
    return result.scalar_one_or_none()
