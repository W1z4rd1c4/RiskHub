from collections.abc import Awaitable, Callable, Mapping
from types import MappingProxyType

from fastapi.responses import StreamingResponse

from .controls import _export_controls
from .issues import _export_issues
from .kris import _export_kris
from .lifecycle import (
    ExportRow,
    ReportExportDefinition,
    render_report_export_definition,
)
from .risks import _export_risks
from .vendors import _export_vendors

ExportBuilder = Callable[..., Awaitable[StreamingResponse]]

EXPORT_BUILDERS: Mapping[str, ExportBuilder] = MappingProxyType(
    {
        "controls": _export_controls,
        "issues": _export_issues,
        "kris": _export_kris,
        "risks": _export_risks,
        "vendors": _export_vendors,
    }
)


def get_export_builder(resource: str) -> ExportBuilder:
    return EXPORT_BUILDERS[resource]


__all__ = [
    "EXPORT_BUILDERS",
    "ExportBuilder",
    "ExportRow",
    "ReportExportDefinition",
    "_export_controls",
    "_export_issues",
    "_export_kris",
    "_export_risks",
    "_export_vendors",
    "get_export_builder",
    "render_report_export_definition",
]
