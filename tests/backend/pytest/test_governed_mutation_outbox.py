"""Outbox routing contracts for ADR-016 governed Process mutations."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services.outbox.handlers import approvals as approval_handlers
from app.services.outbox.payloads import (
    ApprovalRequestCancelledPayload,
    ApprovalRequestCreatedPayload,
    ApprovalRequestExpiredPayload,
    ApprovalRequestResolvedPayload,
    get_outbox_payload_model,
)
from app.services.outbox.registry import OUTBOX_EVENT_HANDLERS
from app.services._governed_mutations.process_identity import (
    new_governed_process_proposal,
)


def _governed_approval() -> SimpleNamespace:
    proposal = new_governed_process_proposal(
        approval_request_id=41,
        requested_by_id=7,
        process_id=23,
        process_name="Policy administration",
        approver_roles=["cro"],
        base_governance_version=1,
        before_snapshot={"notes": "Before"},
        after_snapshot={"notes": "After"},
        raw_before={"notes": "Before"},
        raw_after={"notes": "After"},
        derived_impact_snapshot={
            "before": {"cif": "yes", "criticality_class": "critical"},
            "after": {"cif": "yes", "criticality_class": "critical"},
        },
    )
    return SimpleNamespace(governed_mutation_proposal=proposal)


@pytest.mark.asyncio
async def test_created_event_routes_to_governed_action_preference(monkeypatch) -> None:
    approval = _governed_approval()
    monkeypatch.setattr(approval_handlers, "_load_approval", AsyncMock(return_value=approval))
    notify = AsyncMock(return_value=[])
    monkeypatch.setattr(
        approval_handlers.NotificationService,
        "notify_governed_action_required",
        notify,
    )

    db = AsyncMock()
    await approval_handlers.handle_approval_request_created(
        db, ApprovalRequestCreatedPayload(approval_id=41)
    )

    notify.assert_awaited_once_with(
        db,
        approval,
        event="submitted",
        strict_errors=True,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("approved", "outcome"),
    [(True, "approved"), (False, "rejected")],
)
async def test_resolved_event_routes_to_governed_request_update(
    monkeypatch, approved: bool, outcome: str
) -> None:
    approval = _governed_approval()
    monkeypatch.setattr(approval_handlers, "_load_approval", AsyncMock(return_value=approval))
    notify = AsyncMock(return_value=None)
    monkeypatch.setattr(
        approval_handlers.NotificationService,
        "notify_governed_request_update",
        notify,
    )

    db = AsyncMock()
    await approval_handlers.handle_approval_request_resolved(
        db,
        ApprovalRequestResolvedPayload(approval_id=42, approved=approved),
    )

    notify.assert_awaited_once_with(
        db,
        approval,
        outcome=outcome,
        strict_errors=True,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("handler", "payload", "event", "outcome"),
    [
        (
            approval_handlers.handle_approval_request_cancelled,
            ApprovalRequestCancelledPayload(approval_id=43, cancelled_by_user_id=7),
            "cancelled",
            "cancelled",
        ),
        (
            approval_handlers.handle_approval_request_expired,
            ApprovalRequestExpiredPayload(approval_id=44),
            "expired",
            "expired",
        ),
    ],
)
async def test_terminal_event_notifies_approvers_and_requester(
    monkeypatch, handler, payload, event: str, outcome: str
) -> None:
    approval = _governed_approval()
    monkeypatch.setattr(approval_handlers, "_load_approval", AsyncMock(return_value=approval))
    notify_action = AsyncMock(return_value=[])
    notify_requester = AsyncMock(return_value=None)
    monkeypatch.setattr(
        approval_handlers.NotificationService,
        "notify_governed_action_required",
        notify_action,
    )
    monkeypatch.setattr(
        approval_handlers.NotificationService,
        "notify_governed_request_update",
        notify_requester,
    )

    db = AsyncMock()
    await handler(db, payload)

    notify_action.assert_awaited_once_with(
        db,
        approval,
        event=event,
        strict_errors=True,
    )
    notify_requester.assert_awaited_once_with(
        db,
        approval,
        outcome=outcome,
        strict_errors=True,
    )


def test_expired_event_has_typed_payload_and_registered_handler() -> None:
    assert get_outbox_payload_model("approval.request_expired") is ApprovalRequestExpiredPayload
    assert (
        OUTBOX_EVENT_HANDLERS["approval.request_expired"]
        is approval_handlers.handle_approval_request_expired
    )
