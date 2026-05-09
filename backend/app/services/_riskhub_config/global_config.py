from __future__ import annotations

from collections.abc import Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.activity_logger import build_change_set, log_activity
from app.core.exceptions import NotFoundError, ValidationError
from app.models import GlobalConfig, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.global_config import ConfigDefaults
from app.schemas.riskhub import GlobalConfigRead, GlobalConfigUpdate

from .lifecycle import build_config_audit_plan, run_config_update

GlobalConfigLogActivity = Callable[..., Awaitable[object]]
RISK_THRESHOLD_KEYS = {
    "medium_risk_min_net_score": "medium",
    "high_risk_min_net_score": "high",
    "critical_risk_min_net_score": "critical",
}


async def ensure_total_assets_value_config(db: AsyncSession) -> None:
    result = await db.execute(select(GlobalConfig).where(GlobalConfig.key == "total_assets_value"))
    existing = result.scalar_one_or_none()
    if existing:
        return

    try:
        async with db.begin_nested():
            db.add(
                GlobalConfig(
                    key="total_assets_value",
                    value="10000000000",
                    value_type="int",
                    category="risk_thresholds",
                    display_name="Total Assets Value",
                    description=(
                        "Company total asset value used to calculate financial loss thresholds for risk impact levels"
                    ),
                    min_value=1000000,
                    max_value=None,
                    is_editable=True,
                )
            )
            await db.flush()
    except IntegrityError:
        # Another transaction inserted the default concurrently; keep caller transaction ownership intact.
        return


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
        updated_by_name=(
            updated_by_name
            if updated_by_name is not None
            else config.updated_by.name
            if config.updated_by
            else None
        ),
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


def _threshold_validation_detail(*, medium: int, high: int, critical: int) -> str | None:
    if 1 <= medium < high < critical <= ConfigDefaults.MAX_NET_SCORE:
        return None
    return (
        "Risk thresholds must satisfy "
        f"1 <= medium < high < critical <= {ConfigDefaults.MAX_NET_SCORE}"
    )


def validate_global_config_value(
    config: GlobalConfig,
    value: str,
    *,
    peer_thresholds: dict[str, int] | None = None,
) -> None:
    if config.value_type == "int":
        try:
            int_val = int(value)
        except ValueError:
            raise ValidationError("Value must be an integer") from None
        if config.min_value is not None and int_val < config.min_value:
            raise ValidationError(f"Value must be >= {config.min_value}")
        if config.max_value is not None and int_val > config.max_value:
            raise ValidationError(f"Value must be <= {config.max_value}")
        if config.key in RISK_THRESHOLD_KEYS and peer_thresholds is not None:
            thresholds = dict(peer_thresholds)
            thresholds[RISK_THRESHOLD_KEYS[config.key]] = int_val
            detail = _threshold_validation_detail(
                medium=thresholds["medium"],
                high=thresholds["high"],
                critical=thresholds["critical"],
            )
            if detail is not None:
                raise ValidationError(detail)
    elif config.value_type == "bool" and value.lower() not in ("true", "false", "1", "0"):
        raise ValidationError("Value must be true or false")


async def _load_risk_threshold_values(db: AsyncSession) -> dict[str, int]:
    thresholds = {
        "medium": ConfigDefaults.MEDIUM_RISK_MIN_NET_SCORE,
        "high": ConfigDefaults.HIGH_RISK_MIN_NET_SCORE,
        "critical": ConfigDefaults.CRITICAL_RISK_MIN_NET_SCORE,
    }
    result = await db.execute(select(GlobalConfig).where(GlobalConfig.key.in_(RISK_THRESHOLD_KEYS)))
    for threshold_config in result.scalars().all():
        threshold_name = RISK_THRESHOLD_KEYS[threshold_config.key]
        thresholds[threshold_name] = int(threshold_config.value)
    return thresholds


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
        raise NotFoundError(f"Config key '{key}' not found")
    if not config.is_editable:
        raise ValidationError("This config value cannot be edited")

    peer_thresholds = await _load_risk_threshold_values(db) if config.key in RISK_THRESHOLD_KEYS else None
    validate_global_config_value(config, data.value, peer_thresholds=peer_thresholds)

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
