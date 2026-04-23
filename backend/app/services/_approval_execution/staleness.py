from __future__ import annotations

from collections.abc import Mapping

from app.models import ApprovalRequest, ApprovalStatus


def _normalize_value(value):
    if hasattr(value, "value"):
        return value.value
    if isinstance(value, list):
        return [_normalize_value(item) for item in value]
    return value


def reject_stale_change(approval: ApprovalRequest, field: str) -> None:
    approval.status = ApprovalStatus.REJECTED
    approval.resolution_notes = (
        (approval.resolution_notes or "").rstrip()
        + f"\nAuto-rejected: Resource changed before approval could be applied (field '{field}' no longer matches)."
    ).strip()


def reject_if_stale_pending_change(
    approval: ApprovalRequest,
    *,
    target,
    changes: Mapping,
    allowed_fields: set[str],
    field_aliases: Mapping[str, str] | None = None,
) -> bool:
    """Return True after marking approval rejected when pending old values are stale."""
    aliases = field_aliases or {}
    for field, vals in changes.items():
        mapped_field = aliases.get(field, field)
        if mapped_field not in allowed_fields or not isinstance(vals, Mapping) or "old" not in vals:
            continue
        if not hasattr(target, mapped_field):
            continue
        current_value = _normalize_value(getattr(target, mapped_field))
        expected_value = _normalize_value(vals.get("old"))
        if current_value != expected_value:
            reject_stale_change(approval, mapped_field)
            return True
    return False


def reject_if_stale_value(
    approval: ApprovalRequest,
    *,
    field: str,
    current_value,
    expected_value,
) -> bool:
    if _normalize_value(current_value) == _normalize_value(expected_value):
        return False
    reject_stale_change(approval, field)
    return True
