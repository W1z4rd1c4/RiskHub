from __future__ import annotations

import json

import pytest
from sqlalchemy import select

from app.models import (
    ApprovalRequest,
    ApprovalScenario,
    Asset,
    AssetVendorLink,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    Process,
    ProcessAssetLink,
    ProcessVendorLink,
    Vendor,
)
from app.schemas.asset import AssetUpdate
from app.schemas.vendor import VendorUpdate
from app.services._governed_mutations.asset_mutations import (
    submit_asset_archive_if_required,
    submit_asset_edit_if_required,
    submit_asset_link_mutation_if_required,
)
from app.services._governed_mutations.asset_resolution import approve_asset_mutation
from app.services._governed_mutations.process_mutations import (
    submit_process_archive_if_required,
    submit_process_relationship_mutation,
)
from app.services._governed_mutations.process_relationships import (
    process_impact_resource,
)
from app.services._governed_mutations.process_updates import (
    submit_process_mutation_if_required,
)
from app.services._governed_mutations.resolution import approve_governed_mutation
from app.services._governed_mutations.resolution_extensions import (
    approve_extended_process_mutation,
)
from app.services._governed_mutations.vendor_impact import (
    existing_vendor_impacts,
    process_point_vendor_impacts,
)

pytestmark = pytest.mark.asyncio


def _vendor(*, owner_id: int, department_id: int, name: str) -> Vendor:
    return Vendor(
        name=name,
        process="Operations",
        outsourcing_owner_user_id=owner_id,
        department_id=department_id,
        replaceability="easily_substitutable",
    )


async def test_vendor_edit_impact_uses_authoritative_current_and_proposed_tier(
    db_session,
    test_user_cro,
) -> None:
    vendor = _vendor(
        owner_id=test_user_cro.id,
        department_id=test_user_cro.department_id,
        name="Tier transition vendor",
    )
    db_session.add(vendor)
    await db_session.commit()

    before, after = await existing_vendor_impacts(
        db_session,
        vendor=vendor,
        updates=VendorUpdate(replaceability="not_substitutable").model_dump(
            exclude_unset=True,
        ),
    )

    assert before == {"tier": "standard"}
    assert after == {"tier": "significant"}


async def test_process_change_reports_every_downstream_protected_vendor_consequence(
    db_session,
    test_user_cro,
) -> None:
    process = Process(
        f_code="F-VENDOR-CASCADE",
        l0_area="Operations",
        l1_process="Vendor cascade",
        process_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        cif_override="no",
    )
    asset = Asset(
        name="Vendor cascade asset",
        business_owner_user_id=test_user_cro.id,
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
    )
    vendor_a = _vendor(
        owner_id=test_user_cro.id,
        department_id=test_user_cro.department_id,
        name="Cascade vendor A",
    )
    vendor_b = _vendor(
        owner_id=test_user_cro.id,
        department_id=test_user_cro.department_id,
        name="Cascade vendor B",
    )
    db_session.add_all([process, asset, vendor_a, vendor_b])
    await db_session.flush()
    db_session.add(
        ProcessAssetLink(
            process_id=process.id,
            asset_id=asset.id,
            significance="Kritická podpora procesu",
            spof="yes",
            is_primary=True,
        )
    )
    db_session.add_all(
        [
            AssetVendorLink(
                asset_id=asset.id,
                vendor_id=vendor_a.id,
                ict_service_code="S01",
            ),
            AssetVendorLink(
                asset_id=asset.id,
                vendor_id=vendor_b.id,
                ict_service_code="S01",
            ),
        ]
    )
    await db_session.commit()

    vendors, impacts = await process_point_vendor_impacts(
        db_session,
        process=process,
        updates={"cif_override": "yes"},
    )

    assert [vendor.id for vendor in vendors] == [vendor_a.id, vendor_b.id]
    assert impacts == [
        {
            "resource_id": vendor_a.id,
            "before": {"tier": "standard"},
            "after": {"tier": "critical"},
        },
        {
            "resource_id": vendor_b.id,
            "before": {"tier": "standard"},
            "after": {"tier": "critical"},
        },
    ]


async def test_process_edit_queues_vendor_scenario_and_locks_complete_cascade(
    db_session,
    client_factory,
    test_user_cro,
    test_user_risk_manager,
) -> None:
    db_session.add_all(
        [
            ApprovalScenario(
                key="protected_process_edit",
                display_name="Protected Process mutation",
                description="Independent Process approval",
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
            ),
            ApprovalScenario(
                key="protected_asset_edit",
                display_name="Protected Asset mutation",
                description="Independent Asset approval",
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
            ),
            ApprovalScenario(
                key="protected_vendor_edit",
                display_name="Protected Vendor mutation",
                description="Independent Vendor approval",
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
            ),
        ]
    )
    process = Process(
        f_code="F-VENDOR-QUEUE",
        l0_area="Operations",
        l1_process="Vendor queue cascade",
        process_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        cif_override="no",
    )
    asset = Asset(
        name="Vendor queue asset",
        business_owner_user_id=test_user_cro.id,
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
    )
    vendor = _vendor(
        owner_id=test_user_cro.id,
        department_id=test_user_cro.department_id,
        name="Vendor queue target",
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
            AssetVendorLink(
                asset_id=asset.id,
                vendor_id=vendor.id,
                ict_service_code="S01",
            ),
        ]
    )
    await db_session.commit()

    response = await submit_process_mutation_if_required(
        db=db_session,
        process=process,
        updates={"cif_override": "yes"},
        request_reason="Review the full Process to Vendor consequence",
        current_user=test_user_cro,
    )

    assert response is not None and response.status_code == 202
    approval_id = json.loads(response.body)["approval_id"]
    approval = (
        await db_session.execute(
            select(ApprovalRequest)
            .where(ApprovalRequest.id == approval_id)
        )
    ).scalar_one_or_none()
    assert approval is not None
    proposal = (
        await db_session.execute(
            select(GovernedMutationProposal).where(
                GovernedMutationProposal.approval_request_id == approval.id,
            )
        )
    ).scalar_one()
    locks = list(
        (
            await db_session.execute(
                select(GovernedMutationImpactLock)
                .where(GovernedMutationImpactLock.proposal_id == proposal.id)
                .order_by(
                    GovernedMutationImpactLock.resource_type,
                    GovernedMutationImpactLock.resource_id,
                )
            )
        ).scalars()
    )
    assert proposal.proposed_changes["triggered_scenarios"] == [
        "protected_process_edit",
        "protected_asset_edit",
        "protected_vendor_edit",
    ]
    assert proposal.derived_impact_snapshot["vendors"] == [
        {
            "resource_id": vendor.id,
            "before": {"tier": "standard"},
            "after": {"tier": "critical"},
        }
    ]
    assert [
        (lock.resource_type, lock.resource_id)
        for lock in locks
    ] == [
        ("asset", asset.id),
        ("process", process.id),
        ("vendor", vendor.id),
    ]
    async with client_factory(user=test_user_cro) as requester:
        detail = await requester.get(f"/api/v1/approvals/{approval_id}")
        vendor_collection = await requester.get("/api/v1/vendors?limit=100")
        vendor_detail = await requester.get(f"/api/v1/vendors/{vendor.id}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["governed_mutation"]["derived_impact"]["vendors"] == [
        {
            "resource_name": "Vendor queue target",
            "before": {"tier": "standard"},
            "after": {"tier": "critical"},
        }
    ]
    listed_vendor = next(
        item
        for item in vendor_collection.json()["items"]
        if item["id"] == vendor.id
    )
    assert listed_vendor["capabilities"]["has_pending_change"] is True
    assert listed_vendor["capabilities"]["business_edit_blocked"] is True
    assert vendor_detail.status_code == 200, vendor_detail.text
    pending_banner = vendor_detail.json()["pending_change"]
    assert pending_banner["generic_label"] == "protected_vendor_change"
    assert pending_banner["approval_id"] is None
    assert pending_banner["mutation_kind"] is None
    assert pending_banner["before"] == {}
    assert pending_banner["after"] == {}
    assert pending_banner["derived_impact"] == {}
    assert pending_banner["capabilities"] == {
        "can_view_diff": False,
        "can_cancel": False,
    }

    resolved = await approve_governed_mutation(
        db_session,
        approval_id=approval.id,
        current_user=test_user_risk_manager,
        resolution_notes="Approve the complete cascade",
    )

    await db_session.refresh(process)
    await db_session.refresh(asset)
    await db_session.refresh(vendor)
    active_locks = list(
        (
            await db_session.execute(
                select(GovernedMutationImpactLock).where(
                    GovernedMutationImpactLock.proposal_id == proposal.id,
                    GovernedMutationImpactLock.released_at.is_(None),
                )
            )
        ).scalars()
    )
    assert resolved.status.value == "APPROVED", resolved.resolution_notes
    assert process.cif_override == "yes"
    assert process.governance_version == 2
    assert asset.governance_version == 2
    assert vendor.governance_version == 2
    assert active_locks == []


async def test_process_archive_keeps_downstream_vendor_in_one_atomic_proposal(
    db_session,
    test_user_cro,
    test_user_risk_manager,
) -> None:
    db_session.add_all(
        [
            ApprovalScenario(
                key="protected_process_edit",
                display_name="Protected Process mutation",
                description="Independent Process approval",
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
            ),
            ApprovalScenario(
                key="protected_asset_edit",
                display_name="Protected Asset mutation",
                description="Independent Asset approval",
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
            ),
            ApprovalScenario(
                key="protected_vendor_edit",
                display_name="Protected Vendor mutation",
                description="Independent Vendor approval",
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
            ),
        ]
    )
    process = Process(
        f_code="F-VENDOR-ARCHIVE",
        l0_area="Operations",
        l1_process="Vendor archive cascade",
        process_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        cif_override="yes",
    )
    asset = Asset(
        name="Vendor archive asset",
        business_owner_user_id=test_user_cro.id,
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
    )
    vendor = _vendor(
        owner_id=test_user_cro.id,
        department_id=test_user_cro.department_id,
        name="Vendor archive target",
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
            AssetVendorLink(
                asset_id=asset.id,
                vendor_id=vendor.id,
                ict_service_code="S01",
            ),
        ]
    )
    await db_session.commit()

    response = await submit_process_archive_if_required(
        db=db_session,
        process=process,
        request_reason="Review the complete archive cascade",
        current_user=test_user_cro,
    )

    assert response is not None and response.status_code == 202
    approval_id = json.loads(response.body)["approval_id"]
    proposal = (
        await db_session.execute(
            select(GovernedMutationProposal).where(
                GovernedMutationProposal.approval_request_id == approval_id,
            )
        )
    ).scalar_one()
    assert proposal.proposed_changes["triggered_scenarios"] == [
        "protected_process_edit",
        "protected_asset_edit",
        "protected_vendor_edit",
    ]
    assert proposal.derived_impact_snapshot["vendors"] == [
        {
            "resource_id": vendor.id,
            "before": {"tier": "critical"},
            "after": {"tier": "standard"},
        }
    ]
    assert [
        (item["resource_type"], item["resource_id"])
        for item in proposal.impacted_resources_snapshot
    ] == [
        ("asset", asset.id),
        ("vendor", vendor.id),
        ("process", process.id),
    ]

    resolved = await approve_extended_process_mutation(
        db_session,
        approval_id=approval_id,
        current_user=test_user_risk_manager,
        resolution_notes="Approve complete archive cascade",
    )

    await db_session.refresh(process)
    await db_session.refresh(asset)
    await db_session.refresh(vendor)
    assert resolved.status.value == "APPROVED"
    assert process.is_archived is True
    assert asset.governance_version == 2
    assert vendor.governance_version == 2


async def test_process_vendor_link_is_one_composite_vendor_mutation(
    db_session,
    test_user_cro,
    test_user_risk_manager,
) -> None:
    db_session.add_all(
        [
            ApprovalScenario(
                key="protected_process_edit",
                display_name="Protected Process mutation",
                description="Independent Process approval",
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
            ),
            ApprovalScenario(
                key="protected_vendor_edit",
                display_name="Protected Vendor mutation",
                description="Independent Vendor approval",
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
            ),
        ]
    )
    process = Process(
        f_code="F-VENDOR-LINK",
        l0_area="Operations",
        l1_process="Vendor link cascade",
        process_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        cif_override="yes",
    )
    vendor = _vendor(
        owner_id=test_user_cro.id,
        department_id=test_user_cro.department_id,
        name="Vendor link target",
    )
    db_session.add_all([process, vendor])
    await db_session.commit()
    operation = {
        "relationship_type": "vendor",
        "action": "add",
        "kind": "process.link.vendor.add",
        "process_id": process.id,
        "related_resource_id": vendor.id,
        "related_resource_name": vendor.name,
        "before": {},
        "after": {
            "direct_service_description": "Critical service",
            "note": None,
        },
    }

    response = await submit_process_relationship_mutation(
        db=db_session,
        process=process,
        mutation_kind="process.link.vendor.add",
        operation=operation,
        request_reason="Review the Vendor tier consequence",
        current_user=test_user_cro,
        impacted_resources=[process_impact_resource(process)],
    )

    assert response is not None and response.status_code == 202
    approval_id = json.loads(response.body)["approval_id"]
    proposal = (
        await db_session.execute(
            select(GovernedMutationProposal).where(
                GovernedMutationProposal.approval_request_id == approval_id,
            )
        )
    ).scalar_one()
    assert proposal.proposed_changes["triggered_scenarios"] == [
        "protected_process_edit",
        "protected_vendor_edit",
    ]
    assert proposal.derived_impact_snapshot["vendors"] == [
        {
            "resource_id": vendor.id,
            "before": {"tier": "standard"},
            "after": {"tier": "critical"},
        }
    ]

    resolved = await approve_extended_process_mutation(
        db_session,
        approval_id=approval_id,
        current_user=test_user_risk_manager,
        resolution_notes="Approve the composite link",
    )

    link = (
        await db_session.execute(
            select(ProcessVendorLink).where(
                ProcessVendorLink.process_id == process.id,
                ProcessVendorLink.vendor_id == vendor.id,
            )
        )
    ).scalar_one_or_none()
    await db_session.refresh(process)
    await db_session.refresh(vendor)
    assert resolved.status.value == "APPROVED", resolved.resolution_notes
    assert link is not None
    assert process.governance_version == 2
    assert vendor.governance_version == 2


async def test_asset_edit_is_one_atomic_asset_to_vendor_composite(
    db_session,
    client_factory,
    test_user_cro,
    test_user_risk_manager,
) -> None:
    db_session.add_all(
        [
            ApprovalScenario(
                key="protected_asset_edit",
                display_name="Protected Asset mutation",
                description="Independent Asset approval",
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
            ),
            ApprovalScenario(
                key="protected_vendor_edit",
                display_name="Protected Vendor mutation",
                description="Independent Vendor approval",
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
            ),
        ]
    )
    asset = Asset(
        name="Asset to Vendor composite",
        business_owner_user_id=test_user_cro.id,
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        preliminary_criticality="low",
    )
    vendor = _vendor(
        owner_id=test_user_cro.id,
        department_id=test_user_cro.department_id,
        name="Asset-derived Vendor",
    )
    db_session.add_all([asset, vendor])
    await db_session.flush()
    db_session.add(
        AssetVendorLink(
            asset_id=asset.id,
            vendor_id=vendor.id,
            ict_service_code="S01",
        )
    )
    await db_session.commit()
    payload = AssetUpdate(
        preliminary_criticality="critical",
        request_reason="Review the Asset to Vendor consequence",
    )
    updates = payload.model_dump(exclude_unset=True, exclude={"request_reason"})

    response = await submit_asset_edit_if_required(
        db=db_session,
        asset=asset,
        payload=payload,
        current_user=test_user_cro,
        updates=updates,
    )

    assert response is not None and response.status_code == 202
    approval_id = json.loads(response.body)["approval_id"]
    proposal = (
        await db_session.execute(
            select(GovernedMutationProposal).where(
                GovernedMutationProposal.approval_request_id == approval_id,
            )
        )
    ).scalar_one()
    assert proposal.proposed_changes["triggered_scenarios"] == [
        "protected_asset_edit",
        "protected_vendor_edit",
    ]
    assert proposal.derived_impact_snapshot["vendors"] == [
        {
            "resource_id": vendor.id,
            "before": {"tier": "standard"},
            "after": {"tier": "significant"},
        }
    ]
    async with client_factory(user=test_user_cro) as requester:
        detail = await requester.get(f"/api/v1/approvals/{approval_id}")
        vendor_collection = await requester.get("/api/v1/vendors?limit=100")
        vendor_detail = await requester.get(f"/api/v1/vendors/{vendor.id}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["governed_mutation"]["derived_impact"]["vendors"] == [
        {
            "resource_name": "Asset-derived Vendor",
            "before": {"tier": "standard"},
            "after": {"tier": "significant"},
        }
    ]
    listed_vendor = next(
        item
        for item in vendor_collection.json()["items"]
        if item["id"] == vendor.id
    )
    assert listed_vendor["capabilities"]["has_pending_change"] is True
    assert listed_vendor["capabilities"]["business_edit_blocked"] is True
    assert vendor_detail.status_code == 200, vendor_detail.text
    pending_banner = vendor_detail.json()["pending_change"]
    assert pending_banner["generic_label"] == "protected_vendor_change"
    assert pending_banner["approval_id"] is None
    assert pending_banner["mutation_kind"] is None
    assert pending_banner["before"] == {}
    assert pending_banner["after"] == {}
    assert pending_banner["derived_impact"] == {}
    assert pending_banner["capabilities"] == {
        "can_view_diff": False,
        "can_cancel": False,
    }

    resolved = await approve_asset_mutation(
        db_session,
        approval_id=approval_id,
        current_user=test_user_risk_manager,
        resolution_notes="Approve Asset to Vendor composite",
    )

    await db_session.refresh(asset)
    await db_session.refresh(vendor)
    assert resolved.status.value == "APPROVED", resolved.resolution_notes
    assert asset.preliminary_criticality == "critical"
    assert asset.governance_version == 2
    assert vendor.governance_version == 2


async def test_asset_archive_is_one_atomic_asset_to_vendor_composite(
    db_session,
    test_user_cro,
    test_user_risk_manager,
) -> None:
    db_session.add_all(
        [
            ApprovalScenario(
                key="protected_asset_edit",
                display_name="Protected Asset mutation",
                description="Independent Asset approval",
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
            ),
            ApprovalScenario(
                key="protected_vendor_edit",
                display_name="Protected Vendor mutation",
                description="Independent Vendor approval",
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
            ),
        ]
    )
    asset = Asset(
        name="Archived Asset to Vendor composite",
        business_owner_user_id=test_user_cro.id,
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        preliminary_criticality="critical",
    )
    vendor = _vendor(
        owner_id=test_user_cro.id,
        department_id=test_user_cro.department_id,
        name="Archive-derived Vendor",
    )
    db_session.add_all([asset, vendor])
    await db_session.flush()
    db_session.add(
        AssetVendorLink(
            asset_id=asset.id,
            vendor_id=vendor.id,
            ict_service_code="S01",
        )
    )
    await db_session.commit()

    response = await submit_asset_archive_if_required(
        db=db_session,
        asset=asset,
        current_user=test_user_cro,
        request_reason="Review Asset archive Vendor consequence",
    )

    assert response is not None and response.status_code == 202
    approval_id = json.loads(response.body)["approval_id"]
    proposal = (
        await db_session.execute(
            select(GovernedMutationProposal).where(
                GovernedMutationProposal.approval_request_id == approval_id,
            )
        )
    ).scalar_one()
    assert proposal.proposed_changes["triggered_scenarios"] == [
        "protected_asset_edit",
        "protected_vendor_edit",
    ]
    assert proposal.derived_impact_snapshot["vendors"] == [
        {
            "resource_id": vendor.id,
            "before": {"tier": "significant"},
            "after": {"tier": "standard"},
        }
    ]

    resolved = await approve_asset_mutation(
        db_session,
        approval_id=approval_id,
        current_user=test_user_risk_manager,
        resolution_notes="Approve Asset archive composite",
    )

    await db_session.refresh(asset)
    await db_session.refresh(vendor)
    assert resolved.status.value == "APPROVED", resolved.resolution_notes
    assert asset.is_archived is True
    assert asset.governance_version == 2
    assert vendor.governance_version == 2


async def test_asset_vendor_link_is_one_atomic_composite(
    db_session,
    test_user_cro,
    test_user_risk_manager,
) -> None:
    db_session.add_all(
        [
            ApprovalScenario(
                key="protected_asset_edit",
                display_name="Protected Asset mutation",
                description="Independent Asset approval",
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
            ),
            ApprovalScenario(
                key="protected_vendor_edit",
                display_name="Protected Vendor mutation",
                description="Independent Vendor approval",
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
            ),
        ]
    )
    asset = Asset(
        name="Asset Vendor link composite",
        business_owner_user_id=test_user_cro.id,
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        preliminary_criticality="critical",
    )
    vendor = _vendor(
        owner_id=test_user_cro.id,
        department_id=test_user_cro.department_id,
        name="Linked composite Vendor",
    )
    db_session.add_all([asset, vendor])
    await db_session.commit()
    operation = {
        "relationship_type": "vendor",
        "action": "add",
        "before": None,
        "after": {
            "asset_id": asset.id,
            "vendor_id": vendor.id,
            "vendor_role": None,
            "ict_service_code": "S01",
            "contract_reference": None,
            "reliance": None,
            "note": None,
        },
    }

    response = await submit_asset_link_mutation_if_required(
        db=db_session,
        asset=asset,
        impacted_assets=[asset],
        operation=operation,
        current_user=test_user_cro,
        request_reason="Review the Asset Vendor link consequence",
    )

    assert response is not None and response.status_code == 202
    approval_id = json.loads(response.body)["approval_id"]
    proposal = (
        await db_session.execute(
            select(GovernedMutationProposal).where(
                GovernedMutationProposal.approval_request_id == approval_id,
            )
        )
    ).scalar_one()
    assert proposal.proposed_changes["triggered_scenarios"] == [
        "protected_asset_edit",
        "protected_vendor_edit",
    ]
    assert proposal.derived_impact_snapshot["vendors"] == [
        {
            "resource_id": vendor.id,
            "before": {"tier": "standard"},
            "after": {"tier": "significant"},
        }
    ]

    resolved = await approve_asset_mutation(
        db_session,
        approval_id=approval_id,
        current_user=test_user_risk_manager,
        resolution_notes="Approve Asset Vendor link composite",
    )

    link = (
        await db_session.execute(
            select(AssetVendorLink).where(
                AssetVendorLink.asset_id == asset.id,
                AssetVendorLink.vendor_id == vendor.id,
            )
        )
    ).scalar_one_or_none()
    await db_session.refresh(asset)
    await db_session.refresh(vendor)
    assert resolved.status.value == "APPROVED", resolved.resolution_notes
    assert link is not None
    assert asset.governance_version == 2
    assert vendor.governance_version == 2
