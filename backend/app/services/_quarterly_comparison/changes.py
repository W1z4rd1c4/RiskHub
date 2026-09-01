from __future__ import annotations

from typing import Literal

SuppressionReason = Literal[
    "different_definition",
    "incomparable_source",
    "missing_definition",
    "missing_observation",
    "unequal_window",
]


def calculate_changes(
    this_quarter: dict,
    last_quarter: dict,
    suppressed_metrics: dict[str, SuppressionReason],
) -> dict:
    changes = {}
    metric_keys = set(this_quarter) | set(last_quarter) | set(suppressed_metrics)
    for key in metric_keys:
        if key in suppressed_metrics:
            changes[key] = {
                "absolute": None,
                "percentage": None,
                "direction": "unknown",
                "reason": suppressed_metrics[key],
            }
            continue

        old_val = last_quarter.get(key, 0)
        new_val = this_quarter.get(key, 0)
        if old_val == 0 and new_val != 0:
            changes[key] = {
                "absolute": new_val,
                "percentage": None,
                "direction": "unknown",
                "reason": "baseline_zero",
            }
            continue

        pct_change = 0 if old_val == 0 else round(((new_val - old_val) / old_val) * 100, 1)
        changes[key] = {
            "absolute": new_val - old_val,
            "percentage": pct_change,
            "direction": "up" if new_val > old_val else ("down" if new_val < old_val else "same"),
        }

    return changes
