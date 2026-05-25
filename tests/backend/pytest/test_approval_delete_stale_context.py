from __future__ import annotations

import importlib
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ActivityAction,
    ActivityLog,
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Control,
    ControlRiskLink,
    Department,
    KeyRiskIndicator,
    OutboxEvent,
    Risk,
    User,
)
from tests.backend.pytest.factories import create_test_control, create_test_kri, create_test_risk


async def _other_department(db: AsyncSession, *, code: str) -> Department:
    department = Department(name=f"Other {code}", code=code, description=f"Other department {code}")
    db.add(department)
    await db.commit()
    await db.refresh(department)
    return department


async def _load_approval(db: AsyncSession, approval_id: int) -> ApprovalRequest:
    approval = await db.get(ApprovalRequest, approval_id)
    assert approval is not None
    return approval


async def _assert_no_archive_activity(
    db: AsyncSession,
    *,
    entity_type: str,
    entity_id: int,
) -> None:
    count = await db.scalar(
        select(func.count())
        .select_from(ActivityLog)
        .where(
            ActivityLog.entity_type == entity_type,
            ActivityLog.entity_id == entity_id,
            ActivityLog.action == ActivityAction.ARCHIVE,
        )
    )
    assert count == 0


async def _assert_resolved_outbox_rejected(db: AsyncSession, *, approval_id: int) -> None:
    event = (
        await db.execute(
            select(OutboxEvent).where(
                OutboxEvent.event_type == "approval.request_resolved",
                OutboxEvent.aggregate_id == approval_id,
            )
        )
    ).scalar_one()
    assert event.payload["approval_id"] == approval_id
    assert event.payload["approved"] is False


async def _approve(
    client_risk_manager: AsyncClient,
    *,
    approval_id: int,
) -> dict:
    response = await client_risk_manager.post(
        f"/api/v1/approvals/{approval_id}/approve",
        json={"resolution_notes": "Approve delete request"},
    )
    assert response.status_code == 200
    return response.json()


@pytest.mark.asyncio
async def test_stale_risk_delete_rejects_after_owner_department_drift(
    client_approval_requester: AsyncClient,
    client_risk_manager: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
    test_user_employee: User,
):
    risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="STALE-RISK-DELETE",
        name="Stale Risk Delete",
    )

    delete_response = await client_approval_requester.delete(
        f"/api/v1/risks/{risk.id}",
        params={"reason": "Delete stale risk"},
    )
    assert delete_response.status_code == 202
    approval_id = delete_response.json()["approval_id"]

    other = await _other_department(db_session, code="STALE-RISK")
    risk.owner_id = test_user_employee.id
    risk.department_id = other.id
    db_session.add(risk)
    await db_session.commit()

    body = await _approve(client_risk_manager, approval_id=approval_id)
    assert body["status"] == "rejected"
    assert "stale delete context" in body["resolution_notes"].lower()

    refreshed = await db_session.get(Risk, risk.id)
    assert refreshed is not None
    assert refreshed.is_archived is False
    await _assert_no_archive_activity(db_session, entity_type="risk", entity_id=risk.id)
    await _assert_resolved_outbox_rejected(db_session, approval_id=approval_id)


@pytest.mark.asyncio
async def test_stale_control_delete_rejects_after_owner_department_linkage_drift(
    client_approval_requester: AsyncClient,
    client_risk_manager: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
    test_user_employee: User,
):
    risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="STALE-CONTROL-RISK",
        name="Stale Control Risk",
    )
    control = await create_test_control(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        name="Stale Control Delete",
    )
    link = ControlRiskLink(control_id=control.id, risk_id=risk.id)
    db_session.add(link)
    await db_session.commit()

    delete_response = await client_approval_requester.delete(
        f"/api/v1/controls/{control.id}",
        params={"reason": "Delete stale control"},
    )
    assert delete_response.status_code == 202
    approval_id = delete_response.json()["approval_id"]

    other = await _other_department(db_session, code="STALE-CTRL")
    control.control_owner_id = test_user_employee.id
    control.department_id = other.id
    await db_session.delete(link)
    await db_session.commit()

    body = await _approve(client_risk_manager, approval_id=approval_id)
    assert body["status"] == "rejected"
    assert "stale delete context" in body["resolution_notes"].lower()

    refreshed = await db_session.get(Control, control.id)
    assert refreshed is not None
    assert refreshed.is_archived is False
    await _assert_no_archive_activity(db_session, entity_type="control", entity_id=control.id)
    await _assert_resolved_outbox_rejected(db_session, approval_id=approval_id)


@pytest.mark.asyncio
async def test_stale_kri_delete_rejects_after_parent_risk_reporting_owner_drift(
    client_approval_requester: AsyncClient,
    client_risk_manager: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
    test_user_employee: User,
):
    original_risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="STALE-KRI-RISK-1",
        name="Original KRI Parent",
    )
    new_parent = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="STALE-KRI-RISK-2",
        name="New KRI Parent",
    )
    kri = await create_test_kri(
        db_session,
        risk_id=original_risk.id,
        metric_name="Stale KRI Delete",
        overrides={"reporting_owner_id": test_user_cro.id},
    )

    delete_response = await client_approval_requester.delete(
        f"/api/v1/kris/{kri.id}",
        params={"reason": "Delete stale KRI"},
    )
    assert delete_response.status_code == 202
    approval_id = delete_response.json()["approval_id"]

    kri.risk_id = new_parent.id
    kri.reporting_owner_id = test_user_employee.id
    db_session.add(kri)
    await db_session.commit()

    body = await _approve(client_risk_manager, approval_id=approval_id)
    assert body["status"] == "rejected"
    assert "stale delete context" in body["resolution_notes"].lower()

    refreshed = await db_session.get(KeyRiskIndicator, kri.id)
    assert refreshed is not None
    assert refreshed.is_archived is False
    await _assert_no_archive_activity(db_session, entity_type="kri", entity_id=kri.id)
    await _assert_resolved_outbox_rejected(db_session, approval_id=approval_id)


@pytest.mark.asyncio
async def test_stale_kri_delete_rejects_after_parent_risk_context_drift(
    client_approval_requester: AsyncClient,
    client_risk_manager: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
    test_user_employee: User,
):
    parent_risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="STALE-KRI-PARENT-CONTEXT",
        name="KRI Parent Context",
    )
    kri = await create_test_kri(
        db_session,
        risk_id=parent_risk.id,
        metric_name="Stale KRI Parent Context Delete",
        overrides={"reporting_owner_id": test_user_cro.id},
    )

    delete_response = await client_approval_requester.delete(
        f"/api/v1/kris/{kri.id}",
        params={"reason": "Delete stale KRI parent context"},
    )
    assert delete_response.status_code == 202
    approval_id = delete_response.json()["approval_id"]

    other = await _other_department(db_session, code="STALE-KRI-PARENT")
    parent_risk.owner_id = test_user_employee.id
    parent_risk.department_id = other.id
    db_session.add(parent_risk)
    await db_session.commit()

    body = await _approve(client_risk_manager, approval_id=approval_id)
    assert body["status"] == "rejected"
    assert "stale delete context" in body["resolution_notes"].lower()

    refreshed = await db_session.get(KeyRiskIndicator, kri.id)
    assert refreshed is not None
    assert refreshed.is_archived is False
    await _assert_no_archive_activity(db_session, entity_type="kri", entity_id=kri.id)
    await _assert_resolved_outbox_rejected(db_session, approval_id=approval_id)


@pytest.mark.asyncio
async def test_legacy_existing_target_delete_approval_without_snapshot_fails_closed(
    client_risk_manager: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user_approval_requester: User,
    test_user_cro: User,
):
    risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="LEGACY-NO-SNAPSHOT",
        name="Legacy No Snapshot",
    )
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
        resource_name=risk.name,
        action_type=ApprovalActionType.DELETE,
        requested_by_id=test_user_approval_requester.id,
        reason="Legacy delete request without snapshot",
        status=ApprovalStatus.PENDING,
        primary_approver_id=test_user_cro.id,
        requires_privileged_approval=False,
    )
    db_session.add(approval)
    await db_session.commit()
    await db_session.refresh(approval)

    body = await _approve(client_risk_manager, approval_id=approval.id)
    assert body["status"] == "rejected"
    assert "delete context snapshot is missing" in body["resolution_notes"].lower()

    refreshed = await db_session.get(Risk, risk.id)
    assert refreshed is not None
    assert refreshed.is_archived is False
    await _assert_no_archive_activity(db_session, entity_type="risk", entity_id=risk.id)
    await _assert_resolved_outbox_rejected(db_session, approval_id=approval.id)


def test_model_migration_and_delete_context_interface_contract():
    assert hasattr(ApprovalRequest, "delete_context_snapshot")
    assert "delete_context_snapshot" in ApprovalRequest.__table__.columns

    module = importlib.import_module("app.services._approval_queue.delete_context")
    assert hasattr(module, "DeleteApprovalContext")
    assert hasattr(module, "capture_delete_approval_context")
    assert hasattr(module, "serialize_delete_approval_context")
    assert hasattr(module, "deserialize_delete_approval_context")
    assert hasattr(module, "compare_delete_approval_context")

    repo_root = Path(__file__).resolve().parents[3]
    migration_files = sorted((repo_root / "backend/alembic/versions").glob("*delete*context*.py"))
    assert migration_files, "Expected a migration adding approval_requests.delete_context_snapshot"
    migration_text = "\n".join(path.read_text() for path in migration_files)
    assert "approval_requests" in migration_text
    assert "delete_context_snapshot" in migration_text


@pytest.mark.asyncio
async def test_snapshot_persists_via_approval_api_and_direct_delete_routes(
    client_approval_requester: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
):
    api_risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="SNAPSHOT-API-RISK",
        name="Snapshot API Risk",
    )
    api_response = await client_approval_requester.post(
        "/api/v1/approvals",
        json={"resource_type": "risk", "resource_id": api_risk.id, "reason": "Snapshot through API"},
    )
    assert api_response.status_code == 201
    api_approval = await _load_approval(db_session, api_response.json()["id"])
    assert api_approval.delete_context_snapshot["version"] == 1
    assert api_approval.delete_context_snapshot["resource_type"] == "risk"

    direct_risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="SNAPSHOT-DIRECT-RISK",
        name="Snapshot Direct Risk",
    )
    control = await create_test_control(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        name="Snapshot Direct Control",
    )
    kri_risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="SNAPSHOT-DIRECT-KRI-RISK",
        name="Snapshot Direct KRI Risk",
    )
    kri = await create_test_kri(db_session, risk_id=kri_risk.id, metric_name="Snapshot Direct KRI")

    direct_targets = [
        ("risks", direct_risk.id, "risk"),
        ("controls", control.id, "control"),
        ("kris", kri.id, "kri"),
    ]
    for endpoint, entity_id, resource_type in direct_targets:
        response = await client_approval_requester.delete(
            f"/api/v1/{endpoint}/{entity_id}",
            params={"reason": f"Snapshot through DELETE {endpoint}"},
        )
        assert response.status_code == 202
        approval = await _load_approval(db_session, response.json()["approval_id"])
        assert approval.delete_context_snapshot["version"] == 1
        assert approval.delete_context_snapshot["resource_type"] == resource_type
        assert approval.delete_context_snapshot["resource_id"] == entity_id
