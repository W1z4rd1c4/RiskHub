from datetime import UTC, date, datetime
from io import BytesIO
from typing import Literal

from fastapi.responses import StreamingResponse

_EXCEL_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_CSV_MEDIA_TYPE = "text/csv; charset=utf-8"

ExportFormat = Literal["xlsx", "csv"]


def _get_filename(base: str, ext: str, as_of_date: date | None = None) -> str:
    date_str = (as_of_date or datetime.now(UTC).date()).strftime("%Y-%m-%d")
    return f"{base}-{date_str}.{ext}"


def _stream_binary(
    *,
    filename_base: str,
    export_format: ExportFormat,
    content_bytes: bytes,
    as_of_date: date | None = None,
) -> StreamingResponse:
    ext = "xlsx" if export_format == "xlsx" else "csv"
    media_type = {
        "xlsx": _EXCEL_MEDIA_TYPE,
        "csv": _CSV_MEDIA_TYPE,
    }[export_format]
    return StreamingResponse(
        BytesIO(content_bytes),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{_get_filename(filename_base, ext, as_of_date)}"'},
    )
