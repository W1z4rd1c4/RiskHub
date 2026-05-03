from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models import User
from app.services._identity_access_lifecycle import update_access_profile


async def update_access_user_settings(
    *,
    db: AsyncSession,
    settings: Settings,
    current_user: User,
    user_id: int,
    update_data: dict,
) -> User:
    return await update_access_profile(
        db=db,
        settings=settings,
        current_user=current_user,
        user_id=user_id,
        user_data=update_data,
    )

__all__ = ["update_access_profile", "update_access_user_settings"]
