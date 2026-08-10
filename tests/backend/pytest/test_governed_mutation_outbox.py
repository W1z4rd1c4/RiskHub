"""Outbox routing contracts for ADR-016 governed Process mutations."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.encoders import jsonable_encoder

from app.core.datetime_utils import utc_now
from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    GovernedMutationProposal,
)
from app.schemas.process import ProcessCreate
from app.services._governed_mutations.process_identity import (
    new_governed_process_proposal,
)
from app.services.outbox.handlers import approvals as approval_handlers
from app.services.outbox.payloads import (
    ApprovalRequestCancelledPayload,
    ApprovalRequestCreatedPayload,
    ApprovalRequestExpiredPayload,
    ApprovalRequestResolvedPayload,
    get_outbox_payload_model,
)
from app.services.outbox.registry import OUTBOX_EVENT_HANDLERS


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


def _extended_governed_approval(kind: str) -> SimpleNamespace:
    action = {
        "process.create": ApprovalActionType.CREATE,
        "process.archive": ApprovalActionType.DELETE,
        "process.link.risk.add": ApprovalActionType.EDIT,
    }[kind]
    resource_id = None if kind == "process.create" else 23
    created_at = utc_now()
    common = {
        "proposal_id": "123e4567-e89b-42d3-a456-426614174000",
        "proposal_version": 1,
        "schema_version": 1,
        "approval_request_id": 41,
        "mutation_kind": kind,
        "primary_resource_type": "process",
        "primary_resource_id": resource_id,
        "primary_resource_name": "Policy administration",
        "scenario_snapshot": {
            "key": "protected_process_edit",
            "requires_approval": True,
            "approver_roles": ["cro"],
            "triggered_policies": [
                {
                    "key": "protected_process_edit",
                    "enabled": True,
                    "policy_version": 1,
                    "configured_roles": ["cro"],
                    "invariants": {
                        "independent": True,
                        "allow_self_approval": False,
                    },
                }
            ],
        },
        "requested_by_id": 7,
        "created_at": created_at,
    }
    if kind == "process.create":
        raw_after = jsonable_encoder(
            ProcessCreate(
                l0_area="Operations",
                l1_process="Policy administration",
                process_owner_user_id=7,
                owning_department_id=3,
                cif_override="yes",
            ).model_dump(exclude={"request_reason"})
        )
        safe_after = {
            field: value
            for field, value in raw_after.items()
            if field not in {"process_owner_user_id", "owning_department_id"}
        }
        safe_after["process_owner"] = "Process Owner"
        safe_after["owning_department"] = "Operations"
        specific = {
            "base_versions": {},
            "before_snapshot": {},
            "after_snapshot": safe_after,
            "derived_impact_snapshot": {
                "before": None,
                "after": {"cif": "yes", "criticality_class": "critical"},
            },
            "proposed_changes": {"after": raw_after},
            "impacted_resources_snapshot": [],
        }
    elif kind == "process.archive":
        specific = {
            "base_versions": {"process": 1},
            "before_snapshot": {"is_archived": False},
            "after_snapshot": {"is_archived": True},
            "derived_impact_snapshot": {
                "before": {"cif": "yes", "criticality_class": "critical"},
                "after": {"cif": "yes", "criticality_class": "critical"},
            },
            "proposed_changes": {
                "before": {"is_archived": False},
                "after": {"is_archived": True},
                "triggered_scenarios": ["protected_process_edit"],
            },
            "impacted_resources_snapshot": [
                {
                    "resource_type": "process",
                    "resource_id": 23,
                    "resource_name": "Policy administration",
                    "base_governance_version": 1,
                }
            ],
        }
    else:
        operation = {
            "relationship_type": "risk",
            "action": "add",
            "kind": kind,
            "process_id": 23,
            "related_resource_id": 9,
            "related_resource_name": "R9 — Availability",
            "before": {"linked": False},
            "after": {"linked": True},
        }
        specific = {
            "base_versions": {"process": 1},
            "before_snapshot": {"relationship": {"linked": False}},
            "after_snapshot": {"relationship": {"linked": True}},
            "derived_impact_snapshot": {
                "processes": [
                    {
                        "resource_id": 23,
                        "before": {
                            "cif": "yes",
                            "criticality_class": "critical",
                        },
                        "after": {
                            "cif": "yes",
                            "criticality_class": "critical",
                        },
                    }
                ]
            },
            "proposed_changes": {
                "operation": operation,
                "triggered_scenarios": ["protected_process_edit"],
            },
            "impacted_resources_snapshot": [
                {
                    "resource_type": "process",
                    "resource_id": 23,
                    "resource_name": "Policy administration",
                    "base_governance_version": 1,
                }
            ],
        }
    pending_changes = (
        {
            field: {"old": None, "new": specific["after_snapshot"][field]}
            for field in sorted(specific["after_snapshot"])
        }
        if kind == "process.create"
        else (
            {"is_archived": {"old": False, "new": True}}
            if kind == "process.archive"
            else {
                "relationship": {
                    "old": specific["before_snapshot"]["relationship"],
                    "new": specific["after_snapshot"]["relationship"],
                }
            }
        )
    )
    approval = ApprovalRequest(
        id=41,
        resource_type=ApprovalResourceType.PROCESS,
        resource_id=resource_id,
        resource_name="Policy administration",
        action_type=action,
        pending_changes=pending_changes,
        scenario_key="protected_process_edit",
        scenario_approver_roles=["cro"],
        requested_by_id=7,
        reason="Independent review",
        status=ApprovalStatus.PENDING,
        resolved_by_id=None,
        resolved_at=None,
        resolution_notes=None,
        delete_context_snapshot=None,
        primary_approver_id=None,
        primary_approved_at=None,
        requires_privileged_approval=False,
        privileged_approver_id=None,
        privileged_approved_at=None,
        created_at=created_at,
    )
    proposal = GovernedMutationProposal(**common, **specific)
    proposal.approval_request = approval
    return SimpleNamespace(governed_mutation_proposal=proposal)


@pytest.mark.parametrize(
    "kind", ["process.create", "process.archive", "process.link.risk.add"]
)
def test_extended_notification_identity_dispatches_all_supported_kinds(
    kind: str,
) -> None:
    assert (
        approval_handlers._proposal_dispatch_kind(_extended_governed_approval(kind))
        == "governed"
    )


@pytest.mark.parametrize(
    "kind", ["process.create", "process.archive", "process.link.risk.add"]
)
def test_extended_notification_fixture_models_exact_persisted_envelope(
    kind: str,
) -> None:
    proposal = _extended_governed_approval(kind).governed_mutation_proposal
    approval = proposal.approval_request
    action = {
        "process.create": ApprovalActionType.CREATE,
        "process.archive": ApprovalActionType.DELETE,
        "process.link.risk.add": ApprovalActionType.EDIT,
    }[kind]
    resource_id = None if kind == "process.create" else 23
    expected_pending_changes = (
        {
            field: {"old": None, "new": proposal.after_snapshot[field]}
            for field in sorted(proposal.after_snapshot)
        }
        if kind == "process.create"
        else (
            {"is_archived": {"old": False, "new": True}}
            if kind == "process.archive"
            else {
                "relationship": {
                    "old": {"linked": False},
                    "new": {"linked": True},
                }
            }
        )
    )

    assert {
        "proposal_id": proposal.proposal_id,
        "proposal_version": proposal.proposal_version,
        "schema_version": proposal.schema_version,
        "approval_request_id": proposal.approval_request_id,
        "mutation_kind": proposal.mutation_kind,
        "primary_resource_type": proposal.primary_resource_type,
        "primary_resource_id": proposal.primary_resource_id,
        "primary_resource_name": proposal.primary_resource_name,
        "scenario_snapshot": proposal.scenario_snapshot,
        "requested_by_id": proposal.requested_by_id,
    } == {
        "proposal_id": "123e4567-e89b-42d3-a456-426614174000",
        "proposal_version": 1,
        "schema_version": 1,
        "approval_request_id": 41,
        "mutation_kind": kind,
        "primary_resource_type": "process",
        "primary_resource_id": resource_id,
        "primary_resource_name": "Policy administration",
        "scenario_snapshot": {
            "key": "protected_process_edit",
            "requires_approval": True,
            "approver_roles": ["cro"],
            "triggered_policies": [
                {
                    "key": "protected_process_edit",
                    "enabled": True,
                    "policy_version": 1,
                    "configured_roles": ["cro"],
                    "invariants": {
                        "independent": True,
                        "allow_self_approval": False,
                    },
                }
            ],
        },
        "requested_by_id": 7,
    }
    if kind == "process.create":
        expected_raw_after = jsonable_encoder(
            ProcessCreate(
                l0_area="Operations",
                l1_process="Policy administration",
                process_owner_user_id=7,
                owning_department_id=3,
                cif_override="yes",
            ).model_dump(exclude={"request_reason"})
        )
        expected_safe_after = {
            field: value
            for field, value in expected_raw_after.items()
            if field not in {"process_owner_user_id", "owning_department_id"}
        }
        expected_safe_after.update(
            {"process_owner": "Process Owner", "owning_department": "Operations"}
        )
        assert {
            "base_versions": proposal.base_versions,
            "before_snapshot": proposal.before_snapshot,
            "after_snapshot": proposal.after_snapshot,
            "derived_impact_snapshot": proposal.derived_impact_snapshot,
            "proposed_changes": proposal.proposed_changes,
            "impacted_resources_snapshot": proposal.impacted_resources_snapshot,
        } == {
            "base_versions": {},
            "before_snapshot": {},
            "after_snapshot": expected_safe_after,
            "derived_impact_snapshot": {
                "before": None,
                "after": {"cif": "yes", "criticality_class": "critical"},
            },
            "proposed_changes": {"after": expected_raw_after},
            "impacted_resources_snapshot": [],
        }
    elif kind == "process.archive":
        assert {
            "base_versions": proposal.base_versions,
            "before_snapshot": proposal.before_snapshot,
            "after_snapshot": proposal.after_snapshot,
            "derived_impact_snapshot": proposal.derived_impact_snapshot,
            "proposed_changes": proposal.proposed_changes,
            "impacted_resources_snapshot": proposal.impacted_resources_snapshot,
        } == {
            "base_versions": {"process": 1},
            "before_snapshot": {"is_archived": False},
            "after_snapshot": {"is_archived": True},
            "derived_impact_snapshot": {
                "before": {"cif": "yes", "criticality_class": "critical"},
                "after": {"cif": "yes", "criticality_class": "critical"},
            },
            "proposed_changes": {
                "before": {"is_archived": False},
                "after": {"is_archived": True},
                "triggered_scenarios": ["protected_process_edit"],
            },
            "impacted_resources_snapshot": [
                {
                    "resource_type": "process",
                    "resource_id": 23,
                    "resource_name": "Policy administration",
                    "base_governance_version": 1,
                }
            ],
        }
    else:
        expected_operation = {
            "relationship_type": "risk",
            "action": "add",
            "kind": "process.link.risk.add",
            "process_id": 23,
            "related_resource_id": 9,
            "related_resource_name": "R9 — Availability",
            "before": {"linked": False},
            "after": {"linked": True},
        }
        expected_impact = [
            {
                "resource_type": "process",
                "resource_id": 23,
                "resource_name": "Policy administration",
                "base_governance_version": 1,
            }
        ]
        assert {
            "base_versions": proposal.base_versions,
            "before_snapshot": proposal.before_snapshot,
            "after_snapshot": proposal.after_snapshot,
            "derived_impact_snapshot": proposal.derived_impact_snapshot,
            "proposed_changes": proposal.proposed_changes,
            "impacted_resources_snapshot": proposal.impacted_resources_snapshot,
        } == {
            "base_versions": {"process": 1},
            "before_snapshot": {"relationship": {"linked": False}},
            "after_snapshot": {"relationship": {"linked": True}},
            "derived_impact_snapshot": {
                "processes": [
                    {
                        "resource_id": 23,
                        "before": {
                            "cif": "yes",
                            "criticality_class": "critical",
                        },
                        "after": {
                            "cif": "yes",
                            "criticality_class": "critical",
                        },
                    }
                ]
            },
            "proposed_changes": {
                "operation": expected_operation,
                "triggered_scenarios": ["protected_process_edit"],
            },
            "impacted_resources_snapshot": expected_impact,
        }
    assert {
        "id": approval.id,
        "resource_type": approval.resource_type,
        "resource_id": approval.resource_id,
        "resource_name": approval.resource_name,
        "action_type": approval.action_type,
        "pending_changes": approval.pending_changes,
        "delete_context_snapshot": approval.delete_context_snapshot,
        "scenario_key": approval.scenario_key,
        "scenario_approver_roles": approval.scenario_approver_roles,
        "requested_by_id": approval.requested_by_id,
        "reason": approval.reason,
        "status": approval.status,
        "resolved_by_id": approval.resolved_by_id,
        "resolved_at": approval.resolved_at,
        "resolution_notes": approval.resolution_notes,
        "primary_approver_id": approval.primary_approver_id,
        "primary_approved_at": approval.primary_approved_at,
        "requires_privileged_approval": approval.requires_privileged_approval,
        "privileged_approver_id": approval.privileged_approver_id,
        "privileged_approved_at": approval.privileged_approved_at,
    } == {
        "id": 41,
        "resource_type": ApprovalResourceType.PROCESS,
        "resource_id": resource_id,
        "resource_name": "Policy administration",
        "action_type": action,
        "pending_changes": expected_pending_changes,
        "delete_context_snapshot": None,
        "scenario_key": "protected_process_edit",
        "scenario_approver_roles": ["cro"],
        "requested_by_id": 7,
        "reason": "Independent review",
        "status": ApprovalStatus.PENDING,
        "resolved_by_id": None,
        "resolved_at": None,
        "resolution_notes": None,
        "primary_approver_id": None,
        "primary_approved_at": None,
        "requires_privileged_approval": False,
        "privileged_approver_id": None,
        "privileged_approved_at": None,
    }
    assert approval.pending_changes
    assert approval.created_at.tzinfo is not None
    assert proposal.created_at.tzinfo is not None
    assert proposal.created_at >= approval.created_at


def test_extended_notification_identity_excludes_malformed_legacy_envelope() -> None:
    approval = _extended_governed_approval("process.create")
    approval.governed_mutation_proposal.approval_request.pending_changes = {}

    assert approval_handlers._proposal_dispatch_kind(approval) == "invalid"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "kind", ["process.create", "process.archive", "process.link.risk.add"]
)
@pytest.mark.parametrize(
    ("handler", "payload", "method", "kwargs"),
    [
        (
            approval_handlers.handle_approval_request_created,
            ApprovalRequestCreatedPayload(approval_id=41),
            "notify_governed_action_required",
            {"event": "submitted"},
        ),
        (
            approval_handlers.handle_approval_request_resolved,
            ApprovalRequestResolvedPayload(approval_id=41, approved=True),
            "notify_governed_request_update",
            {"outcome": "approved"},
        ),
        (
            approval_handlers.handle_approval_request_resolved,
            ApprovalRequestResolvedPayload(approval_id=41, approved=False),
            "notify_governed_request_update",
            {"outcome": "rejected"},
        ),
        (
            approval_handlers.handle_approval_request_cancelled,
            ApprovalRequestCancelledPayload(approval_id=41, cancelled_by_user_id=7),
            "notify_governed_request_update",
            {"outcome": "cancelled"},
        ),
        (
            approval_handlers.handle_approval_request_expired,
            ApprovalRequestExpiredPayload(approval_id=41),
            "notify_governed_request_update",
            {"outcome": "expired"},
        ),
    ],
)
async def test_extended_events_route_governed_notifications(
    monkeypatch, kind: str, handler, payload, method: str, kwargs: dict
) -> None:
    approval = _extended_governed_approval(kind)
    monkeypatch.setattr(
        approval_handlers, "_load_approval", AsyncMock(return_value=approval)
    )
    notify_action = AsyncMock(return_value=[])
    notify_update = AsyncMock(return_value=None)
    monkeypatch.setattr(
        approval_handlers.NotificationService,
        "notify_governed_action_required",
        notify_action,
    )
    monkeypatch.setattr(
        approval_handlers.NotificationService,
        "notify_governed_request_update",
        notify_update,
    )

    db = AsyncMock()
    await handler(db, payload)

    notify = (
        notify_action if method == "notify_governed_action_required" else notify_update
    )
    notify.assert_awaited_once_with(db, approval, strict_errors=True, **kwargs)


@pytest.mark.asyncio
async def test_created_event_routes_to_governed_action_preference(monkeypatch) -> None:
    approval = _governed_approval()
    monkeypatch.setattr(
        approval_handlers, "_load_approval", AsyncMock(return_value=approval)
    )
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
    monkeypatch.setattr(
        approval_handlers, "_load_approval", AsyncMock(return_value=approval)
    )
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
    monkeypatch.setattr(
        approval_handlers, "_load_approval", AsyncMock(return_value=approval)
    )
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
    assert (
        get_outbox_payload_model("approval.request_expired")
        is ApprovalRequestExpiredPayload
    )
    assert (
        OUTBOX_EVENT_HANDLERS["approval.request_expired"]
        is approval_handlers.handle_approval_request_expired
    )
