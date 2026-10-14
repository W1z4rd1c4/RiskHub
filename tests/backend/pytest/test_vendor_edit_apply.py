"""Vendor edit application through its authenticated HTTP entrypoints (#270)."""

from __future__ import annotations

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ActivityLog,
    ApprovalRequest,
    ApprovalScenario,
    ApprovalStatus,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    OrphanedItem,
    User,
    Vendor,
)
from app.models.outbox_event import OutboxEvent


async def _vendor_case(
    db: AsyncSession,
    *,
    owner: User,
    governed: bool = False,
    orphaned: bool = False,
) -> tuple[Vendor, OrphanedItem | None]:
    db.add_all(
        [
            ApprovalScenario(
                key="protected_vendor_edit",
                display_name="Protected Vendor edits",
                description="Independent Vendor review",
                requires_approval=governed,
                approver_roles=["risk_manager", "cro"],
            ),
            ApprovalScenario(
                key="accountability_reassignment",
                display_name="Accountability reassignments",
                description="Independent accountability review",
                requires_approval=False,
                approver_roles=["risk_manager", "cro"],
            ),
        ]
    )
    vendor = Vendor(
        name="Vendor apply characterization",
        process="Operations",
        description="Before",
        outsourcing_owner_user_id=owner.id,
        department_id=owner.department_id,
        replaceability="not_substitutable",
        governance_version=7,
    )
    db.add(vendor)
    await db.flush()
    orphan = None
    if orphaned:
        owner.is_active = False
        orphan = OrphanedItem(
            item_type="vendor",
            item_id=vendor.id,
            responsibility_role="outsourcing_owner",
            previous_owner_id=owner.id,
            status="pending",
        )
        db.add(orphan)
    await db.commit()
    return vendor, orphan


@pytest.mark.asyncio
@pytest.mark.parametrize("entrypoint", ["direct", "approved", "orphan"])
async def test_vendor_edit_entrypoints_preserve_one_version_advance(
    client_factory,
    db_session: AsyncSession,
    test_user_employee: User,
    test_user_cro: User,
    test_user_risk_manager: User,
    entrypoint: str,
) -> None:
    vendor, orphan = await _vendor_case(
        db_session,
        owner=test_user_employee,
        governed=entrypoint == "approved",
        orphaned=entrypoint == "orphan",
    )
    vendor_id = vendor.id
    resolver_id = test_user_cro.id
    replacement_owner_id = test_user_risk_manager.id
    if entrypoint == "orphan":
        assert orphan is not None
        orphan_id = orphan.id
        async with client_factory(user=test_user_cro) as client:
            result = await client.post(
                f"/api/v1/orphaned-items/{orphan_id}/resolve",
                json={"new_owner_id": replacement_owner_id},
            )
        assert result.status_code == 200, result.text
        persisted_orphan = await db_session.get(OrphanedItem, orphan_id)
        assert persisted_orphan is not None
        assert persisted_orphan.status == "resolved"
        assert persisted_orphan.resolved_by_id == resolver_id
        assert persisted_orphan.new_owner_id == replacement_owner_id
        assert persisted_orphan.resolved_at is not None
    else:
        async with client_factory(user=test_user_cro) as client:
            result = await client.patch(
                f"/api/v1/vendors/{vendor_id}",
                json={"description": "After", "request_reason": "Review edited Vendor"},
            )
        if entrypoint == "approved":
            assert result.status_code == 202, result.text
            approval_id = result.json()["approval_id"]
            await db_session.refresh(vendor)
            assert vendor.description == "Before"
            assert vendor.governance_version == 7
            async with client_factory(user=test_user_risk_manager) as client:
                approval = await client.post(
                    f"/api/v1/approvals/{approval_id}/approve",
                    json={"resolution_notes": "Approved Vendor edit"},
                )
            assert approval.status_code == 200, approval.text
            assert approval.json()["status"] == "approved"
        else:
            assert result.status_code == 200, result.text

    persisted = await db_session.scalar(select(Vendor).where(Vendor.id == vendor_id))
    assert persisted is not None
    assert persisted.governance_version == 8
    if entrypoint == "orphan":
        assert persisted.outsourcing_owner_user_id == replacement_owner_id
    else:
        assert persisted.description == "After"


@pytest.mark.asyncio
async def test_direct_vendor_noop_keeps_version(
    client_factory,
    db_session: AsyncSession,
    test_user_employee: User,
    test_user_cro: User,
) -> None:
    vendor, _ = await _vendor_case(db_session, owner=test_user_employee)
    async with client_factory(user=test_user_cro) as client:
        result = await client.patch(f"/api/v1/vendors/{vendor.id}", json={"description": "Before"})
    assert result.status_code == 200, result.text
    assert vendor.description == "Before"
    assert vendor.governance_version == 7


@pytest.mark.asyncio
async def test_direct_vendor_orphan_noop_closes_evidence_without_version_advance(
    client_factory,
    db_session: AsyncSession,
    test_user_employee: User,
    test_user_cro: User,
) -> None:
    vendor, orphan = await _vendor_case(db_session, owner=test_user_employee, orphaned=True)
    assert orphan is not None
    # A recovered owner can resolve retained pending evidence to themselves.
    test_user_employee.is_active = True
    await db_session.commit()
    async with client_factory(user=test_user_cro) as client:
        result = await client.post(
            f"/api/v1/orphaned-items/{orphan.id}/resolve",
            json={"new_owner_id": test_user_employee.id},
        )
    assert result.status_code == 200, result.text
    assert vendor.governance_version == 7
    assert vendor.outsourcing_owner_user_id == test_user_employee.id
    assert orphan.status == "resolved"
    assert orphan.new_owner_id == test_user_employee.id


@pytest.mark.asyncio
async def test_vendor_edit_normalizes_entered_enum_value(
    client_factory,
    db_session: AsyncSession,
    test_user_employee: User,
    test_user_cro: User,
) -> None:
    vendor, _ = await _vendor_case(db_session, owner=test_user_employee)
    async with client_factory(user=test_user_cro) as client:
        result = await client.patch(f"/api/v1/vendors/{vendor.id}", json={"vendor_type": "ict"})
    assert result.status_code == 200, result.text
    await db_session.refresh(vendor)
    assert type(vendor.vendor_type) is str
    assert vendor.vendor_type == "ict"
    assert vendor.description == "Before"
    assert vendor.governance_version == 8


@pytest.mark.asyncio
@pytest.mark.parametrize("entrypoint", ["direct", "approved", "orphan"])
async def test_vendor_edit_commit_failure_rolls_back_application_and_side_effects(
    client_factory,
    db_session: AsyncSession,
    test_user_employee: User,
    test_user_cro: User,
    test_user_risk_manager: User,
    entrypoint: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    vendor, orphan = await _vendor_case(
        db_session,
        owner=test_user_employee,
        governed=entrypoint == "approved",
        orphaned=entrypoint == "orphan",
    )
    vendor_id = vendor.id
    previous_owner_id = vendor.outsourcing_owner_user_id
    orphan_id = orphan.id if orphan is not None else None
    requester_id = test_user_cro.id
    replacement_owner_id = test_user_risk_manager.id
    approval_id = None
    if entrypoint == "approved":
        async with client_factory(user=test_user_cro) as client:
            submitted = await client.patch(
                f"/api/v1/vendors/{vendor_id}",
                json={"description": "After", "request_reason": "Review edited Vendor"},
            )
        assert submitted.status_code == 202, submitted.text
        approval_id = submitted.json()["approval_id"]
    initial_audits = await db_session.scalar(select(func.count()).select_from(ActivityLog))
    initial_outbox = await db_session.scalar(select(func.count()).select_from(OutboxEvent))

    async def failed_commit() -> None:
        # Ensure all application and side-effect writes reached the database
        # inside the current transaction before injecting its completion failure.
        await db_session.flush()
        raise RuntimeError("Injected Vendor edit commit failure")

    monkeypatch.setattr(db_session, "commit", failed_commit)
    actor_id = replacement_owner_id if entrypoint == "approved" else requester_id
    async with client_factory(
        headers={"X-Mock-User-Id": str(actor_id)}, raise_app_exceptions=False
    ) as client:
        if entrypoint == "approved":
            result = await client.post(
                f"/api/v1/approvals/{approval_id}/approve",
                json={"resolution_notes": "Approve atomically"},
            )
        elif entrypoint == "orphan":
            result = await client.post(
                f"/api/v1/orphaned-items/{orphan_id}/resolve",
                json={"new_owner_id": replacement_owner_id},
            )
        else:
            result = await client.patch(f"/api/v1/vendors/{vendor_id}", json={"description": "After"})
    assert result.status_code == 500, result.text

    persisted = await db_session.get(Vendor, vendor_id)
    assert persisted is not None
    assert persisted.governance_version == 7
    assert persisted.description == "Before"
    assert persisted.outsourcing_owner_user_id == previous_owner_id
    assert await db_session.scalar(select(func.count()).select_from(ActivityLog)) == initial_audits
    assert await db_session.scalar(select(func.count()).select_from(OutboxEvent)) == initial_outbox
    if orphan_id is not None:
        persisted_orphan = await db_session.get(OrphanedItem, orphan_id)
        assert persisted_orphan is not None
        assert persisted_orphan.status == "pending"
        assert persisted_orphan.resolved_at is None
        assert persisted_orphan.resolved_by_id is None
        assert persisted_orphan.new_owner_id is None
    if approval_id is not None:
        approval = await db_session.get(ApprovalRequest, approval_id)
        assert approval is not None
        assert approval.status == ApprovalStatus.PENDING
        lock = await db_session.scalar(
            select(GovernedMutationImpactLock)
            .join(GovernedMutationProposal)
            .where(GovernedMutationProposal.approval_request_id == approval_id)
        )
        assert lock is not None
        assert lock.released_at is None


@pytest.mark.asyncio
@pytest.mark.parametrize("entrypoint", ["direct", "approved", "orphan"])
async def test_denied_vendor_edit_actor_cannot_apply_or_complete_evidence(
    client_factory,
    db_session: AsyncSession,
    test_user_employee: User,
    test_user_cro: User,
    test_user_risk_manager: User,
    entrypoint: str,
) -> None:
    vendor, orphan = await _vendor_case(
        db_session,
        owner=test_user_risk_manager,
        governed=entrypoint == "approved",
        orphaned=entrypoint == "orphan",
    )
    vendor_id = vendor.id
    owner_id = vendor.outsourcing_owner_user_id
    approval_id = None
    if entrypoint == "approved":
        async with client_factory(user=test_user_cro) as client:
            submitted = await client.patch(
                f"/api/v1/vendors/{vendor_id}",
                json={"description": "After", "request_reason": "Review edited Vendor"},
            )
        assert submitted.status_code == 202, submitted.text
        approval_id = submitted.json()["approval_id"]
    initial_audits = await db_session.scalar(select(func.count()).select_from(ActivityLog))
    initial_outbox = await db_session.scalar(select(func.count()).select_from(OutboxEvent))
    async with client_factory(user=test_user_employee) as client:
        if entrypoint == "approved":
            denied = await client.post(
                f"/api/v1/approvals/{approval_id}/approve",
                json={"resolution_notes": "Attempt without resolver authority"},
            )
        elif entrypoint == "orphan":
            assert orphan is not None
            denied = await client.post(
                f"/api/v1/orphaned-items/{orphan.id}/resolve",
                json={"new_owner_id": test_user_employee.id},
            )
        else:
            denied = await client.patch(f"/api/v1/vendors/{vendor_id}", json={"description": "After"})
    assert denied.status_code == 403, denied.text
    await db_session.refresh(vendor)
    assert vendor.governance_version == 7
    assert vendor.description == "Before"
    assert vendor.outsourcing_owner_user_id == owner_id
    assert await db_session.scalar(select(func.count()).select_from(ActivityLog)) == initial_audits
    assert await db_session.scalar(select(func.count()).select_from(OutboxEvent)) == initial_outbox
    if orphan is not None:
        await db_session.refresh(orphan)
        assert orphan.status == "pending"
        assert orphan.resolved_at is None
        assert orphan.new_owner_id is None
    if approval_id is not None:
        approval = await db_session.get(ApprovalRequest, approval_id)
        assert approval is not None
        assert approval.status == ApprovalStatus.PENDING
