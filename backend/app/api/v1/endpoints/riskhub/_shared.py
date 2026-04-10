from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.models import GlobalConfig, User
from app.models.role import RoleType


async def _ensure_total_assets_value_config(db: AsyncSession) -> None:
    """
    Ensure the `total_assets_value` config exists.

    This key is used across the UI (financial loss ranges). In some dev environments
    migrations may be skipped/reset; this guard inserts the default row if missing
    so the Risk Hub "System Settings" UI can always display it.
    """
    result = await db.execute(select(GlobalConfig).where(GlobalConfig.key == "total_assets_value"))
    existing = result.scalar_one_or_none()
    if existing:
        return

    db.add(
        GlobalConfig(
            key="total_assets_value",
            value="10000000000",
            value_type="int",
            category="risk_thresholds",
            display_name="Total Assets Value",
            description="Company total asset value used to calculate financial loss thresholds for risk impact levels",
            min_value=1000000,
            max_value=None,
            is_editable=True,
        )
    )
    try:
        await db.commit()
    except IntegrityError:
        # Another request may have inserted it concurrently.
        await db.rollback()


def require_cro(current_user: User) -> User:
    """Check that user has CRO role. Raises 403 if not."""
    if current_user.role.name not in RoleType.cro_only_roles():
        raise HTTPException(status_code=403, detail="Risk Hub access requires CRO role")
    return current_user


def get_cro_user(current_user: User = Depends(get_current_user)) -> User:
    """FastAPI dependency: authenticated user with CRO role."""
    return require_cro(current_user)
