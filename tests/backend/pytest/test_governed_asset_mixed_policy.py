"""Asset cascade envelopes preserve impacts independently of approval policies."""

from __future__ import annotations

from collections import Counter
from copy import deepcopy

import pytest
from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value

from app.models import (
    ActivityLog,
    ApprovalRequest,
    ApprovalScenario,
    ApprovalStatus,
    Asset,
    AssetVendorLink,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    OutboxEvent,
    Process,
    ProcessAssetLink,
    User,
    Vendor,
)
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.services._governed_mutations.asset_identity import (
    valid_asset_governed_envelope,
)


async def _linked_asset(
    db: AsyncSession,
    owner: User,
    *,
    asset_enabled: bool = True,
    vendor_enabled: bool = False,
) -> tuple[Asset, Vendor]:
    for key, enabled in (
        ("protected_asset_edit", asset_enabled),
        ("protected_vendor_edit", vendor_enabled),
    ):
        db.add(
            ApprovalScenario(
                key=key,
                display_name=key,
                description="Independent Asset cascade approval",
                requires_approval=enabled,
                approver_roles=["risk_manager", "cro"],
            )
        )
    process = Process(
        f_code="F-ASSET-MIXED",
        l0_area="Operations",
        l1_process="Asset cascade",
        process_owner_user_id=owner.id,
        owning_department_id=owner.department_id,
        cif_override="yes",
    )
    asset = Asset(
        name="Asset cascade",
        business_owner_user_id=owner.id,
        ict_owner_user_id=owner.id,
        owning_department_id=owner.department_id,
        governance_version=7,
    )
    vendor = Vendor(
        name="Downstream Vendor",
        process="Operations",
        outsourcing_owner_user_id=owner.id,
        department_id=owner.department_id,
        replaceability="easily_substitutable",
        governance_version=13,
    )
    db.add_all([process, asset, vendor])
    await db.flush()
    db.add_all(
        [
            ProcessAssetLink(process_id=process.id, asset_id=asset.id, is_primary=True),
            AssetVendorLink(
                asset_id=asset.id, vendor_id=vendor.id, ict_service_code="S01"
            ),
        ]
    )
    await db.commit()
    return asset, vendor


async def _submit(client_factory, owner: User, asset_id: int, action: str = "edit"):
    async with client_factory(user=owner) as client:
        if action == "archive":
            return await client.request(
                "DELETE",
                f"/api/v1/assets/{asset_id}",
                json={"request_reason": "Review Asset cascade retirement"},
            )
        return await client.patch(
            f"/api/v1/assets/{asset_id}",
            json={
                "name": "Asset renamed",
                "request_reason": "Review Asset cascade rename",
            },
        )


async def _proposal(db: AsyncSession, approval_id: int) -> GovernedMutationProposal:
    return (
        await db.scalars(
            select(GovernedMutationProposal)
            .options(selectinload(GovernedMutationProposal.approval_request))
            .where(GovernedMutationProposal.approval_request_id == approval_id)
        )
    ).one()


async def _locks(
    db: AsyncSession, approval_id: int
) -> list[GovernedMutationImpactLock]:
    return list(
        await db.scalars(
            select(GovernedMutationImpactLock)
            .join(GovernedMutationProposal)
            .where(GovernedMutationProposal.approval_request_id == approval_id)
            .order_by(
                GovernedMutationImpactLock.resource_type,
                GovernedMutationImpactLock.resource_id,
            )
        )
    )


async def _event_counts(db: AsyncSession, approval_id: int) -> Counter[str]:
    """Assert event multiplicity without treating random UUID4 ids as a sequence."""
    return Counter(
        await db.scalars(
            select(OutboxEvent.event_type).where(
                OutboxEvent.aggregate_type == "approval_request",
                OutboxEvent.aggregate_id == approval_id,
            )
        )
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("action", ["edit", "archive"])
@pytest.mark.parametrize(
    ("asset_enabled", "vendor_enabled"),
    [(True, False), (True, True), (False, False)],
    ids=["mixed", "both_enabled", "both_disabled"],
)
async def test_asset_point_cascade_policy_matrix(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    action: str,
    asset_enabled: bool,
    vendor_enabled: bool,
) -> None:
    asset, vendor = await _linked_asset(
        db_session,
        test_user_cro,
        asset_enabled=asset_enabled,
        vendor_enabled=vendor_enabled,
    )
    submitted = await _submit(client_factory, test_user_cro, asset.id, action)
    assert submitted.status_code == (
        202 if asset_enabled else 204 if action == "archive" else 200
    ), submitted.text
    if asset_enabled:
        await db_session.refresh(asset)
        await db_session.refresh(vendor)
        assert (
            asset.name,
            asset.is_archived,
            asset.governance_version,
            vendor.governance_version,
        ) == ("Asset cascade", False, 7, 13)
        approval_id = submitted.json()["approval_id"]
        proposal = await _proposal(db_session, approval_id)
        assert valid_asset_governed_envelope(proposal)
        assert proposal.base_versions == {"asset": 7, f"vendor:{vendor.id}": 13}
        assert set(proposal.derived_impact_snapshot) == {"assets", "vendors"}
        assert [
            item["resource_type"] for item in proposal.impacted_resources_snapshot
        ] == ["asset", "vendor"]
        assert proposal.proposed_changes.get(
            "triggered_scenarios", ["protected_asset_edit"]
        ) == (
            ["protected_asset_edit", "protected_vendor_edit"]
            if vendor_enabled
            else ["protected_asset_edit"]
        )
        locks = await _locks(db_session, approval_id)
        assert [
            (lock.resource_type, lock.resource_id, lock.base_governance_version)
            for lock in locks
        ] == [("asset", asset.id, 7), ("vendor", vendor.id, 13)]
        assert all(lock.released_at is None for lock in locks)
        async with client_factory(user=test_user_cro) as requester:
            requester_detail = await requester.get(f"/api/v1/approvals/{approval_id}")
            asset_detail = await requester.get(f"/api/v1/assets/{asset.id}")
            vendor_detail = await requester.get(f"/api/v1/vendors/{vendor.id}")
            blocked_vendor = await requester.patch(
                f"/api/v1/vendors/{vendor.id}",
                json={"description": "Overlapping Vendor change"},
            )
        async with client_factory(user=test_user_risk_manager) as approver:
            detail = await approver.get(f"/api/v1/approvals/{approval_id}")
            resolved = await approver.post(
                f"/api/v1/approvals/{approval_id}/approve",
                json={"resolution_notes": "Apply captured Asset cascade"},
            )
            replay = await approver.post(
                f"/api/v1/approvals/{approval_id}/approve",
                json={"resolution_notes": "Duplicate resolution"},
            )
        assert detail.status_code == 200, detail.text
        assert detail.json()["can_approve"] is True
        assert (
            detail.json()["governed_mutation"]["derived_impact"]["vendors"][0][
                "resource_name"
            ]
            == "Restricted Vendor"
        )
        assert requester_detail.status_code == 200, requester_detail.text
        assert requester_detail.json()["governed_mutation"]["derived_impact"][
            "vendors"
        ] == [
            {
                "resource_name": "Downstream Vendor",
                "before": proposal.derived_impact_snapshot["vendors"][0]["before"],
                "after": proposal.derived_impact_snapshot["vendors"][0]["after"],
            }
        ]
        assert asset_detail.status_code == 200, asset_detail.text
        assert asset_detail.json()["capabilities"]["business_edit_blocked"] is True
        assert vendor_detail.status_code == 200, vendor_detail.text
        assert vendor_detail.json()["capabilities"]["has_pending_change"] is True
        assert vendor_detail.json()["capabilities"]["business_edit_blocked"] is True
        assert blocked_vendor.status_code == 409, blocked_vendor.text
        assert (
            asset_detail.json()["pending_change"]["capabilities"]["can_view_diff"]
            is True
        )
        assert resolved.status_code == 200, resolved.text
        assert resolved.json()["status"] == "approved", resolved.json()
        assert replay.status_code == 400, replay.text
        assert all(
            lock.released_at is not None and lock.release_reason == "approved"
            for lock in await _locks(db_session, approval_id)
        )
        assert await _event_counts(db_session, approval_id) == Counter(
            {"approval.request_created": 1, "approval.request_resolved": 1}
        )
        assert (
            await db_session.scalar(
                select(func.count())
                .select_from(ActivityLog)
                .where(
                    ActivityLog.entity_type == ActivityEntityType.APPROVAL,
                    ActivityLog.entity_id == approval_id,
                    ActivityLog.action == ActivityAction.APPROVE,
                )
            )
            == 1
        )
    else:
        assert (
            await db_session.scalar(
                select(func.count()).select_from(GovernedMutationProposal)
            )
            == 0
        )
        assert (
            await db_session.scalar(
                select(func.count()).select_from(GovernedMutationImpactLock)
            )
            == 0
        )
    await db_session.refresh(asset)
    await db_session.refresh(vendor)
    assert asset.name == ("Asset renamed" if action == "edit" else "Asset cascade")
    assert asset.is_archived is (action == "archive")
    assert (asset.governance_version, vendor.governance_version) == (
        8,
        14 if asset_enabled else 13,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("action", ["edit", "archive"])
@pytest.mark.parametrize(
    "drift", ["vendor_version", "requester_inactive", "asset_policy_disabled"]
)
async def test_mixed_asset_cascade_rechecks_versions_and_current_authority(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    action: str,
    drift: str,
) -> None:
    asset, vendor = await _linked_asset(db_session, test_user_cro)
    submitted = await _submit(client_factory, test_user_cro, asset.id, action)
    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    if drift == "vendor_version":
        vendor.governance_version += 1
    elif drift == "requester_inactive":
        test_user_cro.is_active = False
    else:
        scenario = await db_session.scalar(
            select(ApprovalScenario).where(
                ApprovalScenario.key == "protected_asset_edit"
            )
        )
        assert scenario is not None
        scenario.requires_approval = False
    await db_session.commit()
    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Recheck captured authority"},
        )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired", resolved.json()
    assert (
        resolved.json()["resolution_notes"]
        != "Governed Asset approval envelope is malformed"
    )
    await db_session.refresh(asset)
    await db_session.refresh(vendor)
    assert (asset.name, asset.is_archived, asset.governance_version) == (
        "Asset cascade",
        False,
        7,
    )
    assert vendor.governance_version == (14 if drift == "vendor_version" else 13)
    assert all(
        lock.released_at is not None and lock.release_reason == "expired"
        for lock in await _locks(db_session, approval_id)
    )
    assert await _event_counts(db_session, approval_id) == Counter(
        {"approval.request_created": 1, "approval.request_expired": 1}
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("action", ["edit", "archive"])
async def test_mixed_asset_cascade_strictly_rejects_incomplete_or_mismatched_impacts(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    action: str,
) -> None:
    asset, vendor = await _linked_asset(db_session, test_user_cro)
    submitted = await _submit(client_factory, test_user_cro, asset.id, action)
    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    proposal = await _proposal(db_session, approval_id)
    original = deepcopy(proposal.derived_impact_snapshot)
    assert valid_asset_governed_envelope(proposal)
    malformed_derived = [
        {
            "before": original["assets"][0]["before"],
            "after": original["assets"][0]["after"],
        },
        {**original, "vendors": []},
        {
            **original,
            "vendors": [{**original["vendors"][0], "resource_id": vendor.id + 1}],
        },
        {
            **original,
            "vendors": [{**original["vendors"][0], "after": {"tier": "unknown"}}],
        },
        {**original, "vendors": [{**original["vendors"][0], "after": {"tier": []}}]},
        {
            **original,
            "assets": [
                {
                    **original["assets"][0],
                    "before": {"cif": {}, "resulting_criticality": "high"},
                }
            ],
        },
        {**original, "extra": []},
    ]
    for malformed in malformed_derived:
        set_committed_value(proposal, "derived_impact_snapshot", malformed)
        assert valid_asset_governed_envelope(proposal) is False
    set_committed_value(proposal, "derived_impact_snapshot", original)
    original_impacts = deepcopy(proposal.impacted_resources_snapshot)
    for malformed_id in ({}, [], "1", True, 0, -1):
        impacts = deepcopy(original_impacts)
        impacts[1]["resource_id"] = malformed_id
        set_committed_value(proposal, "impacted_resources_snapshot", impacts)
        assert valid_asset_governed_envelope(proposal) is False
    impacts = deepcopy(original_impacts)
    impacts.append({**impacts[1], "resource_id": "2"})
    set_committed_value(proposal, "impacted_resources_snapshot", impacts)
    assert valid_asset_governed_envelope(proposal) is False
    impacts = deepcopy(original_impacts)
    impacts[0]["extra"] = True
    set_committed_value(proposal, "impacted_resources_snapshot", impacts)
    assert valid_asset_governed_envelope(proposal) is False
    set_committed_value(proposal, "impacted_resources_snapshot", original_impacts)
    assert valid_asset_governed_envelope(proposal)


@pytest.mark.asyncio
@pytest.mark.parametrize("action", ["edit", "archive"])
async def test_legacy_mixed_asset_cascade_expires_without_mutation(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    action: str,
) -> None:
    asset, vendor = await _linked_asset(db_session, test_user_cro)

    # The old mixed-policy producer omitted Vendor tier snapshots. Keep that
    # malformed persisted shape fail-closed. Arrange it before insertion to
    # preserve both ORM and PostgreSQL immutable-proposal protections.
    def legacy_derived_shape(_mapper, _connection, proposal) -> None:
        if proposal.mutation_kind in {"asset.edit", "asset.archive"}:
            asset_impact = proposal.derived_impact_snapshot["assets"][0]
            proposal.derived_impact_snapshot = {
                "before": asset_impact["before"],
                "after": asset_impact["after"],
            }

    event.listen(GovernedMutationProposal, "before_insert", legacy_derived_shape)
    try:
        submitted = await _submit(client_factory, test_user_cro, asset.id, action)
    finally:
        event.remove(GovernedMutationProposal, "before_insert", legacy_derived_shape)
    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Reject incomplete envelope"},
        )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    assert (
        resolved.json()["resolution_notes"]
        == "Governed Asset approval envelope is malformed"
    )
    await db_session.refresh(asset)
    await db_session.refresh(vendor)
    assert (
        asset.name,
        asset.is_archived,
        asset.governance_version,
        vendor.governance_version,
    ) == ("Asset cascade", False, 7, 13)
    assert all(
        lock.released_at is not None and lock.release_reason == "expired"
        for lock in await _locks(db_session, approval_id)
    )


@pytest.mark.postgres
@pytest.mark.asyncio
@pytest.mark.parametrize("action", ["edit", "archive"])
async def test_postgres_mixed_asset_cascade_rolls_back_all_effects(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    monkeypatch,
    test_user_cro: User,
    test_user_risk_manager: User,
    action: str,
) -> None:
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL transaction rollback is authoritative")
    asset, vendor = await _linked_asset(db_session, test_user_cro)
    submitted = await _submit(client_factory, test_user_cro, asset.id, action)
    assert submitted.status_code == 202, submitted.text
    approval_id, asset_id, vendor_id = (
        submitted.json()["approval_id"],
        asset.id,
        vendor.id,
    )
    reached_commit = False

    async def fail_before_commit() -> None:
        nonlocal reached_commit
        await db_session.flush()
        written_asset = await db_session.get(Asset, asset_id)
        written_vendor = await db_session.get(Vendor, vendor_id)
        written_approval = await db_session.get(ApprovalRequest, approval_id)
        assert (
            written_asset is not None
            and written_vendor is not None
            and written_approval is not None
        )
        assert written_asset.name == (
            "Asset renamed" if action == "edit" else "Asset cascade"
        )
        assert written_asset.is_archived is (action == "archive")
        assert (
            written_asset.governance_version,
            written_vendor.governance_version,
        ) == (8, 14)
        assert written_approval.status == ApprovalStatus.APPROVED
        assert all(
            lock.released_at is not None and lock.release_reason == "approved"
            for lock in await _locks(db_session, approval_id)
        )
        assert await _event_counts(db_session, approval_id) == Counter(
            {"approval.request_created": 1, "approval.request_resolved": 1}
        )
        assert (
            await db_session.scalar(
                select(func.count())
                .select_from(ActivityLog)
                .where(
                    ActivityLog.entity_type == ActivityEntityType.APPROVAL,
                    ActivityLog.entity_id == approval_id,
                    ActivityLog.action == ActivityAction.APPROVE,
                )
            )
            == 1
        )
        reached_commit = True
        raise RuntimeError("forced mixed cascade commit failure")

    monkeypatch.setattr(db_session, "commit", fail_before_commit)
    async with client_factory(
        user=test_user_risk_manager, raise_app_exceptions=False
    ) as approver:
        failed = await approver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Prove mixed cascade rollback"},
        )
    assert failed.status_code == 500, failed.text
    assert reached_commit
    restored_asset = await db_session.get(Asset, asset_id)
    restored_vendor = await db_session.get(Vendor, vendor_id)
    assert restored_asset is not None and restored_vendor is not None
    assert (
        restored_asset.name,
        restored_asset.is_archived,
        restored_asset.governance_version,
    ) == ("Asset cascade", False, 7)
    assert restored_vendor.governance_version == 13
    session_maker = async_sessionmaker(
        async_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_maker() as verification:
        persisted_asset = await verification.get(Asset, asset_id)
        persisted_vendor = await verification.get(Vendor, vendor_id)
        approval = await verification.get(ApprovalRequest, approval_id)
        assert (
            persisted_asset is not None
            and persisted_vendor is not None
            and approval is not None
        )
        assert (
            persisted_asset.name,
            persisted_asset.is_archived,
            persisted_asset.governance_version,
        ) == ("Asset cascade", False, 7)
        assert persisted_vendor.governance_version == 13
        assert approval.status == ApprovalStatus.PENDING
        locks = await _locks(verification, approval_id)
        assert [lock.resource_type for lock in locks] == ["asset", "vendor"]
        assert all(
            lock.released_at is None and lock.release_reason is None for lock in locks
        )
        assert await _event_counts(verification, approval_id) == Counter(
            {"approval.request_created": 1}
        )
        assert (
            await verification.scalar(
                select(func.count())
                .select_from(ActivityLog)
                .where(
                    ActivityLog.entity_type == ActivityEntityType.APPROVAL,
                    ActivityLog.entity_id == approval_id,
                    ActivityLog.action == ActivityAction.APPROVE,
                )
            )
            == 0
        )
