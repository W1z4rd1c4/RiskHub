"""Declared read-model caller surface; policy implementation stays package-private."""

from importlib import import_module
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.services._monitoring_status.config import (
        CONTROL_EXECUTION_STALE_DAYS_KEY as CONTROL_EXECUTION_STALE_DAYS_KEY,
    )
    from app.services._monitoring_status.config import (
        KRI_WARNING_UPPER_MARGIN_RATIO_KEY as KRI_WARNING_UPPER_MARGIN_RATIO_KEY,
    )
    from app.services._monitoring_status.config import get_control_monitoring_config as get_control_monitoring_config
    from app.services._monitoring_status.config import get_kri_monitoring_config as get_kri_monitoring_config
    from app.services._monitoring_status.controls import (
        build_control_monitoring_facts as build_control_monitoring_facts,
    )
    from app.services._monitoring_status.controls import (
        derive_control_monitoring_snapshot as derive_control_monitoring_snapshot,
    )
    from app.services._monitoring_status.export_rows import (
        apply_control_monitoring_rows as apply_control_monitoring_rows,
    )
    from app.services._monitoring_status.export_rows import apply_kri_monitoring_rows as apply_kri_monitoring_rows
    from app.services._monitoring_status.kris import build_kri_monitoring_facts as build_kri_monitoring_facts
    from app.services._monitoring_status.kris import derive_kri_monitoring_snapshot as derive_kri_monitoring_snapshot
    from app.services._monitoring_status.kris import is_within_upper_warning_margin as is_within_upper_warning_margin
    from app.services._monitoring_status.queries import (
        apply_control_monitoring_status_filter as apply_control_monitoring_status_filter,
    )
    from app.services._monitoring_status.queries import (
        apply_kri_monitoring_status_filter as apply_kri_monitoring_status_filter,
    )
    from app.services._monitoring_status.queries import (
        apply_kri_timeliness_status_filter as apply_kri_timeliness_status_filter,
    )
    from app.services._monitoring_status.queries import (
        kri_monitoring_status_expression as kri_monitoring_status_expression,
    )
    from app.services._monitoring_status.types import ControlMonitoringConfig as ControlMonitoringConfig
    from app.services._monitoring_status.types import ControlMonitoringFacts as ControlMonitoringFacts
    from app.services._monitoring_status.types import ControlMonitoringReason as ControlMonitoringReason
    from app.services._monitoring_status.types import ControlMonitoringSnapshot as ControlMonitoringSnapshot
    from app.services._monitoring_status.types import ControlMonitoringStatus as ControlMonitoringStatus
    from app.services._monitoring_status.types import KRIMonitoringConfig as KRIMonitoringConfig
    from app.services._monitoring_status.types import KRIMonitoringFacts as KRIMonitoringFacts
    from app.services._monitoring_status.types import KRIMonitoringReason as KRIMonitoringReason
    from app.services._monitoring_status.types import KRIMonitoringSnapshot as KRIMonitoringSnapshot
    from app.services._monitoring_status.types import KRIMonitoringStatus as KRIMonitoringStatus
    from app.services._monitoring_status.types import KRITimelinessStatus as KRITimelinessStatus
    from app.services.kri_populations import classify_kri_breach as classify_kri_breach

CALLER_EXPORTS = {
    "CONTROL_EXECUTION_STALE_DAYS_KEY": ("service",),
    "ControlMonitoringConfig": ("service",),
    "ControlMonitoringFacts": ("service",),
    "ControlMonitoringReason": ("service",),
    "ControlMonitoringSnapshot": ("service",),
    "ControlMonitoringStatus": ("endpoint", "service"),
    "KRIMonitoringConfig": ("service",),
    "KRIMonitoringFacts": ("service",),
    "KRIMonitoringReason": ("service",),
    "KRIMonitoringSnapshot": ("service",),
    "KRIMonitoringStatus": ("endpoint", "service"),
    "KRITimelinessStatus": ("endpoint", "service"),
    "KRI_WARNING_UPPER_MARGIN_RATIO_KEY": ("service",),
    "apply_control_monitoring_rows": ("service",),
    "apply_control_monitoring_status_filter": ("endpoint", "service"),
    "apply_kri_monitoring_rows": ("service",),
    "apply_kri_monitoring_status_filter": ("endpoint", "service"),
    "apply_kri_timeliness_status_filter": ("service",),
    "build_control_monitoring_facts": ("service",),
    "build_kri_monitoring_facts": ("service",),
    "classify_kri_breach": ("service",),
    "derive_control_monitoring_snapshot": ("service",),
    "derive_kri_monitoring_snapshot": ("service",),
    "get_control_monitoring_config": ("endpoint", "service"),
    "get_kri_monitoring_config": ("endpoint", "service"),
    "is_within_upper_warning_margin": ("service",),
    "kri_monitoring_status_expression": ("service",),
}
CALLER_ROLES = {}  # type: dict[str, str]
CALLER_FACADES = ()
__all__ = list(CALLER_EXPORTS)

_BINDINGS = {
    "CONTROL_EXECUTION_STALE_DAYS_KEY": ("app.services._monitoring_status.config", "CONTROL_EXECUTION_STALE_DAYS_KEY"),
    "ControlMonitoringConfig": ("app.services._monitoring_status.types", "ControlMonitoringConfig"),
    "ControlMonitoringFacts": ("app.services._monitoring_status.types", "ControlMonitoringFacts"),
    "ControlMonitoringReason": ("app.services._monitoring_status.types", "ControlMonitoringReason"),
    "ControlMonitoringSnapshot": ("app.services._monitoring_status.types", "ControlMonitoringSnapshot"),
    "ControlMonitoringStatus": ("app.services._monitoring_status.types", "ControlMonitoringStatus"),
    "KRIMonitoringConfig": ("app.services._monitoring_status.types", "KRIMonitoringConfig"),
    "KRIMonitoringFacts": ("app.services._monitoring_status.types", "KRIMonitoringFacts"),
    "KRIMonitoringReason": ("app.services._monitoring_status.types", "KRIMonitoringReason"),
    "KRIMonitoringSnapshot": ("app.services._monitoring_status.types", "KRIMonitoringSnapshot"),
    "KRIMonitoringStatus": ("app.services._monitoring_status.types", "KRIMonitoringStatus"),
    "KRITimelinessStatus": ("app.services._monitoring_status.types", "KRITimelinessStatus"),
    "KRI_WARNING_UPPER_MARGIN_RATIO_KEY": (
        "app.services._monitoring_status.config",
        "KRI_WARNING_UPPER_MARGIN_RATIO_KEY",
    ),
    "apply_control_monitoring_rows": ("app.services._monitoring_status.export_rows", "apply_control_monitoring_rows"),
    "apply_control_monitoring_status_filter": (
        "app.services._monitoring_status.queries",
        "apply_control_monitoring_status_filter",
    ),
    "apply_kri_monitoring_rows": ("app.services._monitoring_status.export_rows", "apply_kri_monitoring_rows"),
    "apply_kri_monitoring_status_filter": (
        "app.services._monitoring_status.queries",
        "apply_kri_monitoring_status_filter",
    ),
    "apply_kri_timeliness_status_filter": (
        "app.services._monitoring_status.queries",
        "apply_kri_timeliness_status_filter",
    ),
    "build_control_monitoring_facts": ("app.services._monitoring_status.controls", "build_control_monitoring_facts"),
    "build_kri_monitoring_facts": ("app.services._monitoring_status.kris", "build_kri_monitoring_facts"),
    "classify_kri_breach": ("app.services.kri_populations", "classify_kri_breach"),
    "derive_control_monitoring_snapshot": (
        "app.services._monitoring_status.controls",
        "derive_control_monitoring_snapshot",
    ),
    "derive_kri_monitoring_snapshot": ("app.services._monitoring_status.kris", "derive_kri_monitoring_snapshot"),
    "get_control_monitoring_config": ("app.services._monitoring_status.config", "get_control_monitoring_config"),
    "get_kri_monitoring_config": ("app.services._monitoring_status.config", "get_kri_monitoring_config"),
    "is_within_upper_warning_margin": ("app.services._monitoring_status.kris", "is_within_upper_warning_margin"),
    "kri_monitoring_status_expression": ("app.services._monitoring_status.queries", "kri_monitoring_status_expression"),
}


def __getattr__(name: str) -> Any:
    if name not in _BINDINGS:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attribute_name = _BINDINGS[name]
    return getattr(import_module(module_name), attribute_name)
