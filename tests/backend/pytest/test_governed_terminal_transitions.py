from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    GovernedMutationImpactLock,
    User,
)
from app.services._governed_mutations import terminal_transitions


def _approval(status: ApprovalStatus = ApprovalStatus.PENDING) -> ApprovalRequest:
    return ApprovalRequest(
        id=11,
        resource_type=ApprovalResourceType.PROCESS,
        resource_id=41,
        resource_name="Canonical suffix",
        action_type=ApprovalActionType.EDIT,
        requested_by_id=7,
        reason="Exercise terminal suffix",
        status=status,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status",
    [
        ApprovalStatus.APPROVED,
        ApprovalStatus.REJECTED,
        ApprovalStatus.CANCELLED,
        ApprovalStatus.EXPIRED,
    ],
)
async def test_terminal_transition_owns_status_lock_audit_and_outbox(
    monkeypatch: pytest.MonkeyPatch,
    status: ApprovalStatus,
) -> None:
    audit = AsyncMock()
    enqueue = AsyncMock()
    monkeypatch.setattr(terminal_transitions, "_audit_terminal_transition", audit)
    monkeypatch.setattr(terminal_transitions, "_enqueue_terminal_transition", enqueue)
    approval = _approval()
    actor = User(id=19)
    impact_lock = GovernedMutationImpactLock(
        proposal_id=5,
        resource_type="process",
        resource_id=41,
        base_governance_version=1,
    )
    applied_changes = {"notes": {"old": "before", "new": "after"}}
    db = object()

    await terminal_transitions.finalize_governed_terminal_transition(
        db,
        approval=approval,
        proposal=SimpleNamespace(proposal_id="proposal", proposal_version=1),
        impact_locks=[impact_lock],
        actor=actor,
        department_id=3,
        status=status,
        resolution_notes="terminal reason",
        applied_changes=applied_changes,
    )

    assert approval.status == status
    assert approval.resolved_by_id == actor.id
    assert approval.resolved_at is not None
    assert approval.resolution_notes == "terminal reason"
    assert impact_lock.released_at == approval.resolved_at
    assert impact_lock.release_reason == status.value.lower()
    expected_changes = (
        applied_changes
        if status == ApprovalStatus.APPROVED
        else {"status": {"old": "pending", "new": status.value.lower()}}
    )
    assert audit.await_args.kwargs["changes"] == expected_changes
    policy = enqueue.await_args.kwargs["policy"]
    assert policy is terminal_transitions._TERMINAL_POLICIES[status]
    assert audit.await_args.kwargs["policy"] is policy
    assert policy.outbox_payload(approval, actor)["approval_id"] == approval.id


@pytest.mark.asyncio
async def test_terminal_transition_preserves_fixed_expiry_audit_origin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    audit = AsyncMock()
    monkeypatch.setattr(terminal_transitions, "_audit_terminal_transition", audit)
    monkeypatch.setattr(terminal_transitions, "_enqueue_terminal_transition", AsyncMock())
    approval = _approval(ApprovalStatus.PENDING_PRIVILEGED)

    await terminal_transitions.finalize_governed_terminal_transition(
        object(),
        approval=approval,
        proposal=SimpleNamespace(proposal_id="proposal", proposal_version=1),
        impact_locks=[],
        actor=User(id=19),
        department_id=3,
        status=ApprovalStatus.EXPIRED,
        audit_previous_status=ApprovalStatus.PENDING,
    )

    assert audit.await_args.kwargs["changes"] == {
        "status": {"old": "pending", "new": "expired"}
    }
