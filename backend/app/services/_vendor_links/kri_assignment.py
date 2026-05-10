from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthorizationError, NotFoundError, ValidationError
from app.core.permissions import can_read_vendor, is_vendor_owner
from app.models import KeyRiskIndicator, User, Vendor, VendorKRILink, VendorRiskLink
from app.services._authorization_capabilities import has_capability, require_capability
from app.services._vendor_links.workflow import (
    link_vendor_target_no_commit,
    unlink_vendor_target_no_commit,
)


def normalize_vendor_ids(vendor_ids: Sequence[int] | None) -> list[int]:
    normalized: list[int] = []
    seen: set[int] = set()
    for raw_vendor_id in vendor_ids or []:
        try:
            vendor_id = int(raw_vendor_id)
        except (TypeError, ValueError):
            continue
        if vendor_id <= 0 or vendor_id in seen:
            continue
        normalized.append(vendor_id)
        seen.add(vendor_id)
    return normalized


async def get_kri_vendor_ids(db: AsyncSession, kri_id: int) -> list[int]:
    result = await db.execute(
        select(VendorKRILink.vendor_id).where(VendorKRILink.kri_id == kri_id).order_by(VendorKRILink.vendor_id.asc())
    )
    return list(result.scalars().all())


async def validate_assignable_vendors(
    db: AsyncSession,
    *,
    current_user: User,
    vendor_ids: Sequence[int] | None,
) -> list[Vendor]:
    normalized_vendor_ids = normalize_vendor_ids(vendor_ids)
    if not normalized_vendor_ids:
        return []

    require_capability(current_user, "vendors", "read")

    result = await db.execute(select(Vendor).where(Vendor.id.in_(normalized_vendor_ids)))
    vendors = {vendor.id: vendor for vendor in result.scalars().all()}

    ordered_vendors: list[Vendor] = []
    has_vendor_write = has_capability(current_user, "vendors", "write")
    for vendor_id in normalized_vendor_ids:
        vendor = vendors.get(vendor_id)
        if vendor is None or not can_read_vendor(vendor, current_user):
            raise NotFoundError("Vendor not found")
        if not has_vendor_write and not is_vendor_owner(vendor, current_user):
            raise AuthorizationError("Permission denied: vendors:write")
        ordered_vendors.append(vendor)

    return ordered_vendors


async def ensure_vendors_exist(db: AsyncSession, vendor_ids: Sequence[int] | None) -> list[Vendor]:
    normalized_vendor_ids = normalize_vendor_ids(vendor_ids)
    if not normalized_vendor_ids:
        return []

    result = await db.execute(select(Vendor).where(Vendor.id.in_(normalized_vendor_ids)))
    vendors = {vendor.id: vendor for vendor in result.scalars().all()}

    ordered_vendors: list[Vendor] = []
    for vendor_id in normalized_vendor_ids:
        vendor = vendors.get(vendor_id)
        if vendor is None:
            raise ValidationError("Vendor not found")
        ordered_vendors.append(vendor)
    return ordered_vendors


async def assign_vendors_to_kri(
    db: AsyncSession,
    *,
    kri: KeyRiskIndicator,
    current_user: User,
    linked_vendor_ids: Sequence[int] | None,
    ensure_parent_risk_vendor_ids: Sequence[int] | None = None,
) -> list[int]:
    normalized_linked_vendor_ids = normalize_vendor_ids(linked_vendor_ids)
    normalized_parent_vendor_ids = normalize_vendor_ids(ensure_parent_risk_vendor_ids)

    current_link_result = await db.execute(select(VendorKRILink).where(VendorKRILink.kri_id == kri.id))
    current_links = current_link_result.scalars().all()
    current_vendor_ids = {link.vendor_id for link in current_links}
    desired_vendor_ids = set(normalized_linked_vendor_ids)
    vendor_ids_to_unlink = current_vendor_ids - desired_vendor_ids
    vendor_ids_to_link = [
        vendor_id for vendor_id in normalized_linked_vendor_ids if vendor_id not in current_vendor_ids
    ]
    parent_vendor_ids_to_link = normalized_parent_vendor_ids

    if normalized_parent_vendor_ids:
        risk_link_result = await db.execute(
            select(VendorRiskLink.vendor_id).where(
                VendorRiskLink.risk_id == kri.risk_id,
                VendorRiskLink.vendor_id.in_(normalized_parent_vendor_ids),
            )
        )
        existing_risk_vendor_ids = set(risk_link_result.scalars().all())
        parent_vendor_ids_to_link = [
            vendor_id for vendor_id in normalized_parent_vendor_ids if vendor_id not in existing_risk_vendor_ids
        ]

    await validate_assignable_vendors(
        db,
        current_user=current_user,
        vendor_ids=[*parent_vendor_ids_to_link, *vendor_ids_to_unlink, *vendor_ids_to_link],
    )

    if parent_vendor_ids_to_link:
        for vendor_id in normalized_parent_vendor_ids:
            if vendor_id not in parent_vendor_ids_to_link:
                continue
            await link_vendor_target_no_commit(
                db,
                vendor_id=vendor_id,
                current_user=current_user,
                kind="risk",
                entity_id=kri.risk_id,
            )

    for link in current_links:
        if link.vendor_id in desired_vendor_ids:
            continue
        await unlink_vendor_target_no_commit(
            db,
            vendor_id=link.vendor_id,
            current_user=current_user,
            kind="kri",
            entity_id=kri.id,
        )

    for vendor_id in normalized_linked_vendor_ids:
        if vendor_id in current_vendor_ids:
            continue
        await link_vendor_target_no_commit(
            db,
            vendor_id=vendor_id,
            current_user=current_user,
            kind="kri",
            entity_id=kri.id,
        )

    return normalized_linked_vendor_ids
