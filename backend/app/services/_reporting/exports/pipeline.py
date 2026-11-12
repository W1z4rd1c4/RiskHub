from __future__ import annotations

from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from datetime import date
from inspect import isawaitable
from typing import Any, Literal

from fastapi.responses import StreamingResponse

from app.core.datetime_utils import utc_now
from app.services._reporting.tabular import generate_tabular_csv
from app.services.report_export_limits import enforce_sync_export_row_limit

ExportFormat = Literal["csv"]
ExportRow = dict[str, Any]
ExportStage = Callable[[list[ExportRow]], list[ExportRow] | Awaitable[list[ExportRow]]]
RenderExport = Callable[..., StreamingResponse]


@dataclass(frozen=True)
class ExportPipelineDefinition:
    title: str
    sheet_name: str
    filename_base: str
    headers: list[str]
    stages: Sequence[ExportStage] = ()
    row_values: Callable[[ExportRow], list[Any]] | None = None


def _get_filename(base: str, ext: str, as_of_date: date | None = None) -> str:
    date_str = (as_of_date or utc_now().date()).strftime("%Y-%m-%d")
    return f"{base}-{date_str}.{ext}"


def _stream_binary(
    *,
    filename_base: str,
    export_format: ExportFormat,
    content_bytes: bytes,
    as_of_date: date | None = None,
) -> StreamingResponse:
    return StreamingResponse(
        iter((content_bytes,)),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{_get_filename(filename_base, export_format, as_of_date)}"'
            )
        },
    )


def _render_export(
    *,
    title: str,
    sheet_name: str,
    filename_base: str,
    export_format: ExportFormat,
    headers: list[str],
    data_rows: list[list[Any]],
    as_of_date: date,
) -> StreamingResponse:
    return _stream_binary(
        filename_base=filename_base,
        export_format=export_format,
        content_bytes=generate_tabular_csv(headers, data_rows),
        as_of_date=as_of_date,
    )


async def apply_export_stages(
    rows: list[ExportRow],
    stages: Sequence[ExportStage],
) -> list[ExportRow]:
    current = rows
    enforce_sync_export_row_limit(len(current))
    for stage in stages:
        next_rows = stage(current)
        current = await next_rows if isawaitable(next_rows) else next_rows
        enforce_sync_export_row_limit(len(current))
    return current


async def render_export_pipeline(
    *,
    definition: ExportPipelineDefinition,
    export_format: ExportFormat,
    as_of_date: date,
    rows: list[ExportRow],
    stages: Sequence[ExportStage] | None = None,
    row_values: Callable[[ExportRow], list[Any]] | None = None,
    render_export: RenderExport = _render_export,
) -> StreamingResponse:
    resolved_stages = definition.stages if stages is None else stages
    resolved_row_values = definition.row_values if row_values is None else row_values
    if resolved_row_values is None:
        raise ValueError("Export pipeline requires row_values")

    final_rows = await apply_export_stages(rows, resolved_stages)
    data_rows = [resolved_row_values(row) for row in final_rows]

    return render_export(
        title=definition.title,
        sheet_name=definition.sheet_name,
        filename_base=definition.filename_base,
        export_format=export_format,
        headers=definition.headers,
        data_rows=data_rows,
        as_of_date=as_of_date,
    )
