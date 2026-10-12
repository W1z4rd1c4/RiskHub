"""Declared read-model caller surface; policy implementation stays package-private."""

from importlib import import_module
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.services._quarterly_comparison.composition import PERIOD_METRICS as PERIOD_METRICS
    from app.services._quarterly_comparison.composition import SNAPSHOT_METRICS as SNAPSHOT_METRICS
    from app.services._quarterly_comparison.composition import build_quarterly_comparison as build_quarterly_comparison
    from app.services._quarterly_comparison.periods import parse_quarter as parse_quarter

CALLER_EXPORTS = {
    "PERIOD_METRICS": ("service",),
    "SNAPSHOT_METRICS": ("service",),
    "build_quarterly_comparison": ("service",),
    "parse_quarter": ("service",),
}
CALLER_ROLES = {}  # type: dict[str, str]
CALLER_FACADES = ()
__all__ = list(CALLER_EXPORTS)

_BINDINGS = {
    "PERIOD_METRICS": ("app.services._quarterly_comparison.composition", "PERIOD_METRICS"),
    "SNAPSHOT_METRICS": ("app.services._quarterly_comparison.composition", "SNAPSHOT_METRICS"),
    "build_quarterly_comparison": ("app.services._quarterly_comparison.composition", "build_quarterly_comparison"),
    "parse_quarter": ("app.services._quarterly_comparison.periods", "parse_quarter"),
}


def __getattr__(name: str) -> Any:
    if name not in _BINDINGS:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attribute_name = _BINDINGS[name]
    return getattr(import_module(module_name), attribute_name)
