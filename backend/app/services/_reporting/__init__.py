"""Declared caller surface; implementation modules remain package-private."""

from importlib import import_module
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.services._reporting.asset_register_export import render_asset_register_csv as render_asset_register_csv
    from app.services._reporting.current_register import build_kri_register_rows as build_kri_register_rows
    from app.services._reporting.excel import build_audit_trail_export as build_audit_trail_export
    from app.services._reporting.excel import build_summary_export as build_summary_export
    from app.services._reporting.exports import get_export_builder as get_export_builder
    from app.services._reporting.exports.issue_rows import build_issue_export_rows as build_issue_export_rows
    from app.services._reporting.exports.lifecycle import ReportExportDefinition as ReportExportDefinition
    from app.services._reporting.exports.lifecycle import (
        render_report_export_definition as render_report_export_definition,
    )
    from app.services._reporting.exports.shared import ControlMonitoringExportStatus as ControlMonitoringExportStatus
    from app.services._reporting.exports.shared import KRIExportStatus as KRIExportStatus
    from app.services._reporting.exports.shared import KRIMonitoringExportStatus as KRIMonitoringExportStatus
    from app.services._reporting.exports.shared import KRITimelinessExportStatus as KRITimelinessExportStatus
    from app.services._reporting.kri_issue_register_export import render_issue_register_csv as render_issue_register_csv
    from app.services._reporting.kri_issue_register_export import render_kri_register_csv as render_kri_register_csv
    from app.services._reporting.process_register_export import (
        render_process_register_csv as render_process_register_csv,
    )
    from app.services._reporting.risk_control_register_export import (
        render_control_register_csv as render_control_register_csv,
    )
    from app.services._reporting.risk_control_register_export import (
        render_risk_register_csv as render_risk_register_csv,
    )
    from app.services._reporting.tabular import generate_tabular_csv as generate_tabular_csv
    from app.services._reporting.threat_register_export import render_threat_register_csv as render_threat_register_csv
    from app.services._reporting.vendor_register_export import render_vendor_register_csv as render_vendor_register_csv

CALLER_EXPORTS = {
    "ControlMonitoringExportStatus": ("endpoint", "service"),
    "KRIExportStatus": ("endpoint", "service"),
    "KRIMonitoringExportStatus": ("endpoint", "service"),
    "KRITimelinessExportStatus": ("endpoint", "service"),
    "ReportExportDefinition": ("service",),
    "build_audit_trail_export": ("endpoint", "service"),
    "build_issue_export_rows": ("endpoint", "service"),
    "build_kri_register_rows": ("endpoint", "service"),
    "build_summary_export": ("endpoint", "service"),
    "generate_tabular_csv": ("endpoint", "service"),
    "get_export_builder": ("endpoint", "service"),
    "render_asset_register_csv": ("endpoint", "service"),
    "render_control_register_csv": ("endpoint", "service"),
    "render_issue_register_csv": ("endpoint", "service"),
    "render_kri_register_csv": ("endpoint", "service"),
    "render_process_register_csv": ("endpoint", "service"),
    "render_report_export_definition": ("service",),
    "render_risk_register_csv": ("endpoint", "service"),
    "render_threat_register_csv": ("endpoint", "service"),
    "render_vendor_register_csv": ("endpoint", "service"),
}
CALLER_ROLES = {}  # type: dict[str, str]
CALLER_FACADES = ()
__all__ = list(CALLER_EXPORTS)

_BINDINGS = {
    "ControlMonitoringExportStatus": ("app.services._reporting.exports.shared", "ControlMonitoringExportStatus"),
    "KRIExportStatus": ("app.services._reporting.exports.shared", "KRIExportStatus"),
    "KRIMonitoringExportStatus": ("app.services._reporting.exports.shared", "KRIMonitoringExportStatus"),
    "KRITimelinessExportStatus": ("app.services._reporting.exports.shared", "KRITimelinessExportStatus"),
    "ReportExportDefinition": ("app.services._reporting.exports.lifecycle", "ReportExportDefinition"),
    "build_audit_trail_export": ("app.services._reporting.excel", "build_audit_trail_export"),
    "build_issue_export_rows": ("app.services._reporting.exports.issue_rows", "build_issue_export_rows"),
    "build_kri_register_rows": ("app.services._reporting.current_register", "build_kri_register_rows"),
    "build_summary_export": ("app.services._reporting.excel", "build_summary_export"),
    "generate_tabular_csv": ("app.services._reporting.tabular", "generate_tabular_csv"),
    "get_export_builder": ("app.services._reporting.exports", "get_export_builder"),
    "render_asset_register_csv": ("app.services._reporting.asset_register_export", "render_asset_register_csv"),
    "render_control_register_csv": (
        "app.services._reporting.risk_control_register_export",
        "render_control_register_csv",
    ),
    "render_issue_register_csv": ("app.services._reporting.kri_issue_register_export", "render_issue_register_csv"),
    "render_kri_register_csv": ("app.services._reporting.kri_issue_register_export", "render_kri_register_csv"),
    "render_process_register_csv": ("app.services._reporting.process_register_export", "render_process_register_csv"),
    "render_report_export_definition": ("app.services._reporting.exports.lifecycle", "render_report_export_definition"),
    "render_risk_register_csv": ("app.services._reporting.risk_control_register_export", "render_risk_register_csv"),
    "render_threat_register_csv": ("app.services._reporting.threat_register_export", "render_threat_register_csv"),
    "render_vendor_register_csv": ("app.services._reporting.vendor_register_export", "render_vendor_register_csv"),
}


def __getattr__(name: str) -> Any:
    if name not in _BINDINGS:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attribute_name = _BINDINGS[name]
    return getattr(import_module(module_name), attribute_name)
