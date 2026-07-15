"""Asset<->Vendor and Process<->Vendor Link relations (issue #46).

The remaining manual link sheets of the register graph: sheet 10_VAD types
each Asset->Vendor dependency by an ICT service S-code (the identity tuple is
asset + vendor + S-code), sheet 11 §1 holds the manual Process->Vendor pairs
(the §2 transitive expansion stays derived-only, engine-side). Links are
managed from the register end — mutations require the register end's write
permission (assets:write / processes:write) — and readable from all three
ends under both ends' read permissions (#43 dual-permission precedent).
Archived-end stance is STRICT per #43: mutating from an archived register
end, or linking TO an archived target, conflicts (409); unlinking an
archived TARGET from an active register end stays possible.
"""

from __future__ import annotations

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
from app.services.transaction_boundary import commit_service_boundary

from .asset_policy import load_asset
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
    asset_name: str | None = None,
    vendor_name: str | None = None,
    register_end_active: bool = True,
) -> AssetVendorLinkRead:
    base = AssetVendorLinkRead.model_validate(link)
    return base.model_copy(
        update={
            "capabilities": asset_vendor_link_capabilities(
                current_user,
                register_end_active=register_end_active,
            ),
            "asset_name": asset_name,
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
        }
    )


async def _vendor_info_by_id(db: AsyncSession, vendor_ids: set[int]) -> dict[int, tuple[str, bool]]:
    """Display names and archive state for the Vendor ends of link rows."""
    if not vendor_ids:
        return {}
    rows = await db.execute(
        select(Vendor.id, Vendor.name, Vendor.is_archived).where(Vendor.id.in_(vendor_ids))
    )
    return {
        vendor_id: (name, is_archived)
        for vendor_id, name, is_archived in rows.all()
    }


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
    vendors = (
        await db.execute(select(Vendor).where(Vendor.id.in_(readable_ids)))
    ).scalars().all()
    return {vendor.id: vendor for vendor in vendors}


async def _asset_info_by_id(db: AsyncSession, asset_ids: set[int]) -> dict[int, tuple[str, bool]]:
    if not asset_ids:
        return {}
    rows = await db.execute(select(Asset.id, Asset.name, Asset.is_archived).where(Asset.id.in_(asset_ids)))
    return {asset_id: (name, is_archived) for asset_id, name, is_archived in rows.all()}


async def _require_asset_vendor_link_access(
    db: AsyncSession,
    *,
    asset_id: int,
    current_user: User,
    require_write: bool,
) -> Asset:
    """Check both ends' read permissions, then Asset write access for mutations."""
    if not check_permission(current_user, "assets", "read"):
        raise AuthorizationError("Permission denied: assets:read")
    if not check_permission(current_user, "vendors", "read"):
        raise AuthorizationError("Permission denied: vendors:read")

    asset = await load_asset(db, asset_id)
    if not asset:
        raise NotFoundError("Asset not found")

    if require_write and not check_permission(current_user, "assets", "write"):
        raise AuthorizationError("Permission denied: assets:write")
    if require_write and asset.is_archived:
        raise ConflictError("Cannot mutate links for archived asset")

    return asset


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
    vendor_info = await _vendor_info_by_id(db, {link.vendor_id for link in links})
    return [
        _serialize_asset_vendor_link(
            link,
            current_user,
            asset_name=asset.name,
            vendor_name=vendor_info.get(link.vendor_id, (None, True))[0],
            register_end_active=not asset.is_archived,
        )
        for link in links
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
    if not check_permission(current_user, "assets", "read"):
        raise AuthorizationError("Permission denied: assets:read")
    vendor = await _load_vendor(db, vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise NotFoundError("Vendor not found")

    result = await db.execute(
        select(AssetVendorLink).where(AssetVendorLink.vendor_id == vendor_id).order_by(AssetVendorLink.id)
    )
    links = list(result.scalars().all())
    asset_info = await _asset_info_by_id(db, {link.asset_id for link in links})
    return [
        _serialize_asset_vendor_link(
            link,
            current_user,
            asset_name=asset_info.get(link.asset_id, (None, True))[0],
            vendor_name=vendor.name,
            register_end_active=not asset_info.get(link.asset_id, (None, True))[1],
        )
        for link in links
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
    if not vendor:
        raise NotFoundError("Vendor not found")
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

    link = AssetVendorLink(
        asset_id=asset_id,
        vendor_id=payload.vendor_id,
        vendor_role=payload.vendor_role,
        ict_service_code=payload.ict_service_code,
        contract_reference=payload.contract_reference,
        reliance=payload.reliance,
        note=payload.note,
    )
    db.add(link)
    await db.flush()

    await audit_asset.asset_link_created(
        db, actor=current_user, asset=asset, link_kind="vendor", target_id=payload.vendor_id
    )
    await commit_service_boundary(db, boundary="ict_register_asset_link_create")
    await db.refresh(link)
    return _serialize_asset_vendor_link(
        link,
        current_user,
        asset_name=asset.name,
        vendor_name=vendor.name,
        register_end_active=not asset.is_archived,
    )


async def remove_asset_vendor_link(
    db: AsyncSession,
    *,
    asset_id: int,
    link_id: int,
    current_user: User,
) -> None:
    asset = await _require_asset_vendor_link_access(
        db, asset_id=asset_id, current_user=current_user, require_write=True
    )

    result = await db.execute(select(AssetVendorLink).where(AssetVendorLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link or link.asset_id != asset_id:
        raise NotFoundError("Link not found")

    vendor_id = link.vendor_id
    await db.delete(link)
    await db.flush()

    await audit_asset.asset_link_deleted(
        db, actor=current_user, asset=asset, link_kind="vendor", target_id=vendor_id
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
        select(ProcessVendorLink)
        .where(ProcessVendorLink.process_id == process_id)
        .order_by(ProcessVendorLink.id)
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
    return [
        _serialize_process_vendor_link(
            link,
            current_user,
            process=process,
            vendor=vendors[link.vendor_id],
            ownership_pending=process.id in pending_process_ids,
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
    return [
        _serialize_process_vendor_link(
            link,
            current_user,
            process=process,
            vendor=vendor,
            ownership_pending=process.id in pending_process_ids,
        )
        for link, process in rows
    ]


async def add_process_vendor_link(
    db: AsyncSession,
    *,
    process_id: int,
    payload: ProcessVendorLinkCreate,
    current_user: User,
) -> ProcessVendorLinkRead:
    process = await _require_process_vendor_link_access(
        db, process_id=process_id, current_user=current_user, require_write=True
    )

    vendor = await _load_vendor(db, payload.vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise NotFoundError("Vendor not found")
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

    link = ProcessVendorLink(
        process_id=process_id,
        vendor_id=payload.vendor_id,
        direct_service_description=payload.direct_service_description,
        note=payload.note,
    )
    db.add(link)
    await db.flush()

    await audit_process.process_link_created(
        db, actor=current_user, process=process, link_kind="vendor", target_id=payload.vendor_id
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
    current_user: User,
) -> None:
    process = await _require_process_vendor_link_access(
        db, process_id=process_id, current_user=current_user, require_write=True
    )

    result = await db.execute(select(ProcessVendorLink).where(ProcessVendorLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link or link.process_id != process_id:
        raise NotFoundError("Link not found")

    vendor = await _load_vendor(db, link.vendor_id)
    if vendor is None or not can_read_vendor(vendor, current_user):
        raise NotFoundError("Link not found")

    vendor_id = link.vendor_id
    await db.delete(link)
    await db.flush()

    await audit_process.process_link_deleted(
        db, actor=current_user, process=process, link_kind="vendor", target_id=vendor_id
    )
    await commit_service_boundary(db, boundary="ict_register_process_link_delete")
