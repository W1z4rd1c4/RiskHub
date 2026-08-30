from __future__ import annotations

from copy import deepcopy

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Department,
    Risk,
    Role,
    User,
    Vendor,
)
from app.models.activity_log import ActivityEntityType, ActivityLog
from app.models.outbox_event import OutboxEvent


async def _legacy_approval(
    db_session: AsyncSession,
    *,
    risk: Risk,
    requester: User,
    pending_changes: object,
    resource_type: ApprovalResourceType = ApprovalResourceType.RISK,
    primary_approver_id: int | None = None,
    requires_privileged_approval: bool = False,
) -> ApprovalRequest:
    approval = ApprovalRequest(
        resource_type=resource_type,
        resource_id=risk.id,
        resource_name=risk.name,
        action_type=ApprovalActionType.EDIT,
        pending_changes=pending_changes,  # type: ignore[arg-type]
        requested_by_id=requester.id,
        reason="Legacy pending changes projection",
        status=ApprovalStatus.PENDING,
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=requires_privileged_approval,
    )
    db_session.add(approval)
    await db_session.commit()
    await db_session.refresh(approval)
    return approval


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("terminal_path", "request_body", "expected_status"),
    (
        ("approve", {"resolution_notes": "Approved projection"}, "approved"),
        ("reject", {"resolution_notes": "Rejected projection"}, "rejected"),
        ("cancel", None, "cancelled"),
    ),
)
async def test_queue_detail_and_resolution_share_immutable_legacy_label_projection(
    client_factory,
    db_session: AsyncSession,
    test_risk: Risk,
    test_user_employee: User,
    test_user_cro: User,
    test_user_risk_manager: User,
    terminal_path: str,
    request_body: dict[str, str] | None,
    expected_status: str,
) -> None:
    stored_pending_changes = {
        "name": {"old": test_risk.name, "new": "Projected risk name"},
        "owner_id": {"old": test_user_cro.id, "new": test_user_risk_manager.id},
        "secret_owner_id": {"old": test_user_cro.id, "new": test_user_risk_manager.id},
    }
    approval = await _legacy_approval(
        db_session,
        risk=test_risk,
        requester=test_user_employee,
        pending_changes=deepcopy(stored_pending_changes),
    )
    expected_projection = {
        "name": {"old": test_risk.name, "new": "Projected risk name"},
        "owner_id": {"old": test_user_cro.name, "new": test_user_risk_manager.name},
        "__restricted_change__": {"old": None, "new": None},
    }

    async with client_factory(current_user=test_user_cro) as client:
        queue_response = await client.get("/api/v1/approvals", params={"status": "pending"})
        detail_response = await client.get(f"/api/v1/approvals/{approval.id}")
        resolution_response = await client.post(
            f"/api/v1/approvals/{approval.id}/{terminal_path}",
            **({"json": request_body} if request_body is not None else {}),
        )

    assert queue_response.status_code == 200, queue_response.text
    queue_item = next(item for item in queue_response.json()["items"] if item["id"] == approval.id)
    assert queue_item["pending_changes"] == expected_projection
    assert detail_response.status_code == 200, detail_response.text
    assert detail_response.json()["pending_changes"] == expected_projection
    assert resolution_response.status_code == 200, resolution_response.text
    assert resolution_response.json()["status"] == expected_status
    assert resolution_response.json()["pending_changes"] == expected_projection

    await db_session.refresh(approval)
    assert approval.pending_changes == stored_pending_changes


@pytest.mark.asyncio
async def test_legacy_projection_resolves_only_active_visible_permitted_reference_labels(
    client_factory,
    db_session: AsyncSession,
    test_department: Department,
    test_risk: Risk,
    test_role_employee: Role,
    test_user_employee: User,
    test_user_approval_requester: User,
) -> None:
    hidden_department = Department(name="Hidden Projection Department", code="PROJ-HIDDEN")
    hidden_user = User(
        name="Hidden Projection User",
        email="hidden.projection@test.com",
        department=hidden_department,
        role_id=test_role_employee.id,
        is_active=True,
    )
    inactive_user = User(
        name="Inactive Projection User",
        email="inactive.projection@test.com",
        department_id=test_department.id,
        role_id=test_role_employee.id,
        is_active=False,
    )
    visible_vendor = Vendor(
        name="Visible Projection Vendor",
        process="Projection",
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user_approval_requester.id,
        vendor_type="outsourcing",
        risk_score_1_5=2,
    )
    hidden_vendor = Vendor(
        name="Hidden Projection Vendor",
        process="Projection",
        department=hidden_department,
        outsourcing_owner=hidden_user,
        vendor_type="outsourcing",
        risk_score_1_5=2,
    )
    archived_vendor = Vendor(
        name="Archived Projection Vendor",
        process="Projection",
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user_approval_requester.id,
        vendor_type="outsourcing",
        risk_score_1_5=2,
        is_archived=True,
    )
    db_session.add_all(
        [hidden_department, hidden_user, inactive_user, visible_vendor, hidden_vendor, archived_vendor]
    )
    await db_session.commit()
    for record in (
        hidden_department,
        hidden_user,
        inactive_user,
        visible_vendor,
        hidden_vendor,
        archived_vendor,
    ):
        await db_session.refresh(record)

    stored_pending_changes = {
        "name": {"old": test_risk.name, "new": "Safe ordinary value"},
        "owner_id": {"old": test_user_employee.id, "new": hidden_user.id},
        "control_owner_id": {"old": inactive_user.id, "new": "malformed"},
        "reporting_owner_id": {"old": 999_991, "new": None},
        "department_id": {"old": test_department.id, "new": hidden_department.id},
        "linked_vendor_ids": {
            "old": [visible_vendor.id, hidden_vendor.id],
            "new": [archived_vendor.id, 999_992, "malformed"],
        },
        "secret_owner_id": {"old": test_user_employee.id, "new": hidden_user.id},
        "debug_blob": {"old": "private", "new": "private"},
    }
    approval = await _legacy_approval(
        db_session,
        risk=test_risk,
        requester=test_user_approval_requester,
        pending_changes=deepcopy(stored_pending_changes),
    )

    async with client_factory(current_user=test_user_approval_requester) as client:
        queue_response = await client.get(
            "/api/v1/approvals",
            params={"status": "pending", "my_requests": "true"},
        )
        detail_response = await client.get(f"/api/v1/approvals/{approval.id}")

    expected_projection = {
        "name": {"old": test_risk.name, "new": "Safe ordinary value"},
        "owner_id": {"old": test_user_employee.name, "new": "Unknown user"},
        "department_id": {"old": test_department.name, "new": "Unknown department"},
        "__restricted_change__": {"old": None, "new": None},
    }
    assert queue_response.status_code == 200, queue_response.text
    queue_item = next(item for item in queue_response.json()["items"] if item["id"] == approval.id)
    assert queue_item["pending_changes"] == expected_projection
    assert detail_response.status_code == 200, detail_response.text
    assert detail_response.json()["pending_changes"] == expected_projection
    serialized_projection = str(detail_response.json()["pending_changes"])
    for hidden_key in (
        "control_owner_id",
        "reporting_owner_id",
        "linked_vendor_ids",
        "secret_owner_id",
        "debug_blob",
    ):
        assert hidden_key not in serialized_projection
    assert visible_vendor.name not in serialized_projection
    assert hidden_vendor.name not in serialized_projection

    await db_session.refresh(approval)
    assert approval.pending_changes == stored_pending_changes


@pytest.mark.asyncio
async def test_legacy_user_reference_labels_require_directory_or_assignment_permission(
    client_factory,
    db_session: AsyncSession,
    test_risk: Risk,
    test_user_employee: User,
    test_user_approval_requester: User,
) -> None:
    stored_pending_changes = {
        "owner_id": {
            "old": test_user_employee.id,
            "new": test_user_approval_requester.id,
        }
    }
    approval = await _legacy_approval(
        db_session,
        risk=test_risk,
        requester=test_user_employee,
        pending_changes=deepcopy(stored_pending_changes),
    )

    async with client_factory(current_user=test_user_employee) as client:
        detail_response = await client.get(f"/api/v1/approvals/{approval.id}")

    assert detail_response.status_code == 200, detail_response.text
    assert detail_response.json()["pending_changes"] == {
        "owner_id": {"old": "Unknown user", "new": "Unknown user"}
    }
    await db_session.refresh(approval)
    assert approval.pending_changes == stored_pending_changes


@pytest.mark.asyncio
async def test_known_kri_history_fields_remain_but_storage_only_identifier_is_omitted(
    client_factory,
    db_session: AsyncSession,
    test_risk: Risk,
    test_user_employee: User,
) -> None:
    stored_pending_changes = {
        "old_value": 10.0,
        "new_value": 11.0,
        "reason": "Correct source value",
        "period_end": "2026-06-30",
        "history_entry_id": 912,
    }
    approval = await _legacy_approval(
        db_session,
        risk=test_risk,
        requester=test_user_employee,
        pending_changes=deepcopy(stored_pending_changes),
        resource_type=ApprovalResourceType.KRI,
    )

    async with client_factory(current_user=test_user_employee) as client:
        detail_response = await client.get(f"/api/v1/approvals/{approval.id}")

    assert detail_response.status_code == 200, detail_response.text
    assert detail_response.json()["pending_changes"] == {
        "old_value": 10.0,
        "new_value": 11.0,
        "reason": "Correct source value",
        "period_end": "2026-06-30",
        "__restricted_change__": {"old": None, "new": None},
    }
    assert "history_entry_id" not in str(detail_response.json()["pending_changes"])
    await db_session.refresh(approval)
    assert approval.pending_changes == stored_pending_changes


@pytest.mark.asyncio
async def test_kri_projects_only_its_approved_reference_fields(
    client_factory,
    db_session: AsyncSession,
    test_risk: Risk,
    test_user_employee: User,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    stored_pending_changes = {
        "reporting_owner_id": {"old": test_user_cro.id, "new": test_user_risk_manager.id},
        "linked_vendor_ids": {"old": [999_901], "new": []},
        "owner_id": {"old": test_user_cro.id, "new": test_user_risk_manager.id},
    }
    approval = await _legacy_approval(
        db_session,
        risk=test_risk,
        requester=test_user_employee,
        pending_changes=deepcopy(stored_pending_changes),
        resource_type=ApprovalResourceType.KRI,
    )

    async with client_factory(current_user=test_user_cro) as client:
        detail_response = await client.get(f"/api/v1/approvals/{approval.id}")

    assert detail_response.status_code == 200, detail_response.text
    assert detail_response.json()["pending_changes"] == {
        "reporting_owner_id": {
            "old": test_user_cro.name,
            "new": test_user_risk_manager.name,
        },
        "linked_vendor_ids": {"old": ["Unknown vendor"], "new": []},
        "__restricted_change__": {"old": None, "new": None},
    }
    assert "owner_id" not in detail_response.json()["pending_changes"]
    await db_session.refresh(approval)
    assert approval.pending_changes == stored_pending_changes


@pytest.mark.asyncio
async def test_malformed_legacy_pending_changes_use_existing_corrupt_projection_quarantine(
    client_factory,
    db_session: AsyncSession,
    test_risk: Risk,
    test_user_employee: User,
    test_user_cro: User,
) -> None:
    approval = await _legacy_approval(
        db_session,
        risk=test_risk,
        requester=test_user_employee,
        pending_changes=["not", "a", "change-map"],
    )

    async with client_factory(current_user=test_user_cro, raise_app_exceptions=False) as client:
        queue_response = await client.get("/api/v1/approvals", params={"status": "pending"})
        detail_response = await client.get(f"/api/v1/approvals/{approval.id}")

    assert queue_response.status_code == 200, queue_response.text
    queue_body = queue_response.json()
    assert all(item["id"] != approval.id for item in queue_body["items"])
    assert queue_body["skipped_corrupt_payloads"] == 1
    assert detail_response.status_code == 500
    assert "not\", \"a\"" not in detail_response.text

    await db_session.refresh(approval)
    assert approval.pending_changes == ["not", "a", "change-map"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("terminal_path", "request_body", "actor_fixture", "first_stage"),
    (
        ("approve", {"resolution_notes": "Must fail closed"}, "cro", False),
        ("reject", {"resolution_notes": "Must fail closed"}, "cro", False),
        ("cancel", None, "cro", False),
        ("approve", {"resolution_notes": "Must not escalate"}, "primary", True),
    ),
)
async def test_malformed_legacy_payload_is_rejected_before_any_terminal_side_effect(
    client_factory,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    test_risk: Risk,
    test_user_approval_requester: User,
    test_user_employee: User,
    test_user_cro: User,
    terminal_path: str,
    request_body: dict[str, str] | None,
    actor_fixture: str,
    first_stage: bool,
) -> None:
    actor = test_user_employee if actor_fixture == "primary" else test_user_cro
    malformed_changes = ["not", "a", "change-map"]
    approval = await _legacy_approval(
        db_session,
        risk=test_risk,
        requester=test_user_approval_requester,
        pending_changes=malformed_changes,
        primary_approver_id=test_user_employee.id if first_stage else None,
        requires_privileged_approval=first_stage,
    )

    commit_calls = 0
    original_commit = db_session.commit

    async def tracked_commit() -> None:
        nonlocal commit_calls
        commit_calls += 1
        await original_commit()

    monkeypatch.setattr(db_session, "commit", tracked_commit)

    async with client_factory(current_user=actor) as client:
        response = await client.post(
            f"/api/v1/approvals/{approval.id}/{terminal_path}",
            **({"json": request_body} if request_body is not None else {}),
        )

    assert response.status_code == 400, response.text
    assert response.json() == {
        "detail": {
            "code": "approval_payload_invalid",
            "message": "Approval request cannot be resolved because its stored changes are invalid",
        }
    }
    assert "not\", \"a\"" not in response.text
    assert commit_calls == 0

    await db_session.refresh(approval)
    assert approval.status == ApprovalStatus.PENDING
    assert approval.pending_changes == malformed_changes
    assert approval.resolution_notes is None
    assert approval.resolved_by_id is None
    assert approval.resolved_at is None
    assert approval.primary_approved_at is None
    assert approval.privileged_approver_id is None

    audit_count = await db_session.scalar(
        select(func.count())
        .select_from(ActivityLog)
        .where(
            ActivityLog.entity_type == ActivityEntityType.APPROVAL,
            ActivityLog.entity_id == approval.id,
        )
    )
    outbox_count = await db_session.scalar(
        select(func.count())
        .select_from(OutboxEvent)
        .where(OutboxEvent.aggregate_id == approval.id)
    )
    assert audit_count == 0
    assert outbox_count == 0
