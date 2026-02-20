from __future__ import annotations

import csv
from datetime import date, datetime
from io import BytesIO


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
    buffer = BytesIO()
    text_buffer = []

    class _Writer:
        def write(self, chunk: str) -> int:
            text_buffer.append(chunk)
            return len(chunk)

    writer = csv.writer(_Writer())
    writer.writerow(headers)
    for row in rows:
        writer.writerow([_sanitize_csv_cell(_format_export_value(cell)) for cell in row])

    buffer.write("".join(text_buffer).encode("utf-8"))
    buffer.seek(0)
    return buffer.getvalue()
