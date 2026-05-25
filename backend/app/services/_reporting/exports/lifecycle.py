from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from fastapi.responses import StreamingResponse

from app.services._reporting.exports.pipeline import (
    ExportFormat,
    ExportPipelineDefinition,
    ExportRow,
    render_export_pipeline,
)


@dataclass(frozen=True)
class ReportExportDefinition(ExportPipelineDefinition):
    pass


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
