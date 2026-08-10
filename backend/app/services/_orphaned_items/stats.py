from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_user_department_ids
from app.models.asset import Asset
from app.models.control import Control
from app.models.orphaned_item import OrphanedItem
from app.models.process import Process
from app.models.risk import Risk
from app.models.user import User
from app.models.vendor import Vendor


async def get_orphan_stats(db: AsyncSession, current_user: User) -> dict:
    """
    Get statistics about orphaned items for the 4-bar layout.

    Returns:
        Dict matching OrphanedItemStats schema
    """
    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None and not dept_ids:
        return {
            "risk_count": 0,
            "control_count": 0,
            "kri_count": 0,
            "threat_count": 0,
            "process_count": 0,
            "asset_count": 0,
            "vendor_count": 0,
            "total_count": 0,
        }

    risk_stmt = (
        select(func.count(OrphanedItem.id))
        .select_from(OrphanedItem)
        .join(Risk, Risk.id == OrphanedItem.item_id)
        .where(
            OrphanedItem.status == "pending",
            OrphanedItem.item_type == "risk",
        )
    )
    control_stmt = (
        select(func.count(OrphanedItem.id))
        .select_from(OrphanedItem)
        .join(Control, Control.id == OrphanedItem.item_id)
        .where(
            OrphanedItem.status == "pending",
            OrphanedItem.item_type == "control",
        )
    )

    kri_stmt = (
        select(func.count(OrphanedItem.id))
        .select_from(OrphanedItem)
        .where(
            OrphanedItem.status == "pending",
            OrphanedItem.item_type == "kri",
        )
    )
    threat_stmt = select(func.count(OrphanedItem.id)).where(
        OrphanedItem.status == "pending",
        OrphanedItem.item_type == "threat",
    )
    process_stmt = (
        select(func.count(OrphanedItem.id))
        .select_from(OrphanedItem)
        .join(Process, Process.id == OrphanedItem.item_id)
        .where(
            OrphanedItem.status == "pending",
            OrphanedItem.item_type == "process",
        )
    )
    asset_stmt = (
        select(func.count(OrphanedItem.id))
        .select_from(OrphanedItem)
        .join(Asset, Asset.id == OrphanedItem.item_id)
        .where(
            OrphanedItem.status == "pending",
            OrphanedItem.item_type == "asset",
        )
    )
    vendor_stmt = (
        select(func.count(OrphanedItem.id))
        .select_from(OrphanedItem)
        .join(Vendor, Vendor.id == OrphanedItem.item_id)
        .where(
            OrphanedItem.status == "pending",
            OrphanedItem.item_type == "vendor",
        )
    )

    if dept_ids is not None:
        risk_stmt = risk_stmt.where(Risk.department_id.in_(dept_ids))
        control_stmt = control_stmt.where(Control.department_id.in_(dept_ids))
        process_stmt = process_stmt.where(Process.owning_department_id.in_(dept_ids))
        asset_stmt = asset_stmt.where(Asset.owning_department_id.in_(dept_ids))
        vendor_stmt = vendor_stmt.where(Vendor.department_id.in_(dept_ids))

        from app.models.key_risk_indicator import KeyRiskIndicator

        kri_stmt = (
            select(func.count(OrphanedItem.id))
            .select_from(OrphanedItem)
            .join(KeyRiskIndicator, KeyRiskIndicator.id == OrphanedItem.item_id)
            .join(Risk, Risk.id == KeyRiskIndicator.risk_id)
            .where(
                OrphanedItem.status == "pending",
                OrphanedItem.item_type == "kri",
                Risk.department_id.in_(dept_ids),
            )
        )

    risk_count = (await db.execute(risk_stmt)).scalar() or 0
    control_count = (await db.execute(control_stmt)).scalar() or 0
    kri_count = (await db.execute(kri_stmt)).scalar() or 0
    threat_count = (await db.execute(threat_stmt)).scalar() or 0
    process_count = (await db.execute(process_stmt)).scalar() or 0
    asset_count = (await db.execute(asset_stmt)).scalar() or 0
    vendor_count = (await db.execute(vendor_stmt)).scalar() or 0
    total = (
        int(risk_count)
        + int(control_count)
        + int(kri_count)
        + int(threat_count)
        + int(process_count)
        + int(asset_count)
        + int(vendor_count)
    )

    return {
        "risk_count": int(risk_count),
        "control_count": int(control_count),
        "kri_count": int(kri_count),
        "threat_count": int(threat_count),
        "process_count": int(process_count),
        "asset_count": int(asset_count),
        "vendor_count": int(vendor_count),
        "total_count": total,
    }
