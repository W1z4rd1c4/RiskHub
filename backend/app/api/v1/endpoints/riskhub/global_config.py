from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.activity_logger import build_change_set, log_activity
from app.db.session import get_db
from app.models import GlobalConfig, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.riskhub import GlobalConfigRead, GlobalConfigUpdate

from ._shared import _ensure_total_assets_value_config, get_cro_user

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

    await _ensure_total_assets_value_config(db)

    result = await db.execute(
        select(GlobalConfig)
        .options(selectinload(GlobalConfig.updated_by))
        .order_by(GlobalConfig.category, GlobalConfig.display_name)
    )
    configs = result.scalars().all()

    grouped: dict[str, list[GlobalConfigRead]] = {}
    for c in configs:
        config_read = GlobalConfigRead(
            id=c.id,
            key=c.key,
            value=c.value,
            value_type=c.value_type,
            category=c.category,
            display_name=c.display_name,
            description=c.description,
            min_value=c.min_value,
            max_value=c.max_value,
            is_editable=c.is_editable,
            updated_at=c.updated_at.isoformat(),
            updated_by_name=c.updated_by.name if c.updated_by else None,
        )
        if c.category not in grouped:
            grouped[c.category] = []
        grouped[c.category].append(config_read)

    return grouped


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

    if category == "risk_thresholds":
        await _ensure_total_assets_value_config(db)

    result = await db.execute(
        select(GlobalConfig)
        .options(selectinload(GlobalConfig.updated_by))
        .where(GlobalConfig.category == category)
        .order_by(GlobalConfig.display_name)
    )
    configs = result.scalars().all()

    return [
        GlobalConfigRead(
            id=c.id,
            key=c.key,
            value=c.value,
            value_type=c.value_type,
            category=c.category,
            display_name=c.display_name,
            description=c.description,
            min_value=c.min_value,
            max_value=c.max_value,
            is_editable=c.is_editable,
            updated_at=c.updated_at.isoformat(),
            updated_by_name=c.updated_by.name if c.updated_by else None,
        )
        for c in configs
    ]


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

    result = await db.execute(
        select(GlobalConfig).options(selectinload(GlobalConfig.updated_by)).where(GlobalConfig.key == key)
    )
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=404, detail=f"Config key '{key}' not found")

    if not config.is_editable:
        raise HTTPException(status_code=400, detail="This config value cannot be edited")

    # Validate value based on type
    if config.value_type == "int":
        try:
            int_val = int(data.value)
            if config.min_value is not None and int_val < config.min_value:
                raise HTTPException(status_code=400, detail=f"Value must be >= {config.min_value}")
            if config.max_value is not None and int_val > config.max_value:
                raise HTTPException(status_code=400, detail=f"Value must be <= {config.max_value}")
        except ValueError:
            raise HTTPException(status_code=400, detail="Value must be an integer")
    elif config.value_type == "bool":
        if data.value.lower() not in ("true", "false", "1", "0"):
            raise HTTPException(status_code=400, detail="Value must be true or false")

    old_value = config.value
    changes = build_change_set(config, {"value": data.value})
    config.value = data.value
    config.updated_by_id = cro_user.id

    await db.flush()

    await log_activity(
        db=db,
        actor=cro_user,
        action=ActivityAction.UPDATE,
        entity_type=ActivityEntityType.CONFIG,
        entity_id=config.id,
        entity_name=config.display_name,
        safe_entity_label=config.display_name,
        changes=changes,
        description=f"Config '{key}' changed from '{old_value}' to '{data.value}'",
    )
    await db.commit()
    await db.refresh(config)

    return GlobalConfigRead(
        id=config.id,
        key=config.key,
        value=config.value,
        value_type=config.value_type,
        category=config.category,
        display_name=config.display_name,
        description=config.description,
        min_value=config.min_value,
        max_value=config.max_value,
        is_editable=config.is_editable,
        updated_at=config.updated_at.isoformat(),
        updated_by_name=cro_user.name,
    )
