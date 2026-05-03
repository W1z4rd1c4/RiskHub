from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ControlRiskAccessDecision:
    allowed: bool
    status_code: int | None = None
    detail: str | None = None
