from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.mappers.vendor import vendor_list_response, vendor_to_read
from app.core.permissions import visible_risk_ids
from app.models import User, Vendor, VendorRiskLink
from app.schemas.vendor import VendorLinkedRiskSummary, VendorListResponse, VendorRead


async def get_visible_vendor_risk_ids(
    db: AsyncSession,
    *,
    current_user: User,
    vendors: list[Vendor],
) -> set[int]:
    vendor_ids = {vendor.id for vendor in vendors}
    if not vendor_ids:
        return set()

    unique_risk_ids = set(
        (await db.execute(select(VendorRiskLink.risk_id).where(VendorRiskLink.vendor_id.in_(vendor_ids))))
        .scalars()
        .all()
    )
    if not unique_risk_ids:
        return set()

    return await visible_risk_ids(db, current_user, unique_risk_ids)


def serialize_vendor_linked_risks(
    vendors: list[Vendor],
    *,
    visible_risk_ids: set[int],
) -> dict[int, list[VendorLinkedRiskSummary]]:
    linked_risks_by_vendor_id: dict[int, list[VendorLinkedRiskSummary]] = {}

    for vendor in vendors:
        summaries: list[VendorLinkedRiskSummary] = []
        for link in getattr(vendor, "risk_links", []) or []:
            risk = getattr(link, "risk", None)
            if not risk or risk.id not in visible_risk_ids:
                continue
            summaries.append(
                VendorLinkedRiskSummary(
                    risk_id=risk.id,
                    risk_id_code=risk.risk_id_code,
                    risk_name=risk.name,
                )
            )
        linked_risks_by_vendor_id[vendor.id] = summaries

    return linked_risks_by_vendor_id


async def serialize_vendor_reads(
    db: AsyncSession,
    vendors: list[Vendor],
    *,
    current_user: User,
    can_read_risks: bool,
    visible_risk_ids_loader=get_visible_vendor_risk_ids,
) -> list[VendorRead]:
    visible_risk_ids = (
        await visible_risk_ids_loader(db, current_user=current_user, vendors=vendors)
        if can_read_risks
        else set()
    )
    linked_risks_by_vendor_id = serialize_vendor_linked_risks(vendors, visible_risk_ids=visible_risk_ids)
    return [
        vendor_to_read(
            vendor,
            current_user=current_user,
            linked_risks=linked_risks_by_vendor_id.get(vendor.id, []),
        )
        for vendor in vendors
    ]


async def serialize_vendor_list_items(
    db: AsyncSession,
    vendors: list[Vendor],
    *,
    current_user: User,
    can_read_risks: bool,
    total: int,
    offset: int,
    limit: int,
    capabilities: dict[str, bool] | None,
    visible_risk_ids_loader=get_visible_vendor_risk_ids,
) -> VendorListResponse:
    visible_risk_ids = (
        await visible_risk_ids_loader(db, current_user=current_user, vendors=vendors)
        if can_read_risks
        else set()
    )
    linked_risks_by_vendor_id = serialize_vendor_linked_risks(vendors, visible_risk_ids=visible_risk_ids)
    return vendor_list_response(
        vendors=vendors,
        total=total,
        offset=offset,
        limit=limit,
        current_user=current_user,
        linked_risks_by_vendor_id=linked_risks_by_vendor_id,
        capabilities=capabilities,
    )


def serialize_vendor_detail(vendor: Vendor, *, current_user: User) -> VendorRead:
    return vendor_to_read(vendor, current_user=current_user)
