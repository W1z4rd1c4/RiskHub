from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, TypeAlias, cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.core.permissions import can_read_vendor, is_vendor_owner
from app.models import User, Vendor, VendorControlLink, VendorKRILink, VendorRiskLink
from app.services._authorization_capabilities import has_capability, require_capability

VendorLink: TypeAlias = VendorRiskLink | VendorControlLink | VendorKRILink
VendorLinkModel: TypeAlias = type[VendorRiskLink] | type[VendorControlLink] | type[VendorKRILink]
VendorLinkField: TypeAlias = Literal["risk_id", "control_id", "kri_id"]


@dataclass(frozen=True)
class VendorLinkAccessPlan:
    vendor_id: int
    entity_permission: str
    require_write: bool = False


@dataclass(frozen=True)
class VendorLinkedResourceProjection:
    resource_id: int
    resource_type: str
    visible: bool


async def get_vendor(db: AsyncSession, vendor_id: int) -> Vendor | None:
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    return result.scalar_one_or_none()


async def require_vendor_access(
    db: AsyncSession,
    vendor_id: int,
    current_user: User,
    *,
    entity_permission: str,
    require_write: bool = False,
) -> Vendor:
    """Check vendor read access, optional vendor write access, and entity read access."""
    require_capability(current_user, "vendors", "read")
    require_capability(current_user, entity_permission, "read")

    vendor = await get_vendor(db, vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise NotFoundError("Vendor not found")

    if require_write and not (
        has_capability(current_user, "vendors", "write") or is_vendor_owner(vendor, current_user)
    ):
        raise AuthorizationError("Permission denied: vendors:write")

    if require_write and vendor.is_archived:
        raise ConflictError("Cannot mutate links for archived vendor")

    return vendor


async def get_existing_link(
    db: AsyncSession,
    link_model: VendorLinkModel,
    vendor_id: int,
    entity_field: VendorLinkField,
    entity_id: int,
) -> VendorLink | None:
    result = await db.execute(
        select(link_model).where(
            link_model.vendor_id == vendor_id,
            getattr(link_model, entity_field) == entity_id,
        )
    )
    return cast("VendorLink | None", result.scalar_one_or_none())


async def ensure_link_absent(
    db: AsyncSession,
    link_model: VendorLinkModel,
    vendor_id: int,
    entity_field: VendorLinkField,
    entity_id: int,
) -> None:
    if await get_existing_link(db, link_model, vendor_id, entity_field, entity_id):
        raise ValidationError("Link already exists")


async def create_vendor_link(
    db: AsyncSession,
    link_model: VendorLinkModel,
    vendor_id: int,
    entity_field: VendorLinkField,
    entity_id: int,
) -> dict[str, str]:
    await ensure_link_absent(db, link_model, vendor_id, entity_field, entity_id)
    db.add(cast(Any, link_model)(vendor_id=vendor_id, **{entity_field: entity_id}))
    await db.flush()
    return {"status": "linked"}


async def delete_vendor_link(
    db: AsyncSession,
    link_model: VendorLinkModel,
    vendor_id: int,
    entity_field: VendorLinkField,
    entity_id: int,
) -> None:
    link = await get_existing_link(db, link_model, vendor_id, entity_field, entity_id)
    if not link:
        raise NotFoundError("Link not found")

    await db.delete(link)
    await db.flush()
