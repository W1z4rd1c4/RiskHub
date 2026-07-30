"""Protected Vendor governed-mutation behavior for ICT-GOV #87."""

from __future__ import annotations

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.models import (
    ActivityLog,
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalScenario,
    ApprovalStatus,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    Risk,
    Role,
    User,
    Vendor,
    VendorContract,
    VendorRiskLink,
    VendorSubOutsourcing,
)
from app.models.activity_log import ActivityAction, ActivityEntityType


async def _scenario(db: AsyncSession, *, enabled: bool = True) -> None:
    db.add(
        ApprovalScenario(
            key="protected_vendor_edit",
            display_name="Protected Vendor mutations",
            description="Independent approval for protected Vendor mutations",
            requires_approval=enabled,
            approver_roles=["risk_manager", "cro"],
        )
    )
    await db.commit()


def _payload(owner: User, **extra: object) -> dict[str, object]:
    return {
        "name": "Governed Vendor",
        "process": "Operations",
        "outsourcing_owner_user_id": owner.id,
        "department_id": owner.department_id,
        "replaceability": "not_substitutable",
        "request_reason": "Independent review for protected Vendor",
        **extra,
    }


def test_vendor_model_carries_governance_version() -> None:
    assert "governance_version" in Vendor.__table__.columns


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("target", "field", "value"),
    [
        ("proposal", "proposal_id", "not-a-canonical-uuid"),
        ("proposal", "proposal_version", 2),
        ("proposal", "schema_version", 2),
        ("approval", "resource_type", ApprovalResourceType.PROCESS),
        ("approval", "pending_changes", {}),
        ("proposal", "before_snapshot", {"unexpected": True}),
        ("proposal", "after_snapshot", {}),
        (
            "proposal",
            "impacted_resources_snapshot",
            [
                {
                    "resource_type": "vendor",
                    "resource_id": 999,
                    "resource_name": "Unexpected",
                    "base_governance_version": 1,
                }
            ],
        ),
    ],
)
async def test_vendor_resolution_expires_a_malformed_immutable_envelope(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    target: str,
    field: str,
    value: object,
) -> None:
    if db_session.bind.dialect.name == "postgresql":
        pytest.skip(
            "PostgreSQL insert-only trigger correctly forbids corruption fixtures"
        )
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post("/api/v1/vendors", json=_payload(test_user_cro))
    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]

    if target == "proposal":
        await db_session.execute(
            update(GovernedMutationProposal)
            .where(GovernedMutationProposal.approval_request_id == approval_id)
            .values({field: value})
        )
    else:
        await db_session.execute(
            update(ApprovalRequest)
            .where(ApprovalRequest.id == approval_id)
            .values({field: value})
        )
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Malformed envelope must fail closed"},
        )

    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    assert await db_session.scalar(select(func.count(Vendor.id))) == 0


@pytest.mark.asyncio
async def test_malformed_vendor_resolution_authorizes_before_expiry_and_lock_release(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    assert test_user_risk_manager.id != test_user_cro.id
    if db_session.bind.dialect.name == "postgresql":
        pytest.skip(
            "PostgreSQL insert-only trigger correctly forbids corruption fixtures"
        )
    await _scenario(db_session, enabled=False)
    direct = _payload(test_user_cro, name="Malformed resolver authorization Vendor")
    direct.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/vendors", json=direct)
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(
            ApprovalScenario.key == "protected_vendor_edit"
        )
    )
    assert scenario is not None
    scenario.requires_approval = True
    await db_session.commit()
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/vendors/{created.json()['id']}",
            json={
                "description": "Must remain unapplied",
                "request_reason": "Malformed resolver authorization regression",
            },
        )
    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id == approval_id
        )
    )
    assert proposal is not None
    await db_session.execute(
        update(GovernedMutationProposal)
        .where(GovernedMutationProposal.id == proposal.id)
        .values(proposal_version=2)
    )
    await db_session.commit()

    async with client_factory(user=test_user_employee) as unauthorized:
        denied = await unauthorized.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Must not expire someone else's proposal"},
        )

    assert denied.status_code == 403, denied.text
    approval = await db_session.get(ApprovalRequest, approval_id)
    lock = await db_session.scalar(
        select(GovernedMutationImpactLock).where(
            GovernedMutationImpactLock.proposal_id == proposal.id
        )
    )
    assert approval is not None and approval.status == ApprovalStatus.PENDING
    assert lock is not None and lock.released_at is None
    vendor = await db_session.get(Vendor, created.json()["id"])
    assert vendor is not None and vendor.description is None


@pytest.mark.asyncio
async def test_vendor_create_replay_must_match_the_approved_safe_snapshot(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    if db_session.bind.dialect.name == "postgresql":
        pytest.skip(
            "PostgreSQL insert-only trigger correctly forbids corruption fixtures"
        )
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            "/api/v1/vendors",
            json=_payload(test_user_cro, name="Approved Vendor name"),
        )
    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id == approval_id
        )
    )
    assert proposal is not None
    tampered = dict(proposal.proposed_changes)
    tampered["after"] = {
        **tampered["after"],
        "name": "Unreviewed replay name",
    }
    await db_session.execute(
        update(GovernedMutationProposal)
        .where(GovernedMutationProposal.id == proposal.id)
        .values(proposed_changes=tampered)
    )
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Raw replay must match the reviewed snapshot"},
        )

    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    assert await db_session.scalar(select(func.count(Vendor.id))) == 0


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_vendor_proposal_trigger_rejects_tamper_without_corrupting_resolution(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL insert-only trigger is authoritative")
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            "/api/v1/vendors",
            json=_payload(test_user_cro, name="PostgreSQL immutable Vendor"),
        )
    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    proposal_id = await db_session.scalar(
        select(GovernedMutationProposal.id).where(
            GovernedMutationProposal.approval_request_id == approval_id
        )
    )
    assert proposal_id is not None

    with pytest.raises(DBAPIError, match="immutable after insertion"):
        await db_session.execute(
            update(GovernedMutationProposal)
            .where(GovernedMutationProposal.id == proposal_id)
            .values(mutation_kind="vendor.archive")
        )
    await db_session.rollback()
    await db_session.refresh(test_user_risk_manager)

    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Immutable Vendor envelope preserved"},
        )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "approved"


@pytest.mark.asyncio
async def test_protected_vendor_create_is_pending_until_independent_approval(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post("/api/v1/vendors", json=_payload(test_user_cro))

    assert submitted.status_code == 202, submitted.text
    assert submitted.json()["status"] == "approval_required"
    assert await db_session.scalar(select(func.count(Vendor.id))) == 0
    approval = await db_session.get(ApprovalRequest, submitted.json()["approval_id"])
    assert approval is not None
    assert approval.status == ApprovalStatus.PENDING
    assert approval.resource_type.value == "vendor"
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id == approval.id
        )
    )
    assert proposal is not None
    assert proposal.mutation_kind == "vendor.create"
    assert proposal.derived_impact_snapshot["after"]["tier"] == "significant"

    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{approval.id}/approve",
            json={"resolution_notes": "Approved protected Vendor creation"},
        )

    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "approved"
    created = await db_session.scalar(select(Vendor))
    assert created is not None
    assert created.name == "Governed Vendor"
    assert created.governance_version == 1
    assert (
        await db_session.scalar(
            select(func.count(ActivityLog.id)).where(
                ActivityLog.entity_type == ActivityEntityType.VENDOR.value,
                ActivityLog.entity_id == created.id,
                ActivityLog.action == ActivityAction.CREATE.value,
                ActivityLog.actor_id == test_user_risk_manager.id,
            )
        )
        == 1
    )


@pytest.mark.asyncio
async def test_protected_vendor_edit_preserves_truth_and_holds_one_version_lock(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    assert test_user_risk_manager.id != test_user_cro.id
    await _scenario(db_session, enabled=False)
    direct_payload = _payload(
        test_user_cro,
        name="Direct significant Vendor",
    )
    direct_payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/vendors", json=direct_payload)
    assert created.status_code == 201, created.text
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_vendor_edit")
    )
    assert scenario is not None
    scenario.requires_approval = True
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/vendors/{created.json()['id']}",
            json={
                "description": "Proposed description",
                "request_reason": "Review Vendor edit",
            },
        )
        pending_detail = await requester.get(
            f"/api/v1/vendors/{created.json()['id']}"
        )

    assert submitted.status_code == 202, submitted.text
    assert pending_detail.status_code == 200, pending_detail.text
    pending_capabilities = pending_detail.json()["capabilities"]
    assert pending_capabilities["protected_change_requires_approval"] is True
    assert pending_capabilities["can_request_change"] is False
    assert pending_capabilities["can_cancel_pending_change"] is True
    assert pending_capabilities["has_pending_change"] is True
    assert pending_capabilities["business_edit_blocked"] is True
    for capability in (
        "can_update",
        "can_manage_accountability",
        "can_archive",
        "can_create_linked_risk",
        "can_create_linked_control",
        "can_create_linked_kri",
        "can_link_risk",
        "can_link_control",
        "can_link_kri",
        "can_manage_contracts",
        "can_manage_sub_outsourcing",
        "can_manage_asset_links",
        "can_manage_process_links",
    ):
        assert pending_capabilities[capability] is False
    assert pending_detail.json()["pending_change"]["approval_id"] == submitted.json()["approval_id"]
    assert pending_detail.json()["pending_change"]["mutation_kind"] == "vendor.edit"
    assert pending_detail.json()["pending_change"]["capabilities"] == {
        "can_view_diff": True,
        "can_cancel": True,
    }
    assert pending_detail.json()["pending_change"]["before"]["description"] is None
    assert pending_detail.json()["pending_change"]["after"]["description"] == "Proposed description"
    vendor = await db_session.get(Vendor, created.json()["id"])
    assert vendor is not None
    assert vendor.description is None
    approval_id = submitted.json()["approval_id"]
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id == approval_id
        )
    )
    assert proposal is not None
    lock = await db_session.scalar(
        select(GovernedMutationImpactLock).where(
            GovernedMutationImpactLock.proposal_id == proposal.id
        )
    )
    assert lock is not None
    assert (lock.resource_type, lock.resource_id, lock.base_governance_version) == (
        "vendor",
        vendor.id,
        1,
    )


@pytest.mark.asyncio
async def test_protected_vendor_partial_edit_applies_after_independent_approval(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session, enabled=False)
    payload = _payload(test_user_cro, name="Partial edit Vendor")
    payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/vendors", json=payload)
    assert created.status_code == 201, created.text
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(
            ApprovalScenario.key == "protected_vendor_edit"
        )
    )
    assert scenario is not None
    scenario.requires_approval = True
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/vendors/{created.json()['id']}",
            json={
                "description": "Independently reviewed description",
                "request_reason": "Review one edited field",
            },
        )
    assert submitted.status_code == 202, submitted.text

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Approve the reviewed partial edit"},
        )

    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    vendor = await db_session.get(Vendor, created.json()["id"])
    assert vendor is not None
    assert vendor.description == "Independently reviewed description"
    assert vendor.governance_version == 2


@pytest.mark.asyncio
async def test_protected_vendor_partial_edit_cancel_returns_terminal_response(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session, enabled=False)
    payload = _payload(test_user_cro, name="Partial edit cancellation Vendor")
    payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/vendors", json=payload)
    assert created.status_code == 201, created.text
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(
            ApprovalScenario.key == "protected_vendor_edit"
        )
    )
    assert scenario is not None
    scenario.requires_approval = True
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/vendors/{created.json()['id']}",
            json={
                "description": "Cancelled description",
                "request_reason": "Cancel the reviewed partial edit",
            },
        )
        assert submitted.status_code == 202, submitted.text
        cancelled = await requester.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/cancel"
        )

    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"
    vendor = await db_session.get(Vendor, created.json()["id"])
    assert vendor is not None
    assert vendor.description is None
    assert vendor.governance_version == 1


@pytest.mark.asyncio
async def test_malformed_vendor_requester_cancel_expires_safely_without_false_outcome(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    if db_session.bind.dialect.name == "postgresql":
        pytest.skip(
            "PostgreSQL insert-only trigger correctly forbids corruption fixtures"
        )
    await _scenario(db_session, enabled=False)
    direct = _payload(test_user_cro, name="Malformed cancellation Vendor")
    direct.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/vendors", json=direct)
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(
            ApprovalScenario.key == "protected_vendor_edit"
        )
    )
    assert scenario is not None
    scenario.requires_approval = True
    await db_session.commit()
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/vendors/{created.json()['id']}",
            json={
                "description": "Must not be applied",
                "request_reason": "Malformed requester cancellation regression",
            },
        )
    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id == approval_id
        )
    )
    assert proposal is not None
    await db_session.execute(
        update(ApprovalRequest)
        .where(ApprovalRequest.id == approval_id)
        .values(requested_by_id=test_user_risk_manager.id)
    )
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as substituted:
        denied = await substituted.post(f"/api/v1/approvals/{approval_id}/cancel")
    assert denied.status_code == 403, denied.text
    pending = await db_session.get(ApprovalRequest, approval_id)
    lock = await db_session.scalar(
        select(GovernedMutationImpactLock).where(
            GovernedMutationImpactLock.proposal_id == proposal.id
        )
    )
    assert pending is not None and pending.status == ApprovalStatus.PENDING
    assert lock is not None and lock.released_at is None

    async with client_factory(user=test_user_cro) as immutable_requester:
        expired = await immutable_requester.post(
            f"/api/v1/approvals/{approval_id}/cancel"
        )
    assert expired.status_code == 200, expired.text
    assert expired.json()["status"] == "expired"
    assert expired.json()["governed_mutation"] is None
    assert expired.json()["pending_changes"] is None
    await db_session.refresh(lock)
    assert lock.released_at is not None
    assert lock.release_reason == "expired"
    vendor = await db_session.get(Vendor, created.json()["id"])
    assert vendor is not None
    assert vendor.description is None
    assert vendor.governance_version == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "tamper",
    ["approval_action", "approval_requester", "released_impact_lock"],
)
async def test_vendor_edit_resolution_requires_exact_approval_and_active_lock_envelope(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    tamper: str,
) -> None:
    if db_session.bind.dialect.name == "postgresql":
        pytest.skip(
            "PostgreSQL insert-only trigger correctly forbids corruption fixtures"
        )
    await _scenario(db_session, enabled=False)
    payload = _payload(test_user_cro, name=f"Exact envelope {tamper}")
    payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/vendors", json=payload)
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(
            ApprovalScenario.key == "protected_vendor_edit"
        )
    )
    assert scenario is not None
    scenario.requires_approval = True
    await db_session.commit()
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/vendors/{created.json()['id']}",
            json={
                "description": "Must not apply",
                "request_reason": "Exact envelope regression",
            },
        )
    approval_id = submitted.json()["approval_id"]
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id == approval_id
        )
    )
    assert proposal is not None
    if tamper == "approval_action":
        await db_session.execute(
            update(ApprovalRequest)
            .where(ApprovalRequest.id == approval_id)
            .values(action_type=ApprovalActionType.DELETE)
        )
    elif tamper == "approval_requester":
        await db_session.execute(
            update(ApprovalRequest)
            .where(ApprovalRequest.id == approval_id)
            .values(requested_by_id=test_user_risk_manager.id)
        )
    else:
        await db_session.execute(
            update(GovernedMutationImpactLock)
            .where(GovernedMutationImpactLock.proposal_id == proposal.id)
            .values(released_at=utc_now(), release_reason="tampered")
        )
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Exact envelope required"},
        )

    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    vendor = await db_session.get(Vendor, created.json()["id"])
    assert vendor is not None and vendor.description is None


@pytest.mark.asyncio
async def test_vendor_edit_replay_must_match_the_approved_safe_snapshot(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    if db_session.bind.dialect.name == "postgresql":
        pytest.skip(
            "PostgreSQL insert-only trigger correctly forbids corruption fixtures"
        )
    await _scenario(db_session, enabled=False)
    payload = _payload(test_user_cro, name="Exact replay edit Vendor")
    payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/vendors", json=payload)
    assert created.status_code == 201, created.text
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(
            ApprovalScenario.key == "protected_vendor_edit"
        )
    )
    assert scenario is not None
    scenario.requires_approval = True
    await db_session.commit()
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/vendors/{created.json()['id']}",
            json={
                "description": "Reviewed description",
                "request_reason": "Bind raw edit replay",
            },
        )
    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id == approval_id
        )
    )
    assert proposal is not None
    assert proposal.before_snapshot == {"description": None}
    assert proposal.after_snapshot == {"description": "Reviewed description"}
    tampered = dict(proposal.proposed_changes)
    tampered["after"] = {"description": "Unreviewed description"}
    await db_session.execute(
        update(GovernedMutationProposal)
        .where(GovernedMutationProposal.id == proposal.id)
        .values(proposed_changes=tampered)
    )
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Edit replay must match the reviewed snapshot"},
        )

    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    vendor = await db_session.get(Vendor, created.json()["id"])
    assert vendor is not None and vendor.description is None


@pytest.mark.asyncio
async def test_protected_vendor_requester_cannot_self_approve_and_can_cancel(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    assert test_user_risk_manager.id != test_user_cro.id
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post("/api/v1/vendors", json=_payload(test_user_cro))
        approval_id = submitted.json()["approval_id"]
        self_approved = await requester.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Self approval must fail"},
        )
        cancelled = await requester.post(f"/api/v1/approvals/{approval_id}/cancel")

    assert self_approved.status_code == 403, self_approved.text
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"
    assert await db_session.scalar(select(func.count(Vendor.id))) == 0


@pytest.mark.asyncio
async def test_protected_vendor_archive_stays_effective_until_approved(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    assert test_user_risk_manager.id != test_user_cro.id
    await _scenario(db_session, enabled=False)
    payload = _payload(test_user_cro)
    payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/vendors", json=payload)
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_vendor_edit")
    )
    assert scenario is not None
    scenario.requires_approval = True
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.request(
            "DELETE",
            f"/api/v1/vendors/{created.json()['id']}",
            json={"request_reason": "Review Vendor archive"},
        )

    assert submitted.status_code == 202, submitted.text
    vendor = await db_session.get(Vendor, created.json()["id"])
    assert vendor is not None and vendor.is_archived is False


@pytest.mark.asyncio
async def test_protected_vendor_contract_create_is_one_pending_aggregate_mutation(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session, enabled=False)
    payload = _payload(test_user_cro)
    payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/vendors", json=payload)
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_vendor_edit")
    )
    assert scenario is not None
    scenario.requires_approval = True
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/vendors/{created.json()['id']}/contracts",
            json={
                "contract_reference": "GOV-CTR-1",
                "request_reason": "Review protected Vendor Contract",
            },
        )
    assert submitted.status_code == 202, submitted.text
    assert await db_session.scalar(select(func.count(VendorContract.id))) == 0

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Approve Contract"},
        )
    assert approved.status_code == 200, approved.text
    contract = await db_session.scalar(select(VendorContract))
    vendor = await db_session.get(Vendor, created.json()["id"])
    assert contract is not None and contract.contract_reference == "GOV-CTR-1"
    assert vendor is not None and vendor.governance_version == 2
    assert (
        await db_session.scalar(
            select(func.count(ActivityLog.id)).where(
                ActivityLog.entity_type
                == ActivityEntityType.VENDOR_CONTRACT.value,
                ActivityLog.entity_id == contract.id,
                ActivityLog.action == ActivityAction.CREATE.value,
                ActivityLog.actor_id == test_user_risk_manager.id,
            )
        )
        == 1
    )


@pytest.mark.asyncio
async def test_protected_vendor_sub_outsourcing_create_is_pending_then_atomic(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session, enabled=False)
    payload = _payload(test_user_cro)
    payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/vendors", json=payload)
        contract = await requester.post(
            f"/api/v1/vendors/{created.json()['id']}/contracts",
            json={"contract_reference": "GOV-SUB-CTR"},
        )
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_vendor_edit")
    )
    assert scenario is not None
    scenario.requires_approval = True
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/vendors/{created.json()['id']}/sub-outsourcing",
            json={
                "contract_id": contract.json()["id"],
                "sub_provider_name": "Governed downstream",
                "request_reason": "Review Sub-outsourcing",
            },
        )
    assert submitted.status_code == 202, submitted.text
    assert (
        await db_session.scalar(select(func.count(VendorSubOutsourcing.id))) == 0
    )

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Approve Sub-outsourcing"},
        )
    assert approved.status_code == 200, approved.text
    entry = await db_session.scalar(select(VendorSubOutsourcing))
    vendor = await db_session.get(Vendor, created.json()["id"])
    assert entry is not None and entry.sub_provider_name == "Governed downstream"
    assert vendor is not None and vendor.governance_version == 3
    assert (
        await db_session.scalar(
            select(func.count(ActivityLog.id)).where(
                ActivityLog.entity_type
                == ActivityEntityType.VENDOR_SUB_OUTSOURCING.value,
                ActivityLog.entity_id == entry.id,
                ActivityLog.action == ActivityAction.CREATE.value,
                ActivityLog.actor_id == test_user_risk_manager.id,
            )
        )
        == 1
    )


@pytest.mark.asyncio
async def test_vendor_child_approval_expires_when_requester_loses_live_write_authority(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session, enabled=False)
    payload = _payload(test_user_cro)
    payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/vendors", json=payload)
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(
            ApprovalScenario.key == "protected_vendor_edit"
        )
    )
    assert scenario is not None
    scenario.requires_approval = True
    await db_session.commit()
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/vendors/{created.json()['id']}/contracts",
            json={
                "contract_reference": "REVOKED-REQUESTER",
                "request_reason": "Queue before permission revocation",
            },
        )
    assert submitted.status_code == 202, submitted.text

    revoked_role = Role(
        name="vendor_child_requester_revoked",
        display_name="Vendor child requester revoked",
        description="No business permissions",
    )
    db_session.add(revoked_role)
    await db_session.flush()
    await db_session.execute(
        update(User)
        .where(User.id == test_user_cro.id)
        .values(role_id=revoked_role.id)
    )
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Requester authority must be live"},
        )

    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    assert await db_session.scalar(select(func.count(VendorContract.id))) == 0


@pytest.mark.asyncio
async def test_protected_vendor_risk_link_add_is_pending_then_atomic(
    client_factory,
    db_session: AsyncSession,
    test_risk,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session, enabled=False)
    payload = _payload(test_user_cro)
    payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/vendors", json=payload)
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_vendor_edit")
    )
    assert scenario is not None
    scenario.requires_approval = True
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/vendors/{created.json()['id']}/linked-risks",
            json={
                "risk_id": test_risk.id,
                "request_reason": "Review protected Vendor Risk link",
            },
        )
        pending_detail = await requester.get(
            f"/api/v1/vendors/{created.json()['id']}"
        )

    assert submitted.status_code == 202, submitted.text
    assert pending_detail.json()["pending_change"]["before"] == {
        "linked_risk": False,
        "relationship_target": None,
    }
    assert pending_detail.json()["pending_change"]["after"] == {
        "linked_risk": True,
        "relationship_target": (
            f"{test_risk.risk_id_code}: {test_risk.name}"
        ),
    }
    assert await db_session.scalar(select(func.count(VendorRiskLink.id))) == 0

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Approve Vendor Risk link"},
        )

    assert approved.status_code == 200, approved.text
    link = await db_session.scalar(select(VendorRiskLink))
    vendor = await db_session.get(Vendor, created.json()["id"])
    assert link is not None and link.risk_id == test_risk.id
    assert vendor is not None and vendor.governance_version == 2
    activity = await db_session.scalar(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.VENDOR_LINK.value,
            ActivityLog.entity_id == vendor.id,
            ActivityLog.action == ActivityAction.CREATE.value,
        )
    )
    assert activity is not None
    assert activity.actor_id == test_user_risk_manager.id
    assert activity.changes == {
        "relationship_type": {"old": None, "new": "risk"},
        "relationship_target": {
            "old": None,
            "new": f"{test_risk.risk_id_code}: {test_risk.name}",
        },
    }
    assert "target_id" not in activity.changes
    assert "vendor_id" not in activity.changes


@pytest.mark.asyncio
async def test_vendor_relationship_replay_must_match_the_approved_business_target(
    client_factory,
    db_session: AsyncSession,
    test_risk: Risk,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    if db_session.bind.dialect.name == "postgresql":
        pytest.skip(
            "PostgreSQL insert-only trigger correctly forbids corruption fixtures"
        )
    await _scenario(db_session, enabled=False)
    payload = _payload(test_user_cro, name="Exact relationship replay Vendor")
    payload.pop("request_reason")
    other_risk = Risk(
        risk_id_code="VEND-REPLAY-OTHER",
        name="Unreviewed relationship target",
        process="Operations",
        description="Must not replace the approved target",
        owner_id=test_user_cro.id,
        department_id=test_user_cro.department_id,
    )
    db_session.add(other_risk)
    await db_session.flush()
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/vendors", json=payload)
    assert created.status_code == 201, created.text
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(
            ApprovalScenario.key == "protected_vendor_edit"
        )
    )
    assert scenario is not None
    scenario.requires_approval = True
    await db_session.commit()
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/vendors/{created.json()['id']}/linked-risks",
            json={
                "risk_id": test_risk.id,
                "request_reason": "Bind the reviewed Risk target",
            },
        )
    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id == approval_id
        )
    )
    assert proposal is not None
    tampered = {
        "operation": {
            **proposal.proposed_changes["operation"],
            "entity_id": other_risk.id,
        }
    }
    await db_session.execute(
        update(GovernedMutationProposal)
        .where(GovernedMutationProposal.id == proposal.id)
        .values(proposed_changes=tampered)
    )
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Relationship replay must remain exact"},
        )

    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    assert await db_session.scalar(select(func.count(VendorRiskLink.id))) == 0


@pytest.mark.asyncio
async def test_protected_vendor_risk_link_remove_is_pending_then_atomic(
    client_factory,
    db_session: AsyncSession,
    test_risk,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session, enabled=False)
    payload = _payload(test_user_cro)
    payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/vendors", json=payload)
        linked = await requester.post(
            f"/api/v1/vendors/{created.json()['id']}/linked-risks",
            json={"risk_id": test_risk.id},
        )
    assert linked.status_code == 201, linked.text
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_vendor_edit")
    )
    assert scenario is not None
    scenario.requires_approval = True
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.request(
            "DELETE",
            f"/api/v1/vendors/{created.json()['id']}/linked-risks/{test_risk.id}",
            json={"request_reason": "Review protected Vendor Risk unlink"},
        )

    assert submitted.status_code == 202, submitted.text
    assert await db_session.scalar(select(func.count(VendorRiskLink.id))) == 1

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Approve Vendor Risk unlink"},
        )

    assert approved.status_code == 200, approved.text
    assert await db_session.scalar(select(func.count(VendorRiskLink.id))) == 0
    vendor = await db_session.get(Vendor, created.json()["id"])
    assert vendor is not None and vendor.governance_version == 3
    activity = await db_session.scalar(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.VENDOR_LINK.value,
            ActivityLog.entity_id == vendor.id,
            ActivityLog.action == ActivityAction.DELETE.value,
        )
    )
    assert activity is not None
    assert activity.actor_id == test_user_risk_manager.id
    assert activity.changes == {
        "relationship_type": {"old": "risk", "new": None},
        "relationship_target": {
            "old": f"{test_risk.risk_id_code}: {test_risk.name}",
            "new": None,
        },
    }
    assert "target_id" not in activity.changes
    assert "vendor_id" not in activity.changes
