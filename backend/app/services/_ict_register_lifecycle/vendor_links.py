"""Asset<->Vendor and Process<->Vendor Link relations (issue #46).

The remaining manual link sheets of the register graph: sheet 10_VAD types
each Asset->Vendor dependency by an ICT service S-code (the identity tuple is
asset + vendor + S-code), sheet 11 §1 holds the manual Process->Vendor pairs
(the §2 transitive expansion stays derived-only, engine-side). Links are
managed from the register end — mutations require canonical row update
authority for that active, non-orphan Asset or Process — and readable from all
three ends under canonical register-row policy plus independent Vendor
visibility (#43 dual-permission precedent).
Archived-end stance is STRICT per #43: mutating from an archived register
end, or linking TO an archived target, conflicts (409); unlinking an
archived TARGET from an active register end stays possible.
"""

from __future__ import annotations

from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import asset as audit_asset
from app.core.audit import process as audit_process
from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.core.permissions import can_read_vendor, visible_vendor_ids
from app.core.security import check_permission
from app.models import Asset, AssetVendorLink, Process, ProcessVendorLink, User, Vendor
from app.schemas.asset import AssetVendorLinkCreate, AssetVendorLinkRead
from app.schemas.process import ProcessVendorLinkCreate, ProcessVendorLinkRead
from app.services._authorization_capabilities import (
    asset_vendor_link_capabilities,
    process_vendor_link_capabilities,
)
from app.services._governed_mutations.process_mutations import (
    submit_process_relationship_mutation,
)
from app.services._governed_mutations.process_relationships import process_impact_resource
from app.services._governed_mutations.process_updates import (
    active_governed_process_mutation_ids,
    assert_no_pending_process_mutation,
)
from app.services._vendor_governance.policy import lock_vendor_ordinary_mutation
from app.services.transaction_boundary import commit_service_boundary

from .asset_policy import (
    assert_asset_ordinary_mutation_allowed,
    assert_asset_readable,
    can_read_asset_record,
    can_update_asset_record,
    load_asset,
)
from .asset_projection import pending_asset_responsibility_roles
from .derivation import process_display_name
from .policy import (
    assert_process_ordinary_mutation_allowed,
    assert_process_readable,
    can_update_process_record,
    process_visibility_clause,
)
from .projection import pending_process_ownership_orphan_ids


async def _load_vendor(db: AsyncSession, vendor_id: int) -> Vendor | None:
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    return result.scalar_one_or_none()


def _serialize_asset_vendor_link(
    link: AssetVendorLink,
    current_user: User,
    *,
    asset: Asset,
    ownership_pending: bool = False,
    vendor_visible: bool,
    vendor_name: str | None = None,
) -> AssetVendorLinkRead:
    base = AssetVendorLinkRead.model_validate(link)
    return base.model_copy(
        update={
            "capabilities": asset_vendor_link_capabilities(
                current_user,
                can_update_asset=can_update_asset_record(current_user, asset),
                ownership_pending=ownership_pending,
                register_end_active=not asset.is_archived,
                vendor_visible=vendor_visible,
            ),
            "asset_name": asset.name,
            "vendor_name": vendor_name,
        }
    )


def _serialize_process_vendor_link(
    link: ProcessVendorLink,
    current_user: User,
    *,
    process: Process,
    vendor: Vendor,
    ownership_pending: bool = False,
    process_business_edit_blocked: bool = False,
) -> ProcessVendorLinkRead:
    base = ProcessVendorLinkRead.model_validate(link)
    return base.model_copy(
        update={
            "capabilities": process_vendor_link_capabilities(
                current_user,
                can_update_process=can_update_process_record(current_user, process),
                ownership_pending=ownership_pending,
                register_end_active=not process.is_archived,
            ),
            "process_name": process_display_name(process.l1_process, process.l2_subprocess),
            "vendor_name": vendor.name,
            "process_business_edit_blocked": process_business_edit_blocked,
        }
    )


async def _visible_vendors_by_id(
    db: AsyncSession,
    *,
    current_user: User,
    vendor_ids: set[int],
) -> dict[int, Vendor]:
    """Load only Vendor rows independently readable by the caller."""
    readable_ids = await visible_vendor_ids(db, current_user, vendor_ids)
    if not readable_ids:
        return {}
    vendors = (await db.execute(select(Vendor).where(Vendor.id.in_(readable_ids)))).scalars().all()
    return {vendor.id: vendor for vendor in vendors}


async def _require_asset_vendor_link_access(
    db: AsyncSession,
    *,
    asset_id: int,
    current_user: User,
    require_write: bool,
) -> Asset:
    """Compose canonical Asset row authority with independent Vendor access."""
    if not check_permission(current_user, "vendors", "read"):
        raise AuthorizationError("Permission denied: vendors:read")
    if require_write:
        return await assert_asset_ordinary_mutation_allowed(
            db,
            asset_id=asset_id,
            current_user=current_user,
        )
    return await assert_asset_readable(
        db,
        asset_id=asset_id,
        current_user=current_user,
    )


async def list_asset_vendor_links(
    db: AsyncSession,
    *,
    asset_id: int,
    current_user: User,
) -> list[AssetVendorLinkRead]:
    asset = await _require_asset_vendor_link_access(
        db, asset_id=asset_id, current_user=current_user, require_write=False
    )
    result = await db.execute(
        select(AssetVendorLink).where(AssetVendorLink.asset_id == asset_id).order_by(AssetVendorLink.id)
    )
    links = list(result.scalars().all())
    vendors = await _visible_vendors_by_id(
        db,
        current_user=current_user,
        vendor_ids={link.vendor_id for link in links},
    )
    pending_roles = await pending_asset_responsibility_roles(
        db,
        asset_ids=[asset.id] if links else [],
    )
    return [
        _serialize_asset_vendor_link(
            link,
            current_user,
            asset=asset,
            ownership_pending=asset.id in pending_roles,
            vendor_name=vendors[link.vendor_id].name,
            vendor_visible=True,
        )
        for link in links
        if link.vendor_id in vendors
    ]


async def list_vendor_asset_links(
    db: AsyncSession,
    *,
    vendor_id: int,
    current_user: User,
) -> list[AssetVendorLinkRead]:
    """The Vendor-end read of the same Link relation (visibility follows the Vendor row)."""
    if not check_permission(current_user, "vendors", "read"):
        raise AuthorizationError("Permission denied: vendors:read")
    vendor = await _load_vendor(db, vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise NotFoundError("Vendor not found")

    result = await db.execute(
        select(AssetVendorLink).where(AssetVendorLink.vendor_id == vendor_id).order_by(AssetVendorLink.id)
    )
    links = list(result.scalars().all())
    readable_assets = [
        asset
        for link in links
        if (asset := await load_asset(db, link.asset_id)) is not None and can_read_asset_record(current_user, asset)
    ]
    readable_asset_ids = {asset.id for asset in readable_assets}
    assets_by_id = {asset.id: asset for asset in readable_assets}
    pending_roles = await pending_asset_responsibility_roles(
        db,
        asset_ids=list(readable_asset_ids),
    )
    return [
        _serialize_asset_vendor_link(
            link,
            current_user,
            asset=assets_by_id[link.asset_id],
            ownership_pending=link.asset_id in pending_roles,
            vendor_name=vendor.name,
            vendor_visible=True,
        )
        for link in links
        if link.asset_id in readable_asset_ids
    ]


async def add_asset_vendor_link(
    db: AsyncSession,
    *,
    asset_id: int,
    payload: AssetVendorLinkCreate,
    current_user: User,
) -> AssetVendorLinkRead:
    asset = await _require_asset_vendor_link_access(
        db, asset_id=asset_id, current_user=current_user, require_write=True
    )

    vendor = await _load_vendor(db, payload.vendor_id)
    if vendor is None or not can_read_vendor(vendor, current_user):
        raise NotFoundError("Vendor not found")
    vendor = await lock_vendor_ordinary_mutation(db, vendor_id=vendor.id)
    if vendor.is_archived:
        raise ConflictError("Cannot link archived vendor")

    existing = await db.execute(
        select(AssetVendorLink).where(
            AssetVendorLink.asset_id == asset_id,
            AssetVendorLink.vendor_id == payload.vendor_id,
            AssetVendorLink.ict_service_code == payload.ict_service_code,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError("Link already exists")

    from app.services._governed_mutations.asset_mutations import (
        submit_asset_link_mutation_if_required,
    )

    link_values = {"asset_id": asset_id, **payload.model_dump(exclude={"request_reason"})}
    queued = await submit_asset_link_mutation_if_required(
        db=db,
        asset=asset,
        impacted_assets=[asset],
        operation={
            "relationship_type": "vendor",
            "action": "add",
            "before": None,
            "after": link_values,
        },
        current_user=current_user,
        request_reason=payload.request_reason,
    )
    if queued is not None:
        return queued

    asset.governance_version += 1
    link = AssetVendorLink(**link_values)
    db.add(link)
    await db.flush()

    await audit_asset.asset_link_created(
        db,
        actor=current_user,
        asset=asset,
        link_kind="vendor",
        target_id=payload.vendor_id,
        target_label=vendor.name,
    )
    await commit_service_boundary(db, boundary="ict_register_asset_link_create")
    await db.refresh(link)
    return _serialize_asset_vendor_link(
        link,
        current_user,
        asset=asset,
        vendor_name=vendor.name,
        vendor_visible=True,
    )


async def remove_asset_vendor_link(
    db: AsyncSession,
    *,
    asset_id: int,
    link_id: int,
    request_reason: str | None,
    current_user: User,
) -> None:
    asset = await _require_asset_vendor_link_access(
        db, asset_id=asset_id, current_user=current_user, require_write=True
    )

    result = await db.execute(select(AssetVendorLink).where(AssetVendorLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link or link.asset_id != asset_id:
        raise NotFoundError("Link not found")

    vendor = await _load_vendor(db, link.vendor_id)
    if vendor is None or not can_read_vendor(vendor, current_user):
        raise NotFoundError("Link not found")
    vendor = await lock_vendor_ordinary_mutation(db, vendor_id=vendor.id)

    vendor_id = link.vendor_id
    from app.services._governed_mutations.asset_mutations import (
        submit_asset_link_mutation_if_required,
    )

    before = {
        "id": link.id,
        "asset_id": link.asset_id,
        "vendor_id": link.vendor_id,
        "vendor_role": link.vendor_role,
        "ict_service_code": link.ict_service_code,
        "contract_reference": link.contract_reference,
        "reliance": link.reliance,
        "note": link.note,
    }
    queued = await submit_asset_link_mutation_if_required(
        db=db,
        asset=asset,
        impacted_assets=[asset],
        operation={"relationship_type": "vendor", "action": "remove", "before": before, "after": None},
        current_user=current_user,
        request_reason=request_reason,
    )
    if queued is not None:
        return queued
    asset.governance_version += 1
    await db.delete(link)
    await db.flush()

    await audit_asset.asset_link_deleted(
        db,
        actor=current_user,
        asset=asset,
        link_kind="vendor",
        target_id=vendor_id,
        target_label=vendor.name,
    )
    await commit_service_boundary(db, boundary="ict_register_asset_link_delete")


async def _require_process_vendor_link_access(
    db: AsyncSession,
    *,
    process_id: int,
    current_user: User,
    require_write: bool,
) -> Process:
    """Apply Process row policy while preserving independent Vendor authority."""
    if not check_permission(current_user, "vendors", "read"):
        raise AuthorizationError("Permission denied: vendors:read")
    if require_write:
        return await assert_process_ordinary_mutation_allowed(
            db,
            process_id=process_id,
            current_user=current_user,
        )
    return await assert_process_readable(
        db,
        process_id=process_id,
        current_user=current_user,
    )


async def list_process_vendor_links(
    db: AsyncSession,
    *,
    process_id: int,
    current_user: User,
) -> list[ProcessVendorLinkRead]:
    process = await _require_process_vendor_link_access(
        db, process_id=process_id, current_user=current_user, require_write=False
    )
    result = await db.execute(
        select(ProcessVendorLink).where(ProcessVendorLink.process_id == process_id).order_by(ProcessVendorLink.id)
    )
    links = list(result.scalars().all())
    vendors = await _visible_vendors_by_id(
        db,
        current_user=current_user,
        vendor_ids={link.vendor_id for link in links},
    )
    pending_process_ids = await pending_process_ownership_orphan_ids(
        db,
        process_ids=[process.id] if links else [],
    )
    blocked_process_ids = await active_governed_process_mutation_ids(db, process_ids={process.id} if links else set())
    return [
        _serialize_process_vendor_link(
            link,
            current_user,
            process=process,
            vendor=vendors[link.vendor_id],
            ownership_pending=process.id in pending_process_ids,
            process_business_edit_blocked=process.id in blocked_process_ids,
        )
        for link in links
        if link.vendor_id in vendors
    ]


async def list_vendor_process_links(
    db: AsyncSession,
    *,
    vendor_id: int,
    current_user: User,
) -> list[ProcessVendorLinkRead]:
    """The Vendor-end read of the same Link relation (visibility follows the Vendor row)."""
    if not check_permission(current_user, "vendors", "read"):
        raise AuthorizationError("Permission denied: vendors:read")
    vendor = await _load_vendor(db, vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise NotFoundError("Vendor not found")

    query = (
        select(ProcessVendorLink, Process)
        .join(Process, Process.id == ProcessVendorLink.process_id)
        .where(ProcessVendorLink.vendor_id == vendor_id)
        .order_by(ProcessVendorLink.id)
    )
    visibility_clause = process_visibility_clause(current_user)
    if visibility_clause is not None:
        query = query.where(visibility_clause)
    rows = (await db.execute(query)).all()
    pending_process_ids = await pending_process_ownership_orphan_ids(
        db,
        process_ids=list({process.id for _, process in rows}),
    )
    blocked_process_ids = await active_governed_process_mutation_ids(
        db, process_ids={process.id for _, process in rows}
    )
    return [
        _serialize_process_vendor_link(
            link,
            current_user,
            process=process,
            vendor=vendor,
            ownership_pending=process.id in pending_process_ids,
            process_business_edit_blocked=process.id in blocked_process_ids,
        )
        for link, process in rows
    ]


async def add_process_vendor_link(
    db: AsyncSession,
    *,
    process_id: int,
    payload: ProcessVendorLinkCreate,
    current_user: User,
) -> ProcessVendorLinkRead | JSONResponse:
    process = await _require_process_vendor_link_access(
        db, process_id=process_id, current_user=current_user, require_write=True
    )
    await assert_no_pending_process_mutation(db, process_id=process.id)

    vendor = await _load_vendor(db, payload.vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise NotFoundError("Vendor not found")
    vendor = await lock_vendor_ordinary_mutation(db, vendor_id=vendor.id)
    if vendor.is_archived:
        raise ConflictError("Cannot link archived vendor")

    existing = await db.execute(
        select(ProcessVendorLink).where(
            ProcessVendorLink.process_id == process_id,
            ProcessVendorLink.vendor_id == payload.vendor_id,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError("Link already exists")

    after = {
        "direct_service_description": payload.direct_service_description,
        "note": payload.note,
    }
    operation = {
        "kind": "process.link.vendor.add",
        "relationship_type": "vendor",
        "action": "add",
        "process_id": process.id,
        "related_resource_id": vendor.id,
        "related_resource_name": vendor.name,
        "before": {},
        "after": after,
    }
    queued = await submit_process_relationship_mutation(
        db=db,
        process=process,
        mutation_kind="process.link.vendor.add",
        operation=operation,
        request_reason=payload.request_reason,
        current_user=current_user,
        impacted_resources=[process_impact_resource(process)],
    )
    if queued is not None:
        return queued

    link = ProcessVendorLink(
        process_id=process_id,
        vendor_id=payload.vendor_id,
        direct_service_description=payload.direct_service_description,
        note=payload.note,
    )
    db.add(link)
    await db.flush()
    process.governance_version += 1

    await audit_process.process_link_created(
        db,
        actor=current_user,
        process=process,
        link_kind="vendor",
        target_id=payload.vendor_id,
        target_label=vendor.name,
    )
    await commit_service_boundary(db, boundary="ict_register_process_link_create")
    await db.refresh(link)
    return _serialize_process_vendor_link(
        link,
        current_user,
        process=process,
        vendor=vendor,
    )


async def remove_process_vendor_link(
    db: AsyncSession,
    *,
    process_id: int,
    link_id: int,
    request_reason: str | None = None,
    current_user: User,
) -> JSONResponse | None:
    process = await _require_process_vendor_link_access(
        db, process_id=process_id, current_user=current_user, require_write=True
    )
    await assert_no_pending_process_mutation(db, process_id=process.id)

    result = await db.execute(select(ProcessVendorLink).where(ProcessVendorLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link or link.process_id != process_id:
        raise NotFoundError("Link not found")

    vendor = await _load_vendor(db, link.vendor_id)
    if vendor is None or not can_read_vendor(vendor, current_user):
        raise NotFoundError("Link not found")
    vendor = await lock_vendor_ordinary_mutation(db, vendor_id=vendor.id)

    vendor_id = link.vendor_id
    before = {
        "direct_service_description": link.direct_service_description,
        "note": link.note,
    }
    operation = {
        "kind": "process.link.vendor.remove",
        "relationship_type": "vendor",
        "action": "remove",
        "process_id": process.id,
        "related_resource_id": vendor.id,
        "related_resource_name": vendor.name,
        "link_id": link.id,
        "before": before,
        "after": {},
    }
    queued = await submit_process_relationship_mutation(
        db=db,
        process=process,
        mutation_kind="process.link.vendor.remove",
        operation=operation,
        request_reason=request_reason,
        current_user=current_user,
        impacted_resources=[process_impact_resource(process)],
    )
    if queued is not None:
        return queued
    await db.delete(link)
    await db.flush()
    process.governance_version += 1

    await audit_process.process_link_deleted(
        db,
        actor=current_user,
        process=process,
        link_kind="vendor",
        target_id=vendor_id,
        target_label=vendor.name,
    )
    await commit_service_boundary(db, boundary="ict_register_process_link_delete")
    return None
