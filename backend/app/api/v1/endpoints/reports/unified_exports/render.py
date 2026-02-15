from datetime import date
from typing import Any

from fastapi.responses import StreamingResponse

from app.services.report_service import generate_tabular_csv, generate_tabular_excel

from .._streaming import _stream_binary
from ._shared import ExportFormat


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
    if export_format == "xlsx":
        content = generate_tabular_excel(sheet_name, headers, data_rows)
    else:
        content = generate_tabular_csv(headers, data_rows)

    return _stream_binary(
        filename_base=filename_base,
        export_format=export_format,
        content_bytes=content,
        as_of_date=as_of_date,
    )

