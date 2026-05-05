from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.activity_logger import build_change_set, log_activity
from app.models import GlobalConfig, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.riskhub import GlobalConfigRead, GlobalConfigUpdate

from .lifecycle import build_config_audit_plan, run_config_update

GlobalConfigLogActivity = Callable[..., Awaitable[None]]


async def ensure_total_assets_value_config(db: AsyncSession) -> None:
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
        await db.rollback()


def serialize_global_config(config: GlobalConfig, *, updated_by_name: str | None = None) -> GlobalConfigRead:
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
        updated_by_name=updated_by_name if updated_by_name is not None else config.updated_by.name if config.updated_by else None,
    )


async def list_all_global_configs(db: AsyncSession) -> dict[str, list[GlobalConfigRead]]:
    await ensure_total_assets_value_config(db)

    result = await db.execute(
        select(GlobalConfig)
        .options(selectinload(GlobalConfig.updated_by))
        .order_by(GlobalConfig.category, GlobalConfig.display_name)
    )

    grouped: dict[str, list[GlobalConfigRead]] = {}
    for config in result.scalars().all():
        grouped.setdefault(config.category, []).append(serialize_global_config(config))
    return grouped


async def list_global_config_category(db: AsyncSession, *, category: str) -> list[GlobalConfigRead]:
    if category == "risk_thresholds":
        await ensure_total_assets_value_config(db)

    result = await db.execute(
        select(GlobalConfig)
        .options(selectinload(GlobalConfig.updated_by))
        .where(GlobalConfig.category == category)
        .order_by(GlobalConfig.display_name)
    )
    return [serialize_global_config(config) for config in result.scalars().all()]


def validate_global_config_value(config: GlobalConfig, value: str) -> None:
    if config.value_type == "int":
        try:
            int_val = int(value)
        except ValueError:
            raise HTTPException(status_code=400, detail="Value must be an integer") from None
        if config.min_value is not None and int_val < config.min_value:
            raise HTTPException(status_code=400, detail=f"Value must be >= {config.min_value}")
        if config.max_value is not None and int_val > config.max_value:
            raise HTTPException(status_code=400, detail=f"Value must be <= {config.max_value}")
    elif config.value_type == "bool" and value.lower() not in ("true", "false", "1", "0"):
        raise HTTPException(status_code=400, detail="Value must be true or false")


async def update_global_config(
    db: AsyncSession,
    *,
    key: str,
    data: GlobalConfigUpdate,
    actor: User,
    log_activity_func: GlobalConfigLogActivity = log_activity,
) -> GlobalConfigRead:
    result = await db.execute(
        select(GlobalConfig).options(selectinload(GlobalConfig.updated_by)).where(GlobalConfig.key == key)
    )
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=404, detail=f"Config key '{key}' not found")
    if not config.is_editable:
        raise HTTPException(status_code=400, detail="This config value cannot be edited")

    validate_global_config_value(config, data.value)

    old_value = config.value
    changes = build_change_set(config, {"value": data.value})
    config.value = data.value
    config.updated_by_id = actor.id
    await db.flush()

    audit_plan = build_config_audit_plan(
        action=ActivityAction.UPDATE,
        entity_type=ActivityEntityType.CONFIG,
        entity_id=config.id,
        entity_name=config.display_name,
        safe_entity_label=config.display_name,
        changes=changes,
        description=f"Config '{key}' changed from '{old_value}' to '{data.value}'",
    )
    await run_config_update(
        db=db,
        actor=actor,
        audit_plan=audit_plan,
        entity=config,
        refresh_entity=True,
        log_activity_func=log_activity_func,
    )

    return serialize_global_config(config, updated_by_name=actor.name)
