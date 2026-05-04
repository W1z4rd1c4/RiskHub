from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ReleaseParityFacadePlan:
    phases: list[str]
    facts: dict[str, Any]
