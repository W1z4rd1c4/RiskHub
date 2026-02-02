from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, Any

from app.models.vendor import Vendor


@dataclass(frozen=True)
class VendorSignalResult:
    provider_key: str
    signal_type: str
    payload: dict[str, Any]


class VendorSignalConnector(Protocol):
    provider_key: str

    def supports(self, vendor: Vendor) -> bool: ...

    async def fetch(self, vendor: Vendor) -> list[VendorSignalResult]: ...

