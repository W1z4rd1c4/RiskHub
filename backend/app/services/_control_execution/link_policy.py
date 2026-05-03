from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ControlRiskLinkPlan:
    control_id: int
    risk_id: int
    effectiveness: str | None = None
    notes: str | None = None
