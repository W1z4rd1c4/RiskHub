from __future__ import annotations

from app.models.global_config import ConfigDefaults, get_config_float, get_config_int

from .types import ControlMonitoringConfig, KRIMonitoringConfig

CONTROL_EXECUTION_STALE_DAYS_KEY = "control_execution_stale_days"
KRI_WARNING_UPPER_MARGIN_RATIO_KEY = "kri_warning_upper_margin_ratio"


async def get_control_monitoring_config(db) -> ControlMonitoringConfig:
    stale_days = await get_config_int(
        db,
        CONTROL_EXECUTION_STALE_DAYS_KEY,
        ConfigDefaults.CONTROL_EXECUTION_STALE_DAYS,
    )
    return ControlMonitoringConfig(execution_stale_days=max(stale_days, 0))


async def get_kri_monitoring_config(db) -> KRIMonitoringConfig:
    raw_ratio = await get_config_float(
        db,
        KRI_WARNING_UPPER_MARGIN_RATIO_KEY,
        ConfigDefaults.KRI_WARNING_UPPER_MARGIN_RATIO,
    )
    warning_upper_margin_ratio = min(max(raw_ratio, 0.0), 1.0)
    return KRIMonitoringConfig(warning_upper_margin_ratio=warning_upper_margin_ratio)
