"""Process application behavior through its existing HTTP entry points."""

from __future__ import annotations

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_redaction import REDACTED_VALUE
from app.models import (
    ActivityLog,
    ApprovalRequest,
    ApprovalScenario,
    ApprovalStatus,
    Asset,
    AssetVendorLink,
    Department,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    Process,
    ProcessAssetLink,
    ProcessVendorLink,
    User,
    Vendor,
)
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.outbox_event import OutboxEvent


@pytest.mark.asyncio
async def test_process_accountability_edit_audits_both_changed_relationships(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
    test_department: Department,
) -> None:
    replacement_department = Department(name="New owning department", code="NEW-PROC")
    db_session.add_all(
        [
            replacement_department,
            ApprovalScenario(
                key="accountability_reassignment",
                display_name="Accountability reassignment",
                description="Characterize direct accountability application",
                requires_approval=False,
                approver_roles=["risk_manager", "cro"],
            ),
        ]
    )
    await db_session.flush()
    process = Process(
        f_code="F-APPLY-AUDIT",
        l0_area="Operations",
        l1_process="Relationship audit",
        process_owner_user_id=test_user_employee.id,
        owning_department_id=test_department.id,
        governance_version=7,
    )
    asset = Asset(name="Downstream audit asset", governance_version=11)
    db_session.add_all([process, asset])
    await db_session.flush()
    db_session.add(ProcessAssetLink(process_id=process.id, asset_id=asset.id))
    await db_session.commit()
    process_id = process.id
    asset_id = asset.id
    async with client_factory(user=test_user_cro) as client:
        response = await client.patch(
            f"/api/v1/processes/{process_id}",
            json={
                "process_owner_user_id": test_user_risk_manager.id,
                "owning_department_id": replacement_department.id,
            },
        )
    assert response.status_code == 200, response.text
    audit = await db_session.scalar(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.PROCESS,
            ActivityLog.entity_id == process_id,
            ActivityLog.action == ActivityAction.UPDATE,
        )
    )
    assert audit is not None
    # These identity fields intentionally retain only a redacted audit delta.
    assert audit.changes == {
        "process_owner_user_id": {"old": REDACTED_VALUE, "new": REDACTED_VALUE},
        "owning_department_id": {"old": REDACTED_VALUE, "new": REDACTED_VALUE},
    }
    assert audit.actor_id == test_user_cro.id
    assert audit.department_id == replacement_department.id
    persisted = await db_session.get(Process, process_id)
    persisted_asset = await db_session.get(Asset, asset_id)
    assert persisted is not None and persisted.governance_version == 8
    assert persisted.process_owner_user_id == test_user_risk_manager.id
    assert persisted.owning_department_id == replacement_department.id
    assert persisted_asset is not None and persisted_asset.governance_version == 12


@pytest.mark.asyncio
@pytest.mark.parametrize("approved", [False, True])
async def test_process_edit_retains_entrypoint_specific_vendor_versions(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
    approved: bool,
) -> None:
    for key in ("protected_process_edit", "protected_asset_edit", "protected_vendor_edit"):
        db_session.add(
            ApprovalScenario(
                key=key,
                display_name=key,
                description="Characterize Process cascade version rules",
                requires_approval=approved,
                approver_roles=["risk_manager", "cro"],
            )
        )
    process = Process(
        f_code="F-APPLY-CASCADE",
        l0_area="Operations",
        l1_process="Version cascade",
        process_owner_user_id=test_user_employee.id,
        owning_department_id=test_user_employee.department_id,
        cif_override="no",
        governance_version=7,
    )
    asset = Asset(
        name="Version cascade Asset",
        business_owner_user_id=test_user_employee.id,
        ict_owner_user_id=test_user_employee.id,
        owning_department_id=test_user_employee.department_id,
        governance_version=11,
    )
    vendor = Vendor(
        name="Version cascade Vendor",
        process="Operations",
        outsourcing_owner_user_id=test_user_employee.id,
        department_id=test_user_employee.department_id,
        replaceability="easily_substitutable",
        governance_version=13,
    )
    db_session.add_all([process, asset, vendor])
    await db_session.flush()
    db_session.add_all(
        [
            ProcessAssetLink(
                process_id=process.id,
                asset_id=asset.id,
                significance="Kritická podpora procesu",
                spof="yes",
                is_primary=True,
            ),
            AssetVendorLink(asset_id=asset.id, vendor_id=vendor.id, ict_service_code="S01"),
            ProcessVendorLink(process_id=process.id, vendor_id=vendor.id),
        ]
    )
    await db_session.commit()
    process_id, asset_id, vendor_id = process.id, asset.id, vendor.id
    async with client_factory(user=test_user_cro) as client:
        response = await client.patch(
            f"/api/v1/processes/{process_id}",
            json={"cif_override": "yes", "request_reason": "Review complete downstream consequence"},
        )
    assert response.status_code == (202 if approved else 200), response.text
    if approved:
        db_session.expire_all()
        pending_process = await db_session.get(Process, process_id)
        pending_asset = await db_session.get(Asset, asset_id)
        pending_vendor = await db_session.get(Vendor, vendor_id)
        assert pending_process is not None and pending_process.governance_version == 7
        assert pending_asset is not None and pending_asset.governance_version == 11
        assert pending_vendor is not None and pending_vendor.governance_version == 13
        approval_id = response.json()["approval_id"]
        await db_session.refresh(test_user_risk_manager)
        async with client_factory(user=test_user_risk_manager) as client:
            resolution = await client.post(
                f"/api/v1/approvals/{approval_id}/approve",
                json={"resolution_notes": "Approved complete cascade"},
            )
            duplicate = await client.post(
                f"/api/v1/approvals/{approval_id}/approve",
                json={"resolution_notes": "Duplicate resolution"},
            )
        assert resolution.status_code == 200, resolution.text
        assert duplicate.status_code == 400, duplicate.text
    db_session.expire_all()
    persisted_process = await db_session.get(Process, process_id)
    persisted_asset = await db_session.get(Asset, asset_id)
    persisted_vendor = await db_session.get(Vendor, vendor_id)
    assert persisted_process is not None and persisted_process.governance_version == 8
    assert persisted_asset is not None and persisted_asset.governance_version == 12
    # The Vendor is reachable by two paths and advances at most once.
    assert persisted_vendor is not None and persisted_vendor.governance_version == (14 if approved else 13)


@pytest.mark.asyncio
@pytest.mark.parametrize("approved", [False, True])
async def test_process_primary_swap_commit_failure_restores_complete_application(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
    monkeypatch: pytest.MonkeyPatch,
    approved: bool,
) -> None:
    for key in ("protected_process_edit", "protected_asset_edit", "protected_vendor_edit"):
        db_session.add(
            ApprovalScenario(
                key=key,
                display_name=key,
                description="Verify atomic primary Process application",
                requires_approval=approved,
                approver_roles=["risk_manager", "cro"],
            )
        )
    old_primary = Process(
        f_code="F-ROLLBACK-OLD",
        l0_area="Operations",
        l1_process="Old primary",
        process_owner_user_id=test_user_employee.id,
        owning_department_id=test_user_employee.department_id,
        cif_override="no",
        governance_version=7,
    )
    new_primary = Process(
        f_code="F-ROLLBACK-NEW",
        l0_area="Operations",
        l1_process="New primary",
        process_owner_user_id=test_user_employee.id,
        owning_department_id=test_user_employee.department_id,
        cif_override="yes",
        governance_version=9,
    )
    asset = Asset(
        name="Primary swap Asset",
        business_owner_user_id=test_user_employee.id,
        ict_owner_user_id=test_user_employee.id,
        owning_department_id=test_user_employee.department_id,
        governance_version=11,
    )
    vendor = Vendor(
        name="Primary swap Vendor",
        process="Operations",
        outsourcing_owner_user_id=test_user_employee.id,
        department_id=test_user_employee.department_id,
        replaceability="easily_substitutable",
        governance_version=13,
    )
    db_session.add_all([old_primary, new_primary, asset, vendor])
    await db_session.flush()
    old_link = ProcessAssetLink(
        process_id=old_primary.id,
        asset_id=asset.id,
        is_primary=True,
        significance="Kritická podpora procesu",
        spof="yes",
    )
    new_link = ProcessAssetLink(
        process_id=new_primary.id,
        asset_id=asset.id,
        is_primary=False,
        significance="Kritická podpora procesu",
        spof="yes",
    )
    db_session.add_all(
        [old_link, new_link, AssetVendorLink(asset_id=asset.id, vendor_id=vendor.id, ict_service_code="S01")]
    )
    await db_session.commit()
    old_id, new_id, asset_id, vendor_id = old_primary.id, new_primary.id, asset.id, vendor.id
    old_link_id, new_link_id = old_link.id, new_link.id
    requester_id, resolver_id = test_user_cro.id, test_user_risk_manager.id
    path = f"/api/v1/assets/{asset_id}/process-links/{new_id}"
    updates = {"is_primary": True, "request_reason": "Review primary Process replacement"}
    approval_id = None
    if approved:
        async with client_factory(headers={"X-Mock-User-Id": str(requester_id)}) as client:
            queued = await client.patch(path, json=updates)
        assert queued.status_code == 202, queued.text
        approval_id = queued.json()["approval_id"]
    audit_count = await db_session.scalar(select(func.count()).select_from(ActivityLog))
    outbox_count = await db_session.scalar(select(func.count()).select_from(OutboxEvent))
    reached_commit = False

    async def failed_commit() -> None:
        nonlocal reached_commit
        await db_session.flush()
        written_old = await db_session.get(ProcessAssetLink, old_link_id)
        written_new = await db_session.get(ProcessAssetLink, new_link_id)
        assert written_old is not None and written_old.is_primary is False
        assert written_new is not None and written_new.is_primary is True
        written_old_process = await db_session.get(Process, old_id)
        written_new_process = await db_session.get(Process, new_id)
        written_asset = await db_session.get(Asset, asset_id)
        written_vendor = await db_session.get(Vendor, vendor_id)
        assert written_old_process is not None and written_old_process.governance_version == 8
        assert written_new_process is not None and written_new_process.governance_version == 10
        assert written_asset is not None and written_asset.governance_version == 12
        assert written_vendor is not None and written_vendor.governance_version == (14 if approved else 13)
        reached_commit = True
        raise RuntimeError("Injected Process primary swap commit failure")

    monkeypatch.setattr(db_session, "commit", failed_commit)
    actor_id = resolver_id if approved else requester_id
    async with client_factory(headers={"X-Mock-User-Id": str(actor_id)}, raise_app_exceptions=False) as client:
        if approved:
            failed = await client.post(
                f"/api/v1/approvals/{approval_id}/approve",
                json={"resolution_notes": "Would otherwise apply atomically"},
            )
        else:
            failed = await client.patch(path, json=updates)
    assert failed.status_code == 500, failed.text
    assert reached_commit
    restored_old_link = await db_session.get(ProcessAssetLink, old_link_id)
    restored_new_link = await db_session.get(ProcessAssetLink, new_link_id)
    assert restored_old_link is not None and restored_old_link.is_primary is True
    assert restored_new_link is not None and restored_new_link.is_primary is False
    restored_old = await db_session.get(Process, old_id)
    restored_new = await db_session.get(Process, new_id)
    restored_asset = await db_session.get(Asset, asset_id)
    restored_vendor = await db_session.get(Vendor, vendor_id)
    assert restored_old is not None and restored_old.governance_version == 7
    assert restored_new is not None and restored_new.governance_version == 9
    assert restored_asset is not None and restored_asset.governance_version == 11
    assert restored_vendor is not None and restored_vendor.governance_version == 13
    assert await db_session.scalar(select(func.count()).select_from(ActivityLog)) == audit_count
    assert await db_session.scalar(select(func.count()).select_from(OutboxEvent)) == outbox_count
    if approved:
        pending = await db_session.get(ApprovalRequest, approval_id)
        assert pending is not None and pending.status == ApprovalStatus.PENDING
        assert pending.resolved_at is None and pending.resolved_by_id is None
        locks = (
            await db_session.scalars(
                select(GovernedMutationImpactLock)
                .join(GovernedMutationProposal)
                .where(GovernedMutationProposal.approval_request_id == approval_id)
            )
        ).all()
        assert locks and all(lock.released_at is None for lock in locks)
