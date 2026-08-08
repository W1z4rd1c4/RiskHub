"""Authoritative Vendor-tier impact snapshots for governed mutations."""

from __future__ import annotations

from dataclasses import replace
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Asset, AssetVendorLink, Process, ProcessAssetLink, ProcessVendorLink, Vendor
from app.services._ict_register_lifecycle.derivation import (
    AssetVendorLinkInput,
    ProcessAssetLinkInput,
    ProcessVendorLinkInput,
    derive_ict_register,
)
from app.services._ict_register_lifecycle.derivation_inputs import (
    asset_derivation_input,
    load_ict_register_graph,
    process_derivation_input,
)
from app.services._ict_register_reference.parameters import (
    load_ict_workbook_parameter_set_for_update,
)
from app.services._ict_register_reference.vendor_values import vendor_workbook_value

# Keyed as ``str | None`` because lookups pass a possibly missing derived tier.
_TIER_CODES: dict[str | None, str] = {
    "Kritický dodavatel": "critical",
    "Významný dodavatel": "significant",
    "Standardní dodavatel": "standard",
}


def impact_from_derived(derived: object) -> dict[str, object]:
    tier = getattr(derived, "tier", None)
    return {"tier": _TIER_CODES.get(tier, tier)}


async def existing_vendor_impacts(
    db: AsyncSession,
    *,
    vendor: Vendor,
    updates: dict[str, object],
) -> tuple[dict[str, object], dict[str, object]]:
    """Rederive one Vendor against its current and proposed entered values."""
    parameters = await load_ict_workbook_parameter_set_for_update(db)
    graph = await load_ict_register_graph(db, vendors=[vendor])
    current_input = next(item for item in graph.vendors if item.id == vendor.id)
    proposed_updates: dict[str, Any] = {
        key: value
        for key, value in updates.items()
        if key in current_input.__dataclass_fields__
    }
    if "replaceability" in updates:
        value = updates["replaceability"]
        proposed_updates["substitutability"] = (
            vendor_workbook_value("replaceability", value)
            if isinstance(value, str)
            else value
        )
    proposed_input = replace(current_input, **proposed_updates)
    current = derive_ict_register(graph, parameters).vendors[vendor.id]
    proposed = derive_ict_register(
        replace(
            graph,
            vendors=tuple(
                proposed_input if item.id == vendor.id else item
                for item in graph.vendors
            ),
        ),
        parameters,
    ).vendors[vendor.id]
    return impact_from_derived(current), impact_from_derived(proposed)


async def process_point_vendor_impacts(
    db: AsyncSession,
    *,
    process: Process,
    updates: dict[str, object],
    archive: bool = False,
    vendors: list[Vendor] | None = None,
    parameters=None,
) -> tuple[list[Vendor], list[dict[str, object]]]:
    """Rederive every Vendor downstream of a Process point mutation."""
    if vendors is None:
        direct_ids = set(
            (
                await db.execute(
                    select(ProcessVendorLink.vendor_id).where(
                        ProcessVendorLink.process_id == process.id,
                    )
                )
            ).scalars()
        )
        transitive_ids = set(
            (
                await db.execute(
                    select(AssetVendorLink.vendor_id)
                    .join(
                        ProcessAssetLink,
                        ProcessAssetLink.asset_id == AssetVendorLink.asset_id,
                    )
                    .where(ProcessAssetLink.process_id == process.id)
                )
            ).scalars()
        )
        vendor_ids = sorted(direct_ids | transitive_ids)
        vendors = (
            list(
                (
                    await db.execute(
                        select(Vendor)
                        .where(Vendor.id.in_(vendor_ids))
                        .order_by(Vendor.id)
                        .with_for_update()
                    )
                ).scalars()
            )
            if vendor_ids
            else []
        )
    if not vendors:
        return [], []
    if parameters is None:
        parameters = await load_ict_workbook_parameter_set_for_update(db)
    graph = await load_ict_register_graph(
        db,
        processes=[process],
        vendors=vendors,
    )
    before = derive_ict_register(graph, parameters)
    current_input = process_derivation_input(process)
    supported = set(current_input.__dataclass_fields__)
    supported_updates: dict[str, Any] = {
        key: value for key, value in updates.items() if key in supported
    }
    proposed_input = replace(current_input, **supported_updates)
    proposed_graph = replace(
        graph,
        processes=(
            tuple(item for item in graph.processes if item.id != process.id)
            if archive
            else tuple(
                proposed_input if item.id == process.id else item
                for item in graph.processes
            )
        ),
        process_asset_links=(
            tuple(
                link
                for link in graph.process_asset_links
                if link.process_id != process.id
            )
            if archive
            else graph.process_asset_links
        ),
        process_vendor_links=(
            tuple(
                link
                for link in graph.process_vendor_links
                if link.process_id != process.id
            )
            if archive
            else graph.process_vendor_links
        ),
    )
    after = derive_ict_register(proposed_graph, parameters)
    rows = [
        {
            "resource_id": vendor.id,
            "before": impact_from_derived(before.vendors[vendor.id]),
            "after": impact_from_derived(after.vendors[vendor.id]),
        }
        for vendor in vendors
    ]
    return vendors, rows


async def process_relationship_vendor_impacts(
    db: AsyncSession,
    *,
    process: Process,
    operation: dict[str, object],
    vendors: list[Vendor] | None = None,
    parameters=None,
) -> tuple[list[Vendor], list[dict[str, object]]]:
    """Rederive Vendors affected by one Process Asset/Vendor relationship change."""
    relationship_type = operation.get("relationship_type")
    if relationship_type not in {"asset", "vendor"}:
        return [], []
    related_id = operation.get("related_resource_id")
    if type(related_id) is not int:
        return [], []
    if vendors is None:
        if relationship_type == "vendor":
            vendor_ids = [related_id]
        else:
            vendor_ids = sorted(
                set(
                    (
                        await db.execute(
                            select(AssetVendorLink.vendor_id).where(
                                AssetVendorLink.asset_id == related_id,
                            )
                        )
                    ).scalars()
                )
            )
        vendors = (
            list(
                (
                    await db.execute(
                        select(Vendor)
                        .where(Vendor.id.in_(vendor_ids))
                        .order_by(Vendor.id)
                        .with_for_update()
                    )
                ).scalars()
            )
            if vendor_ids
            else []
        )
    if not vendors:
        return [], []
    if parameters is None:
        parameters = await load_ict_workbook_parameter_set_for_update(db)
    graph = await load_ict_register_graph(db, processes=[process], vendors=vendors)
    before = derive_ict_register(graph, parameters)
    action = operation.get("action")
    if relationship_type == "vendor":
        links = tuple(
            link
            for link in graph.process_vendor_links
            if not (link.process_id == process.id and link.vendor_id == related_id)
        )
        if action == "add":
            links = (*links, ProcessVendorLinkInput(process_id=process.id, vendor_id=related_id))
        proposed_graph = replace(graph, process_vendor_links=links)
    else:
        asset_links = tuple(
            link
            for link in graph.process_asset_links
            if not (link.process_id == process.id and link.asset_id == related_id)
        )
        if action in {"add", "update"}:
            values = operation.get("after")
            if not isinstance(values, dict):
                return vendors, []
            asset_links = (
                *asset_links,
                ProcessAssetLinkInput(
                    process_id=process.id,
                    asset_id=related_id,
                    spof=values.get("spof"),
                    is_primary=values.get("is_primary") is True,
                    significance=values.get("significance"),
                ),
            )
        proposed_graph = replace(graph, process_asset_links=asset_links)
    after = derive_ict_register(proposed_graph, parameters)
    rows = [
        {
            "resource_id": vendor.id,
            "before": impact_from_derived(before.vendors[vendor.id]),
            "after": impact_from_derived(after.vendors[vendor.id]),
        }
        for vendor in vendors
    ]
    return vendors, rows


async def asset_point_vendor_impacts(
    db: AsyncSession,
    *,
    asset: Asset,
    updates: dict[str, object],
    archive: bool = False,
    vendors: list[Vendor] | None = None,
    parameters=None,
) -> tuple[list[Vendor], list[dict[str, object]]]:
    """Rederive every Vendor downstream of an Asset point mutation."""
    if vendors is None:
        vendor_ids = sorted(
            set(
                (
                    await db.execute(
                        select(AssetVendorLink.vendor_id).where(
                            AssetVendorLink.asset_id == asset.id,
                        )
                    )
                ).scalars()
            )
        )
        vendors = (
            list(
                (
                    await db.execute(
                        select(Vendor)
                        .where(Vendor.id.in_(vendor_ids))
                        .order_by(Vendor.id)
                        .with_for_update()
                    )
                ).scalars()
            )
            if vendor_ids
            else []
        )
    if not vendors:
        return [], []
    if parameters is None:
        parameters = await load_ict_workbook_parameter_set_for_update(db)
    graph = await load_ict_register_graph(db, assets=[asset], vendors=vendors)
    before = derive_ict_register(graph, parameters)
    current_input = asset_derivation_input(asset)
    supported = set(current_input.__dataclass_fields__)
    supported_updates: dict[str, Any] = {
        key: value for key, value in updates.items() if key in supported
    }
    proposed_input = replace(current_input, **supported_updates)
    proposed_graph = replace(
        graph,
        assets=(
            tuple(item for item in graph.assets if item.id != asset.id)
            if archive
            else tuple(
                proposed_input if item.id == asset.id else item
                for item in graph.assets
            )
        ),
        process_asset_links=(
            tuple(link for link in graph.process_asset_links if link.asset_id != asset.id)
            if archive
            else graph.process_asset_links
        ),
        asset_vendor_links=(
            tuple(link for link in graph.asset_vendor_links if link.asset_id != asset.id)
            if archive
            else graph.asset_vendor_links
        ),
    )
    after = derive_ict_register(proposed_graph, parameters)
    rows = [
        {
            "resource_id": vendor.id,
            "before": impact_from_derived(before.vendors[vendor.id]),
            "after": impact_from_derived(after.vendors[vendor.id]),
        }
        for vendor in vendors
    ]
    return vendors, rows


async def asset_relationship_vendor_impacts(
    db: AsyncSession,
    *,
    asset: Asset,
    operation: dict[str, object],
    vendors: list[Vendor] | None = None,
    parameters=None,
) -> tuple[list[Vendor], list[dict[str, object]]]:
    """Rederive the Vendor affected by an Asset-Vendor link mutation."""
    if operation.get("relationship_type") != "vendor":
        return [], []
    action = operation.get("action")
    values = operation.get("after") if action == "add" else operation.get("before")
    if not isinstance(values, dict) or type(values.get("vendor_id")) is not int:
        return [], []
    vendor_id = values["vendor_id"]
    if vendors is None:
        vendor = (
            await db.execute(
                select(Vendor)
                .where(Vendor.id == vendor_id)
                .with_for_update()
            )
        ).scalar_one_or_none()
        vendors = [vendor] if vendor is not None else []
    if not vendors:
        return [], []
    if parameters is None:
        parameters = await load_ict_workbook_parameter_set_for_update(db)
    graph = await load_ict_register_graph(db, assets=[asset], vendors=vendors)
    before = derive_ict_register(graph, parameters)
    links = tuple(
        link
        for link in graph.asset_vendor_links
        if not (link.asset_id == asset.id and link.vendor_id == vendor_id)
    )
    if action == "add":
        links = (
            *links,
            AssetVendorLinkInput(
                asset_id=asset.id,
                vendor_id=vendor_id,
                vendor_name=vendors[0].name,
                ict_service_code=values.get("ict_service_code"),
                contract_reference=values.get("contract_reference"),
                reliance=values.get("reliance"),
            ),
        )
    after = derive_ict_register(replace(graph, asset_vendor_links=links), parameters)
    rows = [
        {
            "resource_id": vendor.id,
            "before": impact_from_derived(before.vendors[vendor.id]),
            "after": impact_from_derived(after.vendors[vendor.id]),
        }
        for vendor in vendors
    ]
    return vendors, rows


def vendor_impact_is_protected(impact: dict[str, object]) -> bool:
    return impact.get("tier") in {"critical", "significant"}


__all__ = [
    "existing_vendor_impacts",
    "asset_point_vendor_impacts",
    "asset_relationship_vendor_impacts",
    "impact_from_derived",
    "process_point_vendor_impacts",
    "process_relationship_vendor_impacts",
    "vendor_impact_is_protected",
]
