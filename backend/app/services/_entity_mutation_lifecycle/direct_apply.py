from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.models import Control, KeyRiskIndicator, Risk, VendorKRILink


async def reload_risk_with_relationships(db: AsyncSession, risk_id: int) -> Risk:
    return (
        await db.execute(
            select(Risk)
            .where(Risk.id == risk_id)
            .options(
                selectinload(Risk.controls),
                selectinload(Risk.key_risk_indicators),
                joinedload(Risk.department),
                joinedload(Risk.owner),
            )
        )
    ).scalar_one()


async def reload_control_with_relationships(db: AsyncSession, control_id: int) -> Control:
    return (
        await db.execute(
            select(Control)
            .where(Control.id == control_id)
            .options(
                selectinload(Control.risk_links),
                joinedload(Control.department),
                joinedload(Control.control_owner),
            )
        )
    ).scalar_one()


async def reload_kri_with_relationships(db: AsyncSession, kri_id: int) -> KeyRiskIndicator:
    return (
        await db.execute(
            select(KeyRiskIndicator)
            .where(KeyRiskIndicator.id == kri_id)
            .options(
                joinedload(KeyRiskIndicator.risk).joinedload(Risk.department),
                joinedload(KeyRiskIndicator.risk).joinedload(Risk.owner),
                joinedload(KeyRiskIndicator.reporting_owner),
                selectinload(KeyRiskIndicator.vendor_links).joinedload(VendorKRILink.vendor),
            )
        )
    ).scalar_one()
