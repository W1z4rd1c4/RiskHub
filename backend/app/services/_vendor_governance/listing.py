from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class VendorListingGovernance:
    criteria: Any
    group_by: str | None = None
    drilldown_group: str | None = None
