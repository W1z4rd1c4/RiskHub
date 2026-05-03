from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class VendorReportDefinition:
    report_type: str
    headers: tuple[str, ...]
    row_mapper: Any
