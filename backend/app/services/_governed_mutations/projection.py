"""Actor-scoped display projection for immutable governed Process snapshots."""

from __future__ import annotations

from typing import Any

from app.models import GovernedMutationProposal

_IDENTITY_FIELDS = (
    ("process_owner_user_id", "Unknown user"),
    ("owning_department_id", "Unknown department"),
)


def _positive_int(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value > 0 else None


def _operation_side(proposal: GovernedMutationProposal, side: str) -> dict[str, Any]:
    operation = proposal.proposed_changes
    if not isinstance(operation, dict):
        return {}
    snapshot = operation.get(side)
    return snapshot if isinstance(snapshot, dict) else {}


def _safe_label(value: object, fallback: str) -> str:
    if not isinstance(value, str):
        return fallback
    normalized = value.strip()
    if not normalized or normalized.isdigit():
        return fallback
    return normalized


def actor_safe_process_snapshots(
    proposal: GovernedMutationProposal,
    *,
    can_view_proposed_references: bool,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Return safe before/after labels without broadening linked-reference access.

    Current/before ownership is already intrinsic to an actor-readable Process.
    A changed proposed owner or Department follows the purpose-scoped Process
    assignment lookup policy. Corrupt/missing reference identities fail closed.
    """
    before = dict(proposal.before_snapshot) if isinstance(proposal.before_snapshot, dict) else {}
    after = dict(proposal.after_snapshot) if isinstance(proposal.after_snapshot, dict) else {}
    before_operation = _operation_side(proposal, "before")
    after_operation = _operation_side(proposal, "after")

    for field, fallback in _IDENTITY_FIELDS:
        if field in before:
            before[field] = _safe_label(before[field], fallback)
        if field not in after:
            continue
        before_reference = _positive_int(before_operation.get(field))
        after_reference = _positive_int(after_operation.get(field))
        reference_changed = (
            before_reference is None
            or after_reference is None
            or before_reference != after_reference
        )
        if reference_changed and not can_view_proposed_references:
            after[field] = fallback
        else:
            after[field] = _safe_label(after[field], fallback)
    return before, after


def actor_safe_pending_changes(
    pending_changes: object,
    *,
    before: dict[str, Any],
    after: dict[str, Any],
) -> dict[str, Any] | None:
    """Mirror actor-safe identity labels into the legacy field-change shape."""
    if not isinstance(pending_changes, dict):
        return None
    safe: dict[str, Any] = {
        field: dict(change) if isinstance(change, dict) else change
        for field, change in pending_changes.items()
    }
    for field, fallback in _IDENTITY_FIELDS:
        if field not in pending_changes:
            continue
        safe[field] = {
            "old": before.get(field, fallback),
            "new": after.get(field, fallback),
        }
    return safe
