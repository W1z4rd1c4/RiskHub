"""Unsupported proposal rows must never fall back to mutable legacy envelopes."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Notification,
    NotificationType,
    User,
)
from app.services._governed_mutations.process_identity import (
    new_governed_process_proposal,
)
from app.services.approval_execution_service import (
    approve_request_workflow,
    cancel_request_workflow,
    reject_request_workflow,
)
from app.services.outbox.handlers import approvals as approval_handlers
from app.services.outbox.payloads import (
    ApprovalRequestCancelledPayload,
    ApprovalRequestCreatedPayload,
    ApprovalRequestExpiredPayload,
    ApprovalRequestResolvedPayload,
)

_UNSUPPORTED_AXES = (
    "kind",
    "relationship_kind",
    "type",
    "required_null",
    "derived_domain",
    "derived_nested_list",
    "derived_nested_object",
    "derived_nested_number",
    "derived_nested_boolean",
)


async def _unsupported_approval(
    db_session: AsyncSession,
    *,
    requester: User,
    unsupported_axis: str,
) -> tuple[ApprovalRequest, Notification]:
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.PROCESS,
        resource_id=910_001,
        resource_name="Mutable envelope must not authorize",
        action_type=ApprovalActionType.EDIT,
        pending_changes={"notes": {"old": "old", "new": "new"}},
        requested_by_id=requester.id,
        reason="Unsupported proposal isolation",
        status=ApprovalStatus.PENDING,
        primary_approver_id=requester.id,
        scenario_key="legacy_alias",
        scenario_approver_roles=[requester.role.name],
        requires_privileged_approval=False,
    )
    db_session.add(approval)
    await db_session.flush()
    proposal = new_governed_process_proposal(
        approval_request_id=approval.id,
        requested_by_id=requester.id,
        process_id=910_001,
        process_name="Immutable unsupported proposal",
        approver_roles=["cro"],
        base_governance_version=1,
        before_snapshot={"notes": "old"},
        after_snapshot={"notes": "new"},
        raw_before={"notes": "old"},
        raw_after={"notes": "new"},
        derived_impact_snapshot={
            "before": {"cif": "yes", "criticality_class": "critical"},
            "after": {"cif": "yes", "criticality_class": "critical"},
        },
    )
    if unsupported_axis == "kind":
        proposal.mutation_kind = "process.unsupported"
    elif unsupported_axis == "relationship_kind":
        proposal.mutation_kind = "process.link.unknown.execute"
    elif unsupported_axis == "type":
        proposal.primary_resource_type = "vendor"
    elif unsupported_axis == "required_null":
        proposal.proposed_changes = {
            "before": {"l0_area": "Operations"},
            "after": {"l0_area": None},
        }
        proposal.before_snapshot = {"l0_area": "Operations"}
        proposal.after_snapshot = {"l0_area": None}
    elif unsupported_axis == "derived_domain":
        proposal.derived_impact_snapshot["after"]["cif"] = "maybe"
    elif unsupported_axis.startswith("derived_nested_"):
        value_kind = unsupported_axis.removeprefix("derived_nested_")
        malformed_values: dict[str, object] = {
            "list": [],
            "object": {"unexpected": "value"},
            "number": 1,
            "boolean": True,
        }
        proposal.derived_impact_snapshot["after"]["cif"] = malformed_values[value_kind]
    else:  # pragma: no cover - parametrization is exhaustive
        raise AssertionError(unsupported_axis)
    notification = Notification(
        user_id=requester.id,
        type=NotificationType.APPROVAL_PENDING,
        title="Unsupported proposal notification",
        message="Mutable envelope must not expose this notification",
        resource_type="approval",
        resource_id=approval.id,
        is_read=False,
    )
    db_session.add_all([proposal, notification])
    await db_session.commit()
    return approval, notification


@pytest.mark.asyncio
@pytest.mark.parametrize("unsupported_axis", _UNSUPPORTED_AXES)
async def test_unsupported_proposal_is_excluded_from_queue_and_notification_surfaces(
    client_factory,
    db_session: AsyncSession,
    test_user_employee: User,
    unsupported_axis: str,
) -> None:
    approval, notification = await _unsupported_approval(
        db_session,
        requester=test_user_employee,
        unsupported_axis=unsupported_axis,
    )
    notification_id = notification.id

    async with client_factory(user=test_user_employee) as client:
        queue = await client.get("/api/v1/approvals")
        requester_queue = await client.get(
            "/api/v1/approvals",
            params={"status": "pending", "my_requests": True},
        )
        my_approvals = await client.get("/api/v1/approvals/my-approvals")
        pending_count = await client.get("/api/v1/approvals/pending/count")
        detail = await client.get(f"/api/v1/approvals/{approval.id}")
        inbox = await client.get("/api/v1/notifications")
        unread_count = await client.get("/api/v1/notifications/unread/count")
        mark_one = await client.post(f"/api/v1/notifications/{notification_id}/read")
        mark_all = await client.post("/api/v1/notifications/read-all")

    assert queue.status_code == 200
    assert queue.json()["total"] == 0
    assert requester_queue.json()["total"] == 0
    assert my_approvals.json()["total"] == 0
    assert pending_count.json() == {"count": 0}
    assert detail.status_code == 403
    assert inbox.json()["total"] == 0
    assert inbox.json()["unread_count"] == 0
    assert unread_count.json() == {"count": 0}
    assert mark_one.status_code == 404
    assert mark_all.status_code == 204
    db_session.expire_all()
    persisted = await db_session.get(Notification, notification_id)
    assert persisted is not None and persisted.is_read is False


@pytest.mark.asyncio
@pytest.mark.parametrize("unsupported_axis", _UNSUPPORTED_AXES)
@pytest.mark.parametrize("operation", ["approve", "reject", "cancel"])
async def test_unsupported_proposal_is_rejected_before_legacy_execution(
    db_session: AsyncSession,
    test_user_employee: User,
    unsupported_axis: str,
    operation: str,
) -> None:
    approval, _ = await _unsupported_approval(
        db_session,
        requester=test_user_employee,
        unsupported_axis=unsupported_axis,
    )
    approval_id = approval.id

    with pytest.raises(ValidationError) as exc_info:
        if operation == "approve":
            await approve_request_workflow(
                db_session,
                approval_id,
                test_user_employee,
                "Must not execute as legacy",
            )
        elif operation == "reject":
            await reject_request_workflow(
                db_session,
                approval_id,
                test_user_employee,
                "Must not execute as legacy",
            )
        else:
            await cancel_request_workflow(
                db_session,
                approval_id,
                test_user_employee,
            )

    expected_code = (
        "governed_mutation_unsupported"
        if unsupported_axis in {"kind", "relationship_kind", "type"}
        else "governed_mutation_identity_invalid"
    )
    assert exc_info.value.code == expected_code
    db_session.expire_all()
    persisted = await db_session.get(ApprovalRequest, approval_id)
    assert persisted is not None and persisted.status == ApprovalStatus.PENDING


@pytest.mark.asyncio
@pytest.mark.parametrize("unsupported_axis", _UNSUPPORTED_AXES)
async def test_unsupported_proposal_is_suppressed_by_every_outbox_handler(
    monkeypatch,
    db_session: AsyncSession,
    test_user_employee: User,
    unsupported_axis: str,
) -> None:
    approval, _ = await _unsupported_approval(
        db_session,
        requester=test_user_employee,
        unsupported_axis=unsupported_axis,
    )
    notification_methods = (
        "notify_governed_action_required",
        "notify_governed_request_update",
        "create_notification_once",
        "notify_approvers",
        "notify_requester_resolved",
        "notify_approvers_cancelled",
    )
    mocks = {}
    for method in notification_methods:
        mock = AsyncMock(return_value=[])
        mocks[method] = mock
        monkeypatch.setattr(approval_handlers.NotificationService, method, mock)

    await approval_handlers.handle_approval_request_created(
        db_session,
        ApprovalRequestCreatedPayload(approval_id=approval.id),
    )
    await approval_handlers.handle_approval_request_resolved(
        db_session,
        ApprovalRequestResolvedPayload(approval_id=approval.id, approved=True),
    )
    await approval_handlers.handle_approval_request_cancelled(
        db_session,
        ApprovalRequestCancelledPayload(
            approval_id=approval.id,
            cancelled_by_user_id=test_user_employee.id,
        ),
    )
    await approval_handlers.handle_approval_request_expired(
        db_session,
        ApprovalRequestExpiredPayload(approval_id=approval.id),
    )

    assert all(mock.await_count == 0 for mock in mocks.values())
