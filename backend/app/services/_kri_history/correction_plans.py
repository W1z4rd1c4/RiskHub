from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class KriCorrectionPlan:
    entry_id: int
    pending_changes: dict[str, Any]


def build_kri_correction_plan(*, entry_id: int, pending_changes: dict[str, Any]) -> KriCorrectionPlan:
    return KriCorrectionPlan(entry_id=entry_id, pending_changes=pending_changes)
