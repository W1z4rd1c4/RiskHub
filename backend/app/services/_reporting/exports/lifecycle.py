from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from fastapi.responses import StreamingResponse

from app.api.v1.endpoints.reports.unified_exports._shared import ExportFormat
from app.api.v1.endpoints.reports.unified_exports.pipeline import (
    ExportPipelineDefinition,
    ExportRow,
    render_export_pipeline,
)

ReportExportDefinition = ExportPipelineDefinition


@dataclass(frozen=True)
class ReportExportExecutionPlan:
    definition: ReportExportDefinition
    export_format: ExportFormat
    as_of_date: date
    rows: list[ExportRow]


@dataclass(frozen=True)
class ReportExportOutcome:
    response: StreamingResponse


async def render_report_export_definition(
    *,
    definition: ReportExportDefinition,
    export_format: ExportFormat,
    as_of_date: date,
    rows: list[ExportRow],
) -> StreamingResponse:
    return await render_export_pipeline(
        definition=definition,
        export_format=export_format,
        as_of_date=as_of_date,
        rows=rows,
    )
