"""Canonical terminal transitions for governed Process proposals."""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import governed_mutation as audit_governed
from app.core.audit.governed_mutation import GovernedProposalAuditIdentity
from app.core.datetime_utils import utc_now
from app.models import ApprovalRequest, ApprovalStatus, GovernedMutationImpactLock, User
from app.services.outbox import OutboxService

AuditAdapter = Callable[..., Awaitable[None]]
AuditChangesBuilder = Callable[
    [ApprovalStatus, ApprovalStatus, Mapping[str, object] | None],
    Mapping[str, object],
]
OutboxKeyBuilder = Callable[[ApprovalRequest], str]
OutboxPayloadBuilder = Callable[[ApprovalRequest, User], dict[str, object]]


@dataclass(frozen=True, slots=True)
class _TerminalPolicy:
    audit_adapter: AuditAdapter
    audit_changes: AuditChangesBuilder
    outbox_event_type: str
    outbox_key: OutboxKeyBuilder
    outbox_payload: OutboxPayloadBuilder


def _status_changes(
    previous: ApprovalStatus,
    current: ApprovalStatus,
    _applied_changes: Mapping[str, object] | None,
) -> dict[str, dict[str, str]]:
    return {
        "status": {
            "old": previous.value.lower(),
            "new": current.value.lower(),
        }
    }


def _applied_changes(
    _previous: ApprovalStatus,
    _current: ApprovalStatus,
    applied_changes: Mapping[str, object] | None,
) -> dict[str, object]:
    return dict(applied_changes or {})


def _resolved_key(approval: ApprovalRequest) -> str:
    return f"approval.request_resolved:{approval.id}:{approval.status.value.lower()}"


def _expired_key(approval: ApprovalRequest) -> str:
    return f"approval.request_expired:{approval.id}"


def _cancelled_key(approval: ApprovalRequest) -> str:
    return f"approval.request_cancelled:{approval.id}"


def _approved_payload(approval: ApprovalRequest, _actor: User) -> dict[str, object]:
    return {"approval_id": approval.id, "approved": True}


def _rejected_payload(approval: ApprovalRequest, _actor: User) -> dict[str, object]:
    return {"approval_id": approval.id, "approved": False}


def _expired_payload(approval: ApprovalRequest, _actor: User) -> dict[str, object]:
    return {"approval_id": approval.id}


def _cancelled_payload(approval: ApprovalRequest, actor: User) -> dict[str, object]:
    return {"approval_id": approval.id, "cancelled_by_user_id": actor.id}


_TERMINAL_POLICIES = {
    ApprovalStatus.APPROVED: _TerminalPolicy(
        audit_adapter=audit_governed.proposal_applied,
        audit_changes=_applied_changes,
        outbox_event_type="approval.request_resolved",
        outbox_key=_resolved_key,
        outbox_payload=_approved_payload,
    ),
    ApprovalStatus.REJECTED: _TerminalPolicy(
        audit_adapter=audit_governed.proposal_rejected,
        audit_changes=_status_changes,
        outbox_event_type="approval.request_resolved",
        outbox_key=_resolved_key,
        outbox_payload=_rejected_payload,
    ),
    ApprovalStatus.CANCELLED: _TerminalPolicy(
        audit_adapter=audit_governed.proposal_cancelled,
        audit_changes=_status_changes,
        outbox_event_type="approval.request_cancelled",
        outbox_key=_cancelled_key,
        outbox_payload=_cancelled_payload,
    ),
    ApprovalStatus.EXPIRED: _TerminalPolicy(
        audit_adapter=audit_governed.proposal_expired,
        audit_changes=_status_changes,
        outbox_event_type="approval.request_expired",
        outbox_key=_expired_key,
        outbox_payload=_expired_payload,
    ),
}


def _release_impact_locks(
    impact_locks: Sequence[GovernedMutationImpactLock],
    *,
    status: ApprovalStatus,
    released_at: datetime,
) -> None:
    reason = status.value.lower()
    for impact_lock in impact_locks:
        if impact_lock.released_at is None:
            impact_lock.released_at = released_at
            impact_lock.release_reason = reason


async def _audit_terminal_transition(
    db: AsyncSession,
    *,
    approval: ApprovalRequest,
    proposal: GovernedProposalAuditIdentity,
    actor: User,
    department_id: int | None,
    policy: _TerminalPolicy,
    changes: Mapping[str, object],
) -> None:
    await policy.audit_adapter(
        db,
        actor=actor,
        approval=approval,
        proposal=proposal,
        department_id=department_id,
        changes=changes,
    )


async def _enqueue_terminal_transition(
    db: AsyncSession,
    *,
    approval: ApprovalRequest,
    actor: User,
    policy: _TerminalPolicy,
) -> None:
    await OutboxService.enqueue(
        db,
        event_type=policy.outbox_event_type,
        aggregate_type="approval_request",
        aggregate_id=approval.id,
        idempotency_key=policy.outbox_key(approval),
        payload=policy.outbox_payload(approval, actor),
    )


async def finalize_governed_terminal_transition(
    db: AsyncSession,
    *,
    approval: ApprovalRequest,
    proposal: GovernedProposalAuditIdentity,
    impact_locks: Sequence[GovernedMutationImpactLock],
    actor: User,
    department_id: int | None,
    status: ApprovalStatus,
    resolution_notes: str | None = None,
    applied_changes: Mapping[str, object] | None = None,
    audit_previous_status: ApprovalStatus | None = None,
) -> None:
    """Apply one immutable terminal suffix after callers finish locking/policy checks."""
    policy = _TERMINAL_POLICIES.get(status)
    if policy is None:
        raise ValueError(f"Unsupported governed terminal status: {status.value}")
    previous_status = approval.status
    resolved_at = utc_now()
    approval.status = status
    approval.resolved_by_id = actor.id
    approval.resolved_at = resolved_at
    approval.resolution_notes = resolution_notes
    _release_impact_locks(impact_locks, status=status, released_at=resolved_at)
    audit_changes = policy.audit_changes(
        audit_previous_status or previous_status,
        status,
        applied_changes,
    )
    await _audit_terminal_transition(
        db,
        approval=approval,
        proposal=proposal,
        actor=actor,
        department_id=department_id,
        policy=policy,
        changes=audit_changes,
    )
    await _enqueue_terminal_transition(
        db,
        approval=approval,
        actor=actor,
        policy=policy,
    )


__all__ = ["finalize_governed_terminal_transition"]
