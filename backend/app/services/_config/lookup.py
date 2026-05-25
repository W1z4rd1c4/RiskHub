from __future__ import annotations

import json
import time
from typing import TYPE_CHECKING, Any, TypeVar, overload

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")

_config_cache: dict[str, tuple[Any, float]] = {}
_CACHE_TTL_SECONDS = 60


class ConfigDefaults:
    """Default values for global configuration keys."""

    MEDIUM_RISK_MIN_NET_SCORE = 5
    HIGH_RISK_MIN_NET_SCORE = 10
    CRITICAL_RISK_MIN_NET_SCORE = 16
    MAX_NET_SCORE = 25
    TOTAL_ASSETS_VALUE = 10_000_000_000

    ADVANCE_REMINDER_DAYS = 7
    OVERDUE_REMINDER_WEEKS = 1
    DUPLICATE_LOOKBACK_DAYS = 7

    QUESTIONNAIRE_PRE_DUE_REMINDER_DAYS = 2
    QUESTIONNAIRE_OVERDUE_REMINDER_WEEKDAY = 0

    NEAR_BREACH_THRESHOLD = 0.80

    CONTROL_EXECUTION_STALE_DAYS = 365
    KRI_WARNING_UPPER_MARGIN_RATIO = 0.10


def parse_global_config_value(value: str, value_type: str) -> Any:
    if value_type == "int":
        return int(value)
    if value_type == "bool":
        return value.lower() in ("true", "1", "yes")
    if value_type == "json":
        return json.loads(value)
    return value


def serialize_global_config_value(value: Any, value_type: str) -> str:
    if value_type == "int":
        return str(int(value))
    if value_type == "bool":
        return "true" if value else "false"
    if value_type == "json":
        return json.dumps(value)
    return str(value)


async def get_risk_thresholds(db: "AsyncSession") -> tuple[int, int, int]:
    medium = await get_config_int(db, "medium_risk_min_net_score", ConfigDefaults.MEDIUM_RISK_MIN_NET_SCORE)
    high = await get_config_int(db, "high_risk_min_net_score", ConfigDefaults.HIGH_RISK_MIN_NET_SCORE)
    critical = await get_config_int(db, "critical_risk_min_net_score", ConfigDefaults.CRITICAL_RISK_MIN_NET_SCORE)
    return medium, high, critical


def build_risk_level_ranges(medium: int, high: int, critical: int) -> dict[str, tuple[int, int]]:
    if not (1 <= medium < high < critical <= ConfigDefaults.MAX_NET_SCORE):
        raise ValueError("non-increasing thresholds")
    return {
        "critical": (critical, ConfigDefaults.MAX_NET_SCORE),
        "high": (high, critical - 1),
        "medium": (medium, high - 1),
        "low": (1, medium - 1),
    }


@overload
async def get_config_value(db: "AsyncSession", key: str) -> Any | None: ...


@overload
async def get_config_value(db: "AsyncSession", key: str, default: T) -> T: ...


async def get_config_value(db: "AsyncSession", key: str, default: T | None = None) -> T | Any | None:
    from sqlalchemy import select

    from app.models.global_config import GlobalConfig

    now = time.time()
    if key in _config_cache:
        value, cached_at = _config_cache[key]
        if now - cached_at < _CACHE_TTL_SECONDS:
            return value

    result = await db.execute(select(GlobalConfig).where(GlobalConfig.key == key))
    config = result.scalar_one_or_none()

    if config:
        typed_value = parse_global_config_value(config.value, config.value_type)
        _config_cache[key] = (typed_value, now)
        return typed_value

    _config_cache[key] = (default, now)
    return default


async def get_config_int(db: "AsyncSession", key: str, default: int) -> int:
    value = await get_config_value(db, key, default)
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


async def get_config_float(db: "AsyncSession", key: str, default: float) -> float:
    value = await get_config_value(db, key, default)
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def clear_config_cache() -> None:
    _config_cache.clear()
