from __future__ import annotations


def calculate_changes(
    this_quarter: dict,
    last_quarter: dict,
    unavailable_snapshot_metrics: set[str],
) -> dict:
    changes = {}
    metric_keys = set(this_quarter) | set(last_quarter) | unavailable_snapshot_metrics
    for key in metric_keys:
        if key in unavailable_snapshot_metrics:
            changes[key] = {
                "absolute": 0,
                "percentage": 0,
                "direction": "unknown",
                "note": "Snapshot unavailable for selected period",
            }
            continue

        old_val = last_quarter.get(key, 0)
        new_val = this_quarter.get(key, 0)
        pct_change = 100 if old_val == 0 and new_val > 0 else 0 if old_val == 0 else round(
            ((new_val - old_val) / old_val) * 100, 1
        )
        changes[key] = {
            "absolute": new_val - old_val,
            "percentage": pct_change,
            "direction": "up" if new_val > old_val else ("down" if new_val < old_val else "same"),
        }

    return changes
