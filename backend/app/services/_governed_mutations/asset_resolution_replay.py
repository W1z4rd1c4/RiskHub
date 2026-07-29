"""Typed relationship and mutable-reference replay checks for Asset resolution."""

from __future__ import annotations

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Asset,
    AssetAssetLink,
    AssetVendorLink,
    Department,
    GovernedMutationProposal,
    Risk,
    RiskAssetLink,
    User,
    Vendor,
)

from .asset_identity import ASSET_RELATIONSHIP_PREFIX


async def relationship_replay_stale_reason(
    db: AsyncSession,
    *,
    proposal: GovernedMutationProposal,
    operation: object,
    assets: dict[int, Asset],
) -> str | None:
    if not isinstance(operation, dict):
        return "Governed Asset link operation is malformed"
    relationship_type = operation.get("relationship_type")
    action = operation.get("action")
    expected_keys = {"relationship_type", "action", "before", "after"}
    if relationship_type == "risk":
        expected_keys.add("related_resource_id")
    if (
        relationship_type not in {"asset", "vendor", "risk"}
        or action not in {"add", "remove"}
        or set(operation) != expected_keys
        or proposal.mutation_kind != f"{ASSET_RELATIONSHIP_PREFIX}{relationship_type}.{action}"
        or any(asset.is_archived for asset in assets.values())
    ):
        return "Governed Asset link operation is malformed"
    values = operation.get("after") if action == "add" else operation.get("before")
    empty_side = operation.get("before") if action == "add" else operation.get("after")
    if not isinstance(values, dict) or empty_side is not None:
        return "Governed Asset link operation is malformed"
    primary_id = proposal.primary_resource_id
    if primary_id not in assets:
        return "Governed Asset link primary resource is stale"
    if relationship_type == "asset":
        allowed = {
            "dependent_asset_id",
            "supporting_asset_id",
            "dependency_type",
            "spof",
            "note",
        }
        if action == "remove":
            allowed.add("id")
        if set(values) != allowed or {
            values.get("dependent_asset_id"),
            values.get("supporting_asset_id"),
        } != set(assets):
            return "Governed Asset link pair is stale"
        if action == "remove":
            link = (
                await db.execute(select(AssetAssetLink).where(AssetAssetLink.id == values.get("id")).with_for_update())
            ).scalar_one_or_none()
            if link is None or any(
                jsonable_encoder(getattr(link, field)) != value for field, value in values.items() if field != "id"
            ):
                return "Governed Asset link pair is stale"
    elif relationship_type == "vendor":
        allowed = {
            "asset_id",
            "vendor_id",
            "vendor_role",
            "ict_service_code",
            "contract_reference",
            "reliance",
            "note",
        }
        if action == "remove":
            allowed.add("id")
        if set(values) != allowed or values.get("asset_id") != primary_id:
            return "Governed Asset Vendor pair is stale"
        vendor = (
            await db.execute(select(Vendor).where(Vendor.id == values.get("vendor_id")).with_for_update())
        ).scalar_one_or_none()
        if vendor is None or (action == "add" and vendor.is_archived):
            return "Governed Asset Vendor reference is stale"
        if action == "remove":
            link = (
                await db.execute(
                    select(AssetVendorLink).where(AssetVendorLink.id == values.get("id")).with_for_update()
                )
            ).scalar_one_or_none()
            if link is None or any(
                jsonable_encoder(getattr(link, field)) != value for field, value in values.items() if field != "id"
            ):
                return "Governed Asset Vendor pair is stale"
    else:
        expected_value_keys = {"risk_id", "asset_id", "risk", "asset"}
        if action == "remove":
            expected_value_keys.add("id")
        if set(values) != expected_value_keys:
            return "Governed Risk Asset pair is stale"
        risk_id = operation.get("related_resource_id")
        if values.get("risk_id") != risk_id or values.get("asset_id") != primary_id:
            return "Governed Risk Asset pair is stale"
        risk = (await db.execute(select(Risk).where(Risk.id == risk_id).with_for_update())).scalar_one_or_none()
        if risk is None or risk.is_archived:
            return "Governed Risk reference is stale"
        if action == "remove":
            link = (
                await db.execute(select(RiskAssetLink).where(RiskAssetLink.id == values.get("id")).with_for_update())
            ).scalar_one_or_none()
            if link is None or link.risk_id != risk_id or link.asset_id != primary_id:
                return "Governed Risk Asset pair is stale"
    return None


async def asset_edit_references_are_live(
    db: AsyncSession,
    *,
    proposed_updates: dict[str, object],
) -> bool:
    owner_ids = {
        value
        for field in ("business_owner_user_id", "ict_owner_user_id")
        if type(value := proposed_updates.get(field)) is int
    }
    if owner_ids:
        owners = list(
            (
                await db.execute(select(User).where(User.id.in_(sorted(owner_ids))).order_by(User.id).with_for_update())
            ).scalars()
        )
        if {owner.id for owner in owners if owner.is_active} != owner_ids:
            return False
    department_id = proposed_updates.get("owning_department_id")
    if type(department_id) is int:
        department = (
            await db.execute(select(Department).where(Department.id == department_id).with_for_update())
        ).scalar_one_or_none()
        if department is None or not department.is_active:
            return False
    return True


__all__ = ["asset_edit_references_are_live", "relationship_replay_stale_reason"]
