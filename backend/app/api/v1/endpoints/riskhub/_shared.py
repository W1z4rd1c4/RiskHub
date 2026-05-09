from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.models import User
from app.models.role import RoleType
from app.services._riskhub_config.global_config import ensure_total_assets_value_config


async def _ensure_total_assets_value_config(db: AsyncSession) -> None:
    await ensure_total_assets_value_config(db)


def require_cro(current_user: User) -> User:
    """Check that user has CRO role. Raises 403 if not."""
    if current_user.role.name not in RoleType.cro_only_roles():
        raise HTTPException(status_code=403, detail="Risk Hub access requires CRO role")
    return current_user


def get_cro_user(current_user: User = Depends(get_current_user)) -> User:
    """FastAPI dependency: authenticated user with CRO role."""
    return require_cro(current_user)
