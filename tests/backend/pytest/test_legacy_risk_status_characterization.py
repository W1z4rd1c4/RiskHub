"""Fail-closed legacy Risk intent and restoration regression contracts.

Historical fixture basis: commit 1cb1dd4cbda130432c791c87ed3b6d36353211b9
accepted RiskUpdate.status=archived and queued every edit of a priority Risk using
{field: {old, new}} plus the risk_edit_priority scenario snapshot. The persisted
intent below reconstructs that supported historical payload; no current API is
claimed to accept archived. This is not an arbitrary malformed-enum fixture.
"""

from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import ApprovalRequest, ApprovalStatus, Risk
from app.models.activity_log import ActivityLog
from app.models.approval_request import ApprovalActionType, ApprovalResourceType
from app.models.outbox_event import OutboxEvent
from tests.backend.pytest.factories import create_test_risk


async def observe(engine, risk_id, approval_id=None):
    # A different session/identity map sees only the database outcome, including
    # effects committed before a response serialization error.
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        risk = await session.get(Risk, risk_id)
        approval = await session.get(ApprovalRequest, approval_id) if approval_id else None
        audits = (await session.scalars(select(ActivityLog).order_by(ActivityLog.id))).all()
        outbox = (await session.scalars(select(OutboxEvent).order_by(OutboxEvent.id))).all()
        return {
            "risk": (risk.status, risk.is_archived, risk.archived_at, risk.archived_by_id),
            "name": risk.name,
            "approval": None
            if approval is None
            else (
                approval.status.value,
                approval.resolved_by_id,
                approval.resolved_at,
                approval.resolution_notes,
                approval.primary_approved_at,
                approval.pending_changes,
            ),
            "audits": [(row.entity_type, row.entity_id, row.action, row.changes) for row in audits],
            "outbox": [(row.event_type, row.aggregate_id, row.idempotency_key, row.payload) for row in outbox],
        }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "case",
    [
        "historical",
        "mixed",
        "canonical",
        "canonical_active",
        "name_only",
        "stale",
        "unauthorized",
        "synthetic_null",
        "synthetic_list",
        "synthetic_unknown",
    ],
)
async def test_public_resolution_of_historical_status_intent(
    db_session,
    async_engine,
    client_factory,
    test_department,
    test_user_cro,
    test_user_employee,
    case,
):
    risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code=f"LEGACY-INTENT-{case}",
        overrides={"status": "emerging" if case in {"stale", "canonical_active"} else "active", "is_priority": True},
    )
    target_status = {
        "canonical": "emerging",
        "canonical_active": "active",
        "synthetic_null": None,
        "synthetic_list": ["archived"],
        "synthetic_unknown": "not-a-status",
    }.get(case, "archived")
    changes = {"status": {"old": "emerging" if case == "canonical_active" else "active", "new": target_status}}
    if case in {"mixed", "name_only"}:
        changes = {"name": {"old": risk.name, "new": "Reviewed name"}, **({} if case == "name_only" else changes)}
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
        resource_name=f"{risk.risk_id_code}: historical priority Risk edit",
        action_type=ApprovalActionType.EDIT,
        requested_by_id=test_user_employee.id,
        primary_approver_id=test_user_cro.id,
        reason="Edit to priority risk - fields: status",
        status=ApprovalStatus.PENDING,
        scenario_key="risk_edit_priority",
        scenario_approver_roles=["risk_owner", "risk_manager", "cro"],
        requires_privileged_approval=False,
        pending_changes=changes,
    )
    db_session.add(approval)
    await db_session.commit()
    risk_id, approval_id = risk.id, approval.id
    before = await observe(async_engine, risk_id, approval_id)
    actor = test_user_employee if case == "unauthorized" else test_user_cro
    actor_id = actor.id
    async with client_factory(headers={"X-Mock-User-Id": str(actor_id)}, raise_app_exceptions=False) as client:
        response = await client.post(
            f"/api/v1/approvals/{approval_id}/approve", json={"resolution_notes": "Review historical status change"}
        )
        detail = await client.get(f"/api/v1/risks/{risk_id}")
    await db_session.rollback()
    after = await observe(async_engine, risk_id, approval_id)
    print({"case": case, "resolve_http": response.status_code, "detail_http": detail.status_code, "after": after})
    if case == "unauthorized":
        assert response.status_code == 403
        assert after == before
    elif case == "stale":
        assert response.status_code == 200
        assert after["risk"] == before["risk"]
        assert after["approval"][0] == "REJECTED"
        assert len(after["outbox"]) == 1
        assert after["audits"] == before["audits"]
        assert not any(row[0] == "risk" for row in after["audits"])
    elif case in {"canonical", "canonical_active", "name_only"}:
        assert response.status_code == detail.status_code == 200
        assert after["risk"][0:2] == ("active" if case == "name_only" else target_status, False)
        if case == "name_only":
            assert after["name"] == "Reviewed name"
        assert after["approval"][0] == "APPROVED"
        assert len(after["outbox"]) == 1
        assert any(row[0] == "risk" for row in after["audits"])
    else:
        assert response.status_code == 400, after
        assert response.json()["detail"]["code"] == "risk_edit_status_unsupported"
        assert "current lifecycle" in response.json()["detail"]["message"]
        assert after == before
        assert detail.status_code == 200
        async with client_factory(headers={"X-Mock-User-Id": str(actor_id)}, raise_app_exceptions=False) as client:
            repeated = await client.post(
                f"/api/v1/approvals/{approval_id}/approve", json={"resolution_notes": "Repeat refused legacy edit"}
            )
        await db_session.rollback()
        assert repeated.status_code == 400
        assert await observe(async_engine, risk_id, approval_id) == before


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status,flag,authorized",
    [
        ("archived", True, True),
        ("archived", False, True),
        ("active", True, True),
        ("emerging", True, True),
        ("archived", True, False),
        ("not-a-status", True, True),
    ],
)
async def test_public_restore_preserves_atomic_outcome_for_legacy_storage(
    db_session,
    async_engine,
    client_factory,
    test_department,
    test_user_cro,
    test_user_employee,
    status,
    flag,
    authorized,
):
    risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code=f"LEGACY-RESTORE-{status}-{flag}-{authorized}",
        overrides={
            "status": status,
            "is_archived": flag,
            "archived_at": datetime(2026, 1, 1, tzinfo=UTC) if flag else None,
            "archived_by_id": test_user_cro.id if flag else None,
        },
    )
    if not authorized:
        test_user_employee.role.permissions = [
            grant
            for grant in test_user_employee.role.permissions
            if not (grant.permission.resource == "risks" and grant.permission.action == "delete")
        ]
        await db_session.commit()
    risk_id = risk.id
    before = await observe(async_engine, risk_id)
    actor = test_user_cro if authorized else test_user_employee
    actor_id = actor.id
    async with client_factory(headers={"X-Mock-User-Id": str(actor_id)}, raise_app_exceptions=False) as client:
        response = await client.post(f"/api/v1/risks/{risk_id}/restore")
    await db_session.rollback()
    after = await observe(async_engine, risk_id)
    print(
        {"restore_status": status, "flag": flag, "authorized": authorized, "http": response.status_code, "after": after}
    )
    if not authorized:
        assert response.status_code == 403 and after == before
    elif not flag:
        assert response.status_code == 400 and after == before
    elif status in {"active", "emerging"}:
        assert response.status_code == 200
        assert after["risk"][0:2] == (status, False)
        assert len(after["audits"]) == 1 and after["audits"][0][2] == "update"
        assert after["audits"][0][3] == {
            "is_archived": {"old": True, "new": False},
            "archived_at": {"old": "[REDACTED]", "new": None},
            "archived_by_id": {"old": "[REDACTED]", "new": None},
        }
        assert after["outbox"] == []
    else:
        assert response.status_code == 409, after
        assert response.json()["detail"]["code"] == "risk_restore_status_unsupported"
        assert "migration" in response.json()["detail"]["message"]
        assert after == before
        async with client_factory(headers={"X-Mock-User-Id": str(actor_id)}, raise_app_exceptions=False) as client:
            repeated = await client.post(f"/api/v1/risks/{risk_id}/restore")
        await db_session.rollback()
        assert repeated.status_code == 409
        assert await observe(async_engine, risk_id) == before


@pytest.mark.postgres
@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["edit", "restore"])
async def test_postgres_legacy_refusal_is_visible_as_no_effects_to_fresh_observer(
    db_session,
    async_engine,
    client_factory,
    test_department,
    test_user_cro,
    test_user_employee,
    operation,
):
    if async_engine.dialect.name != "postgresql":
        pytest.skip("Authoritative cross-session transaction proof requires PostgreSQL")
    common = (db_session, async_engine, client_factory, test_department, test_user_cro, test_user_employee)
    if operation == "edit":
        await test_public_resolution_of_historical_status_intent(*common, "mixed")
    else:
        await test_public_restore_preserves_atomic_outcome_for_legacy_storage(*common, "archived", True, True)
