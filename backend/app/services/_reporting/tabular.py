from __future__ import annotations

import csv
from datetime import date, datetime
from io import BytesIO

from app.services.report_export_limits import (
    MAX_SYNC_EXPORT_BYTES,
    enforce_sync_export_byte_limit,
    enforce_sync_export_row_limit,
)


def _format_export_value(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _sanitize_csv_cell(value: str) -> str:
    """
    Prevent CSV formula injection by prefixing risky leading characters.
    """
    if not value:
        return value
    if value[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{value}"
    return value


def generate_tabular_csv(headers: list[str], rows: list[list[object]]) -> bytes:
    enforce_sync_export_row_limit(len(rows))
    buffer = BytesIO()

    class _Writer:
        def write(self, chunk: str) -> int:
            encoded = chunk.encode("utf-8")
            enforce_sync_export_byte_limit(buffer.tell() + len(encoded), maximum=MAX_SYNC_EXPORT_BYTES)
            buffer.write(encoded)
            return len(chunk)

    writer = csv.writer(_Writer())
    writer.writerow(headers)
    for row in rows:
        writer.writerow([_sanitize_csv_cell(_format_export_value(cell)) for cell in row])

    return buffer.getvalue()
