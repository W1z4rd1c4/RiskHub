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
from app.core.permissions import can_read_vendor
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
from .policy import load_process


async def _load_vendor(db: AsyncSession, vendor_id: int) -> Vendor | None:
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    return result.scalar_one_or_none()


def _serialize_asset_vendor_link(link: AssetVendorLink, current_user: User) -> AssetVendorLinkRead:
    base = AssetVendorLinkRead.model_validate(link)
    return base.model_copy(update={"capabilities": asset_vendor_link_capabilities(current_user)})


def _serialize_process_vendor_link(link: ProcessVendorLink, current_user: User) -> ProcessVendorLinkRead:
    base = ProcessVendorLinkRead.model_validate(link)
    return base.model_copy(update={"capabilities": process_vendor_link_capabilities(current_user)})


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
    await _require_asset_vendor_link_access(
        db, asset_id=asset_id, current_user=current_user, require_write=False
    )
    result = await db.execute(
        select(AssetVendorLink).where(AssetVendorLink.asset_id == asset_id).order_by(AssetVendorLink.id)
    )
    return [_serialize_asset_vendor_link(link, current_user) for link in result.scalars().all()]


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
    return [_serialize_asset_vendor_link(link, current_user) for link in result.scalars().all()]


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
    return _serialize_asset_vendor_link(link, current_user)


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
    """Check both ends' read permissions, then Process write access for mutations."""
    if not check_permission(current_user, "processes", "read"):
        raise AuthorizationError("Permission denied: processes:read")
    if not check_permission(current_user, "vendors", "read"):
        raise AuthorizationError("Permission denied: vendors:read")

    process = await load_process(db, process_id)
    if not process:
        raise NotFoundError("Process not found")

    if require_write and not check_permission(current_user, "processes", "write"):
        raise AuthorizationError("Permission denied: processes:write")
    if require_write and process.is_archived:
        raise ConflictError("Cannot mutate links for archived process")

    return process


async def list_process_vendor_links(
    db: AsyncSession,
    *,
    process_id: int,
    current_user: User,
) -> list[ProcessVendorLinkRead]:
    await _require_process_vendor_link_access(
        db, process_id=process_id, current_user=current_user, require_write=False
    )
    result = await db.execute(
        select(ProcessVendorLink)
        .where(ProcessVendorLink.process_id == process_id)
        .order_by(ProcessVendorLink.id)
    )
    return [_serialize_process_vendor_link(link, current_user) for link in result.scalars().all()]


async def list_vendor_process_links(
    db: AsyncSession,
    *,
    vendor_id: int,
    current_user: User,
) -> list[ProcessVendorLinkRead]:
    """The Vendor-end read of the same Link relation (visibility follows the Vendor row)."""
    if not check_permission(current_user, "vendors", "read"):
        raise AuthorizationError("Permission denied: vendors:read")
    if not check_permission(current_user, "processes", "read"):
        raise AuthorizationError("Permission denied: processes:read")
    vendor = await _load_vendor(db, vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise NotFoundError("Vendor not found")

    result = await db.execute(
        select(ProcessVendorLink)
        .where(ProcessVendorLink.vendor_id == vendor_id)
        .order_by(ProcessVendorLink.id)
    )
    return [_serialize_process_vendor_link(link, current_user) for link in result.scalars().all()]


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
    if not vendor:
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
    return _serialize_process_vendor_link(link, current_user)


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

    vendor_id = link.vendor_id
    await db.delete(link)
    await db.flush()

    await audit_process.process_link_deleted(
        db, actor=current_user, process=process, link_kind="vendor", target_id=vendor_id
    )
    await commit_service_boundary(db, boundary="ict_register_process_link_delete")
