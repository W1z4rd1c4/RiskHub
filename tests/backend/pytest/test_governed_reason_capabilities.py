"""HTTP advisory reason capabilities use current classification and live policy (#247)."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ApprovalRequest,
    ApprovalScenario,
    Asset,
    Department,
    Permission,
    Process,
    ProcessAssetLink,
    ProcessVendorLink,
    RolePermission,
    User,
    Vendor,
)


async def _grant_reads(db_session: AsyncSession, owner: User, resources: tuple[str, ...]):
    for resource in resources:
        permission = await db_session.scalar(
            select(Permission).where(Permission.resource == resource, Permission.action == "read")
        )
        if permission is None:
            permission = Permission(resource=resource, action="read", description="Read capability fixture")
            db_session.add(permission)
            await db_session.flush()
        if not any(link.permission_id == permission.id for link in owner.role.permissions):
            link = RolePermission(role_id=owner.role_id, permission_id=permission.id)
            link.permission = permission
            db_session.add(link)
            owner.role.permissions.append(link)


@pytest.mark.asyncio
@pytest.mark.parametrize("family", ["process", "asset", "vendor"])
@pytest.mark.parametrize("enabled", [False, True])
@pytest.mark.parametrize("protected", [False, True])
async def test_reason_capability_is_enabled_and_currently_protected(
    client_factory,
    db_session: AsyncSession,
    test_user_risk_manager: User,
    family: str,
    enabled: bool,
    protected: bool,
):
    owner = test_user_risk_manager
    await _grant_reads(db_session, owner, ("assets", "processes", "vendors", "vendor_contracts"))
    key = f"protected_{family}_edit"
    policy = await db_session.scalar(select(ApprovalScenario).where(ApprovalScenario.key == key))
    if policy is None:
        policy = ApprovalScenario(key=key, display_name=key, description=key)
        db_session.add(policy)
    policy.requires_approval = enabled
    policy.approver_roles = ["risk_manager", "cro"]
    if family == "process":
        row = Process(
            f_code="F-CAPABILITY",
            l0_area="Operations",
            l1_process="Reason capability",
            process_owner_user_id=owner.id,
            owning_department_id=owner.department_id,
            cif_override="yes" if protected else "no",
        )
    elif family == "asset":
        row = Asset(
            name="Reason capability Asset",
            business_owner_user_id=owner.id,
            ict_owner_user_id=owner.id,
            owning_department_id=owner.department_id,
            preliminary_criticality="critical" if protected else "low",
        )
    else:
        row = Vendor(
            name="Reason capability Vendor",
            process="Operations",
            outsourcing_owner_user_id=owner.id,
            department_id=owner.department_id,
            replaceability="not_substitutable" if protected else "easily_substitutable",
        )
    db_session.add(row)
    await db_session.commit()
    models = (Process, Asset, Vendor, ApprovalRequest)
    before = [
        list((await db_session.execute(select(model.__table__).order_by(model.id))).mappings()) for model in models
    ]
    plural = "processes" if family == "process" else f"{family}s"
    async with client_factory(user=owner) as client:
        detail = await client.get(f"/api/v1/{plural}/{row.id}")
        collection = await client.get(f"/api/v1/{plural}")
    assert detail.status_code == 200, detail.text
    assert collection.status_code == 200, collection.text
    item = next(item for item in collection.json()["items"] if item["id"] == row.id)
    for source in (detail.json(), item):
        assert source["capabilities"]["protected_change_requires_approval"] is (enabled and protected)
    after = [
        list((await db_session.execute(select(model.__table__).order_by(model.id))).mappings()) for model in models
    ]
    assert after == before


@pytest.mark.asyncio
async def test_asset_reason_fact_uses_hidden_current_cif_without_exposing_context_or_granting_edit(
    client_factory,
    db_session: AsyncSession,
    test_user_employee: User,
    test_user_risk_manager: User,
    test_user_cro: User,
):
    reader, owner = test_user_employee, test_user_risk_manager
    await _grant_reads(db_session, reader, ("assets",))
    policy = ApprovalScenario(
        key="protected_asset_edit",
        display_name="Assets",
        description="Assets",
        requires_approval=True,
        approver_roles=["risk_manager", "cro"],
    )
    hidden_department = Department(name="Hidden capability context", code="HIDDEN-CAP")
    db_session.add(hidden_department)
    await db_session.flush()
    process = Process(
        f_code="F-HIDDEN",
        l0_area="Private",
        l1_process="Hidden protected Process",
        process_owner_user_id=owner.id,
        owning_department_id=hidden_department.id,
        cif_override="yes",
    )
    asset = Asset(
        name="Readable Asset",
        business_owner_user_id=owner.id,
        ict_owner_user_id=owner.id,
        owning_department_id=reader.department_id,
        preliminary_criticality="low",
    )
    db_session.add_all([policy, process, asset])
    await db_session.flush()
    db_session.add(ProcessAssetLink(process_id=process.id, asset_id=asset.id, is_primary=True))
    await db_session.commit()
    async with client_factory(user=reader) as client:
        hidden = await client.get(f"/api/v1/processes/{process.id}")
        detail = await client.get(f"/api/v1/assets/{asset.id}")
        listing = await client.get("/api/v1/assets")
    assert hidden.status_code in {403, 404}
    assert detail.status_code == 200, detail.text
    assert listing.status_code == 200, listing.text
    item = next(item for item in listing.json()["items"] if item["id"] == asset.id)
    for value in (detail.json(), item):
        assert value["capabilities"]["protected_change_requires_approval"] is True
        assert value["capabilities"]["can_update"] is False
        assert value["derived"]["cif"] == "no"
        assert value["derived"]["cif_process_names"] == []
        assert "Hidden protected Process" not in str(value)
    version = asset.governance_version
    async with client_factory(user=owner) as requester:
        queued = await requester.patch(
            f"/api/v1/assets/{asset.id}",
            json={"notes": "Proposed only", "request_reason": "Independent protected edit"},
        )
    assert queued.status_code == 202, queued.text
    await db_session.refresh(asset)
    assert asset.notes is None
    assert asset.governance_version == version
    async with client_factory(user=reader) as client:
        pending = await client.get(f"/api/v1/assets/{asset.id}")
    assert pending.status_code == 200, pending.text
    assert pending.json()["capabilities"]["has_pending_change"] is True
    assert pending.json()["capabilities"]["can_update"] is False
    assert pending.json()["capabilities"]["protected_change_requires_approval"] is True


@pytest.mark.asyncio
@pytest.mark.parametrize("tier", ["significant", "critical"])
@pytest.mark.parametrize("enabled", [False, True])
async def test_vendor_reason_fact_survives_redacted_derivation_and_matches_list(
    client_factory,
    db_session: AsyncSession,
    test_user_employee: User,
    test_user_risk_manager: User,
    tier: str,
    enabled: bool,
):
    reader, owner = test_user_employee, test_user_risk_manager
    await _grant_reads(db_session, reader, ("vendors",))
    policy = ApprovalScenario(
        key="protected_vendor_edit",
        display_name="Vendors",
        description="Vendors",
        requires_approval=enabled,
        approver_roles=["risk_manager", "cro"],
    )
    vendor = Vendor(
        name="Readable Vendor",
        process="Operations",
        outsourcing_owner_user_id=owner.id,
        department_id=reader.department_id,
        replaceability="not_substitutable",
    )
    db_session.add_all([policy, vendor])
    await db_session.flush()
    if tier == "critical":
        process = Process(
            f_code="F-PRIVATE-VENDOR",
            l0_area="Private",
            l1_process="Hidden Vendor Process",
            process_owner_user_id=owner.id,
            owning_department_id=owner.department_id,
            cif_override="yes",
        )
        db_session.add(process)
        await db_session.flush()
        db_session.add(ProcessVendorLink(process_id=process.id, vendor_id=vendor.id))
    await db_session.commit()
    from app.services._vendor_governance.projection import load_vendor_derived_blocks

    assert (await load_vendor_derived_blocks(db_session, [vendor]))[vendor.id].tier == tier
    async with client_factory(user=reader) as client:
        detail = await client.get(f"/api/v1/vendors/{vendor.id}")
        listing = await client.get("/api/v1/vendors")
    assert detail.status_code == 200, detail.text
    assert listing.status_code == 200, listing.text
    item = next(item for item in listing.json()["items"] if item["id"] == vendor.id)
    for value in (detail.json(), item):
        assert value["capabilities"]["protected_change_requires_approval"] is enabled
        assert value.get("derived") is None
        assert value["capabilities"]["can_update"] is False
        assert "Hidden Vendor Process" not in str(value)
