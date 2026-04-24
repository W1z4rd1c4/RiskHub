"""Internal orchestration helpers for unified export builders."""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from datetime import date
from inspect import isawaitable
from typing import Any

from fastapi.responses import StreamingResponse

from ._shared import ExportFormat
from .render import _render_export

ExportRow = dict[str, Any]
ExportStage = Callable[[list[ExportRow]], list[ExportRow] | Awaitable[list[ExportRow]]]
RenderExport = Callable[..., StreamingResponse]


@dataclass(frozen=True)
class ExportPipelineDefinition:
    """Static render configuration for a tabular export pipeline."""

    title: str
    sheet_name: str
    filename_base: str
    headers: list[str]


async def apply_export_stages(
    rows: list[ExportRow],
    stages: Sequence[ExportStage],
) -> list[ExportRow]:
    """Apply sync or async row stages in order."""
    current = rows
    for stage in stages:
        next_rows = stage(current)
        if isawaitable(next_rows):
            current = await next_rows
        else:
            current = next_rows
    return current


async def render_export_pipeline(
    *,
    definition: ExportPipelineDefinition,
    export_format: ExportFormat,
    as_of_date: date,
    rows: list[ExportRow],
    stages: Sequence[ExportStage],
    row_values: Callable[[ExportRow], list[Any]],
    render_export: RenderExport = _render_export,
) -> StreamingResponse:
    """Run row stages, convert rows to cell values, and render the export response."""
    final_rows = await apply_export_stages(rows, stages)
    data_rows = [row_values(row) for row in final_rows]

    return render_export(
        title=definition.title,
        sheet_name=definition.sheet_name,
        filename_base=definition.filename_base,
        export_format=export_format,
        headers=definition.headers,
        data_rows=data_rows,
        as_of_date=as_of_date,
    )
