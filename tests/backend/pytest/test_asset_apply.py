"""Asset application behavior through the existing authenticated HTTP seam."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_redaction import REDACTED_VALUE
from app.models import (
    ActivityLog,
    ApprovalScenario,
    Asset,
    AssetVendorLink,
    Department,
    Process,
    ProcessAssetLink,
    User,
    Vendor,
)
from app.models.activity_log import ActivityAction, ActivityEntityType


@pytest.mark.asyncio
async def test_asset_accountability_edit_retains_all_audit_deltas(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_employee: User,
    test_user_risk_manager: User,
    test_department: Department,
) -> None:
    department = Department(name="Asset destination", code="NEW-AST")
    db_session.add_all([
        department,
        ApprovalScenario(
            key="accountability_reassignment",
            display_name="Accountability reassignments",
            description="Characterize direct Asset application",
            requires_approval=False,
            approver_roles=["risk_manager", "cro"],
        ),
    ])
    await db_session.flush()
    asset = Asset(
        name="Asset apply audit",
        business_owner_user_id=test_user_employee.id,
        ict_owner_user_id=test_user_employee.id,
        owning_department_id=test_department.id,
        governance_version=7,
    )
    db_session.add(asset)
    await db_session.commit()
    asset_id = asset.id
    async with client_factory(user=test_user_cro) as client:
        response = await client.patch(
            f"/api/v1/assets/{asset_id}",
            json={
                "business_owner_user_id": test_user_risk_manager.id,
                "ict_owner_user_id": test_user_cro.id,
                "owning_department_id": department.id,
            },
        )
    assert response.status_code == 200, response.text
    audit = await db_session.scalar(select(ActivityLog).where(
        ActivityLog.entity_type == ActivityEntityType.ASSET,
        ActivityLog.entity_id == asset_id,
        ActivityLog.action == ActivityAction.UPDATE,
    ))
    assert audit is not None
    assert audit.changes == {
        field: {"old": REDACTED_VALUE, "new": REDACTED_VALUE}
        for field in ("business_owner_user_id", "ict_owner_user_id", "owning_department_id")
    }
    assert audit.actor_id == test_user_cro.id
    assert audit.department_id == department.id
    persisted = await db_session.get(Asset, asset_id)
    assert persisted is not None
    assert persisted.governance_version == 8
    assert persisted.business_owner_user_id == test_user_risk_manager.id
    assert persisted.ict_owner_user_id == test_user_cro.id
    assert persisted.owning_department_id == department.id


async def _asset_cascade_case(db: AsyncSession, *, owner: User, approved: bool) -> tuple[Asset, Vendor]:
    for key in ("protected_asset_edit", "protected_vendor_edit"):
        db.add(ApprovalScenario(
            key=key, display_name=key, description="Characterize Asset cascade versions",
            requires_approval=approved,
            approver_roles=["risk_manager", "cro"],
        ))
    process = Process(
        f_code="F-ASSET-APPLY", l0_area="Operations", l1_process="Asset apply cascade",
        process_owner_user_id=owner.id, owning_department_id=owner.department_id, cif_override="yes",
    )
    asset = Asset(
        name="Asset apply cascade", business_owner_user_id=owner.id, ict_owner_user_id=owner.id,
        owning_department_id=owner.department_id, governance_version=7,
    )
    vendor = Vendor(
        name="Asset apply downstream Vendor", process="Operations", outsourcing_owner_user_id=owner.id,
        department_id=owner.department_id, replaceability="easily_substitutable", governance_version=13,
    )
    db.add_all([process, asset, vendor])
    await db.flush()
    db.add_all([
        ProcessAssetLink(process_id=process.id, asset_id=asset.id, is_primary=True),
        AssetVendorLink(asset_id=asset.id, vendor_id=vendor.id, ict_service_code="S01"),
    ])
    await db.commit()
    return asset, vendor


@pytest.mark.asyncio
@pytest.mark.parametrize("approved", [False, True], ids=["direct", "approved"])
async def test_asset_edit_keeps_entrypoint_specific_vendor_cascade(
    client_factory, db_session: AsyncSession, test_user_cro: User, test_user_risk_manager: User, approved: bool,
) -> None:
    asset, vendor = await _asset_cascade_case(db_session, owner=test_user_cro, approved=approved)
    async with client_factory(user=test_user_cro) as client:
        changed = await client.patch(
            f"/api/v1/assets/{asset.id}", json={"name": "Asset apply renamed", "request_reason": "Review rename"},
        )
    if approved:
        assert changed.status_code == 202, changed.text
        await db_session.refresh(asset)
        await db_session.refresh(vendor)
        assert asset.governance_version == 7 and vendor.governance_version == 13
        async with client_factory(user=test_user_risk_manager) as client:
            resolution = await client.post(
                f"/api/v1/approvals/{changed.json()['approval_id']}/approve",
                json={"resolution_notes": "Apply captured Asset cascade"},
            )
        assert resolution.status_code == 200, resolution.text
        assert resolution.json()["status"] == "approved", resolution.text
    else:
        assert changed.status_code == 200, changed.text
    await db_session.refresh(asset)
    await db_session.refresh(vendor)
    assert asset.name == "Asset apply renamed" and asset.governance_version == 8
    assert vendor.governance_version == (14 if approved else 13)


@pytest.mark.asyncio
async def test_asset_edit_commit_failure_rolls_back_state_and_audit(
    client_factory, db_session: AsyncSession, test_user_cro: User, monkeypatch: pytest.MonkeyPatch,
) -> None:
    asset, vendor = await _asset_cascade_case(db_session, owner=test_user_cro, approved=False)
    asset_id, vendor_id, actor_id = asset.id, vendor.id, test_user_cro.id
    original_audits = list((await db_session.scalars(select(ActivityLog.id))).all())

    async def failed_commit() -> None:
        await db_session.flush()
        raise RuntimeError("Injected Asset completion failure")

    monkeypatch.setattr(db_session, "commit", failed_commit)
    async with client_factory(headers={"X-Mock-User-Id": str(actor_id)}, raise_app_exceptions=False) as client:
        failed = await client.patch(f"/api/v1/assets/{asset_id}", json={"name": "Asset rejected commit"})
    assert failed.status_code == 500, failed.text
    persisted = await db_session.get(Asset, asset_id)
    persisted_vendor = await db_session.get(Vendor, vendor_id)
    assert persisted is not None and persisted_vendor is not None
    assert persisted.name == "Asset apply cascade" and persisted.governance_version == 7
    assert persisted_vendor.governance_version == 13
    assert list((await db_session.scalars(select(ActivityLog.id))).all()) == original_audits


@pytest.mark.asyncio
async def test_asset_denied_actor_preserves_state_and_versions(
    client_factory, db_session: AsyncSession, test_user_cro: User, test_user_employee: User,
) -> None:
    asset, vendor = await _asset_cascade_case(db_session, owner=test_user_cro, approved=False)
    async with client_factory(user=test_user_employee) as client:
        denied = await client.patch(f"/api/v1/assets/{asset.id}", json={"name": "Unauthorized Asset rename"})
    assert denied.status_code == 403, denied.text
    await db_session.refresh(asset)
    await db_session.refresh(vendor)
    assert asset.name == "Asset apply cascade" and asset.governance_version == 7
    assert vendor.governance_version == 13
