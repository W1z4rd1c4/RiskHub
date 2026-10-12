"""Declared read-model caller surface; policy implementation stays package-private."""

from importlib import import_module
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.services._dashboard_metrics.controls import (
        load_control_dashboard_metrics as load_control_dashboard_metrics,
    )
    from app.services._dashboard_metrics.controls import load_control_trends as load_control_trends
    from app.services._dashboard_metrics.departments import (
        load_department_dashboard_metrics as load_department_dashboard_metrics,
    )
    from app.services._dashboard_metrics.issues import build_issue_aging_metrics as build_issue_aging_metrics
    from app.services._dashboard_metrics.issues import (
        build_issue_dashboard_metrics_bundle as build_issue_dashboard_metrics_bundle,
    )
    from app.services._dashboard_metrics.issues import build_issue_severity_metrics as build_issue_severity_metrics
    from app.services._dashboard_metrics.issues import build_issue_summary_metrics as build_issue_summary_metrics
    from app.services._dashboard_metrics.kris import load_kri_breach_trends as load_kri_breach_trends
    from app.services._dashboard_metrics.kris import load_kri_dashboard_metrics as load_kri_dashboard_metrics
    from app.services._dashboard_metrics.lifecycle import build_available_periods as build_available_periods
    from app.services._dashboard_metrics.lifecycle import (
        build_committee_summary_metrics as build_committee_summary_metrics,
    )
    from app.services._dashboard_metrics.lifecycle import (
        build_dashboard_summary_metrics as build_dashboard_summary_metrics,
    )
    from app.services._dashboard_metrics.risks import load_risk_dashboard_metrics as load_risk_dashboard_metrics
    from app.services._dashboard_metrics.risks import load_risk_distribution as load_risk_distribution
    from app.services._dashboard_metrics.risks import load_risk_trends as load_risk_trends
    from app.services._dashboard_metrics.risks import load_risks_by_cell as load_risks_by_cell

CALLER_EXPORTS = {
    "build_available_periods": ("endpoint", "service"),
    "build_committee_summary_metrics": ("endpoint", "service"),
    "build_dashboard_summary_metrics": ("endpoint", "service"),
    "build_issue_aging_metrics": ("endpoint", "service"),
    "build_issue_dashboard_metrics_bundle": ("endpoint", "service"),
    "build_issue_severity_metrics": ("endpoint", "service"),
    "build_issue_summary_metrics": ("endpoint", "service"),
    "load_control_dashboard_metrics": ("service",),
    "load_control_trends": ("endpoint", "service"),
    "load_department_dashboard_metrics": ("endpoint", "service"),
    "load_kri_breach_trends": ("endpoint", "service"),
    "load_kri_dashboard_metrics": ("service",),
    "load_risk_dashboard_metrics": ("service",),
    "load_risk_distribution": ("endpoint", "service"),
    "load_risk_trends": ("endpoint", "service"),
    "load_risks_by_cell": ("endpoint", "service"),
}
CALLER_ROLES = {}  # type: dict[str, str]
CALLER_FACADES = ()
__all__ = list(CALLER_EXPORTS)

_BINDINGS = {
    "build_available_periods": ("app.services._dashboard_metrics.lifecycle", "build_available_periods"),
    "build_committee_summary_metrics": ("app.services._dashboard_metrics.lifecycle", "build_committee_summary_metrics"),
    "build_dashboard_summary_metrics": ("app.services._dashboard_metrics.lifecycle", "build_dashboard_summary_metrics"),
    "build_issue_aging_metrics": ("app.services._dashboard_metrics.issues", "build_issue_aging_metrics"),
    "build_issue_dashboard_metrics_bundle": (
        "app.services._dashboard_metrics.issues",
        "build_issue_dashboard_metrics_bundle",
    ),
    "build_issue_severity_metrics": ("app.services._dashboard_metrics.issues", "build_issue_severity_metrics"),
    "build_issue_summary_metrics": ("app.services._dashboard_metrics.issues", "build_issue_summary_metrics"),
    "load_control_dashboard_metrics": ("app.services._dashboard_metrics.controls", "load_control_dashboard_metrics"),
    "load_control_trends": ("app.services._dashboard_metrics.controls", "load_control_trends"),
    "load_department_dashboard_metrics": (
        "app.services._dashboard_metrics.departments",
        "load_department_dashboard_metrics",
    ),
    "load_kri_breach_trends": ("app.services._dashboard_metrics.kris", "load_kri_breach_trends"),
    "load_kri_dashboard_metrics": ("app.services._dashboard_metrics.kris", "load_kri_dashboard_metrics"),
    "load_risk_dashboard_metrics": ("app.services._dashboard_metrics.risks", "load_risk_dashboard_metrics"),
    "load_risk_distribution": ("app.services._dashboard_metrics.risks", "load_risk_distribution"),
    "load_risk_trends": ("app.services._dashboard_metrics.risks", "load_risk_trends"),
    "load_risks_by_cell": ("app.services._dashboard_metrics.risks", "load_risks_by_cell"),
}


def __getattr__(name: str) -> Any:
    if name not in _BINDINGS:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attribute_name = _BINDINGS[name]
    return getattr(import_module(module_name), attribute_name)
