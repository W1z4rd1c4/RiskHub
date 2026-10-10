"""Shared decisions before a governed proposal's terminal transition.

Family resolvers retain their own authorization, replay and ordered row locks.
A privileged-pending status is not valid for a governed envelope, but remains
resolvable so its family can authorize bounded expiry instead of stranding locks.
"""

from __future__ import annotations

from app.core.exceptions import ValidationError
from app.models import ApprovalRequest, ApprovalStatus


def require_rejection_reason(resolution_notes: str) -> str:
    """Reject blank input before any resolver can mutate the envelope."""
    reason = resolution_notes.strip()
    if not reason:
        raise ValidationError(
            "A non-blank rejection reason is mandatory",
            code="governed_mutation_rejection_reason_required",
            status_code=422,
        )
    return reason


def require_pending_resolution(approval: ApprovalRequest) -> None:
    """Admit only unresolved states; family envelope checks expire tampering."""
    if approval.status not in (ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED):
        raise ValidationError(f"Cannot resolve request with status: {approval.status.value}")


def resolution_envelope_is_valid(approval: ApprovalRequest, *, family_valid: bool = True) -> bool:
    """Common envelope integrity; never authorize or terminalize by itself.

    A corrupt unresolved envelope must go through the family's existing authority
    and lock plan before expiry. A valid rejection/cancellation cannot legitimize
    a missing submission reason or a privileged-approval state.
    """
    return (
        approval.status == ApprovalStatus.PENDING
        and isinstance(approval.reason, str)
        and bool(approval.reason.strip())
        and family_valid
    )


__all__ = ["require_pending_resolution", "require_rejection_reason", "resolution_envelope_is_valid"]
