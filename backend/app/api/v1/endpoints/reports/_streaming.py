from datetime import UTC, date, datetime
from io import BytesIO
from typing import Literal

from fastapi import HTTPException, status
from fastapi.responses import StreamingResponse

_CSV_MEDIA_TYPE = "text/csv; charset=utf-8"

ExportFormat = Literal["csv"]
ExportFormatQuery = Literal["xlsx", "csv"]

EXCEL_EXPORT_REMOVED_CODE = "excel_export_removed"
EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE = {
    410: {
        "description": "Excel export has been removed. Use CSV export instead.",
        "content": {
            "application/json": {
                "example": {
                    "detail": {
                        "code": EXCEL_EXPORT_REMOVED_CODE,
                        "message": "Excel export has been removed. Use CSV export instead.",
                        "replacement": "/api/v1/reports/controls/export?format=csv",
                    }
                }
            }
        },
    }
}


def excel_export_removed(*, replacement: str | None = None) -> HTTPException:
    detail: dict[str, str] = {
        "code": EXCEL_EXPORT_REMOVED_CODE,
        "message": "Excel export has been removed. Use CSV export instead.",
    }
    if replacement:
        detail["replacement"] = replacement
    return HTTPException(status_code=status.HTTP_410_GONE, detail=detail)


def resolve_export_format(export_format: ExportFormatQuery, *, replacement: str | None = None) -> ExportFormat:
    if export_format == "xlsx":
        raise excel_export_removed(replacement=replacement)
    return "csv"


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
    ext = "csv"
    media_type = _CSV_MEDIA_TYPE
    return StreamingResponse(
        BytesIO(content_bytes),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{_get_filename(filename_base, ext, as_of_date)}"'},
    )
