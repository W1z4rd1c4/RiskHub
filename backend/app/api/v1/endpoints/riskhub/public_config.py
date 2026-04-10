from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.policy import PUBLIC_CONFIG_ALLOWLIST
from app.db.session import get_db
from app.models import GlobalConfig, RiskTypeConfig, User
from app.models.role import RoleType
from app.schemas.riskhub import PublicRiskTypeRead

from ._shared import _ensure_total_assets_value_config

router = APIRouter()


@router.get("/public-config/{key}")
async def get_public_config(
    key: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Get a single config value.
    Any authenticated user can read allowlisted config values only.
    CRO users can read any config value.
    """
    # CRO can read any key; non-CRO limited to allowlist
    is_cro = bool(current_user.role and current_user.role.name == RoleType.CRO)

    if not is_cro and key not in PUBLIC_CONFIG_ALLOWLIST:
        raise HTTPException(status_code=403, detail=f"Config key '{key}' is not publicly accessible")

    if key == "total_assets_value":
        await _ensure_total_assets_value_config(db)

    result = await db.execute(select(GlobalConfig).where(GlobalConfig.key == key))
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=404, detail=f"Config key '{key}' not found")

    return {
        "key": config.key,
        "value": config.get_typed_value(),
        "value_type": config.value_type,
    }


@router.get("/public-risk-types", response_model=list[PublicRiskTypeRead])
async def list_public_risk_types(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PublicRiskTypeRead]:
    """
    List active risk types for UI display.
    Any authenticated user can access this endpoint.
    Only returns active types with minimal fields (no admin metadata).
    """
    result = await db.execute(
        select(RiskTypeConfig)
        .where(RiskTypeConfig.is_active.is_(True))
        .order_by(RiskTypeConfig.sort_order, RiskTypeConfig.display_name)
    )
    types = result.scalars().all()

    return [
        PublicRiskTypeRead(
            code=t.code,
            display_name=t.display_name,
            color=t.color,
            icon=t.icon,
            sort_order=t.sort_order,
        )
        for t in types
    ]
