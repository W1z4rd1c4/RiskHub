from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints._auth_dependencies import get_cro_user, require_cro
from app.services._riskhub_config.global_config import ensure_total_assets_value_config

__all__ = ["_ensure_total_assets_value_config", "get_cro_user", "require_cro"]


async def _ensure_total_assets_value_config(db: AsyncSession) -> None:
    await ensure_total_assets_value_config(db)
