from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import log_activity
from app.core.exceptions import ValidationError
from app.db.session import get_db
from app.models import User
from app.schemas.riskhub import GlobalConfigRead, GlobalConfigUpdate
from app.services._riskhub_config.global_config import (
    list_all_global_configs,
    list_global_config_category,
    update_global_config,
)

from ._shared import get_cro_user

router = APIRouter()


@router.get("/config", response_model=dict[str, list[GlobalConfigRead]])
async def list_all_configs(
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> dict[str, list[GlobalConfigRead]]:
    """
    List all configs grouped by category.
    CRO only.
    """

    return await list_all_global_configs(db)


@router.get("/config/{category}", response_model=list[GlobalConfigRead])
async def list_config_category(
    category: str,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> list[GlobalConfigRead]:
    """
    List configs for a specific category.
    CRO only.
    """

    return await list_global_config_category(db, category=category)


@router.patch("/config/{key}", response_model=GlobalConfigRead)
async def update_config(
    key: str,
    data: GlobalConfigUpdate,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> GlobalConfigRead:
    """
    Update a config value.
    CRO only. Validates against min/max for int types.
    """

    try:
        return await update_global_config(
            db,
            key=key,
            data=data,
            actor=cro_user,
            log_activity_func=log_activity,
        )
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail=[{"loc": ["body", "value"], "msg": exc.detail, "type": "value_error"}],
        ) from exc
