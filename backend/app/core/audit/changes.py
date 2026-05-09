from __future__ import annotations

from collections.abc import Mapping
from datetime import date, datetime
from enum import Enum

REDACTED_CHANGE_FIELDS = {"password", "hashed_password"}


def _normalize_change_value(value: object) -> object:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, datetime | date):
        return value.isoformat()
    return value


def build_change_set_from_snapshots(
    before_data: Mapping[str, object],
    after_data: Mapping[str, object],
) -> dict[str, dict[str, object]] | None:
    changes: dict[str, dict[str, object]] = {}
    for field in sorted(set(before_data) | set(after_data)):
        if field in REDACTED_CHANGE_FIELDS:
            continue
        old_value = _normalize_change_value(before_data.get(field))
        new_value = _normalize_change_value(after_data.get(field))
        if old_value != new_value:
            changes[field] = {"old": old_value, "new": new_value}
    return changes or None


def resolve_audit_changes(
    *,
    changes: dict[str, dict[str, object]] | None = None,
    before_data: Mapping[str, object] | None = None,
    after_data: Mapping[str, object] | None = None,
) -> dict[str, dict[str, object]] | None:
    """Prefer adapter-owned before/after diffs; keep explicit changes for non-diff events."""

    if changes is not None:
        return changes
    if before_data is not None and after_data is not None:
        return build_change_set_from_snapshots(before_data, after_data)
    return None
