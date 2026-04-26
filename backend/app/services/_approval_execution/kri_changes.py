from __future__ import annotations

from app.models import KeyRiskIndicator


def build_kri_changes(
    kri: KeyRiskIndicator,
    old_current_value,
    old_last_period_end,
    old_last_reported_at,
) -> dict[str, dict[str, object]]:
    changes: dict[str, dict[str, object]] = {}
    if old_current_value != kri.current_value:
        changes["current_value"] = {"old": old_current_value, "new": kri.current_value}
    if old_last_period_end != kri.last_period_end:
        changes["last_period_end"] = {"old": old_last_period_end, "new": kri.last_period_end}
    if old_last_reported_at != kri.last_reported_at:
        changes["last_reported_at"] = {"old": old_last_reported_at, "new": kri.last_reported_at}
    return changes
