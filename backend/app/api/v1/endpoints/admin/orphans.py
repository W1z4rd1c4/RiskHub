from __future__ import annotations

import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models import Control, ControlRiskLink, KeyRiskIndicator, Risk, User
from app.schemas.admin import OrphanFixResponse, OrphanStatsResponse

from ._deps import require_platform_admin

router = APIRouter()


@router.get("/orphan-stats", response_model=OrphanStatsResponse)
async def get_orphan_stats(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> OrphanStatsResponse:
    """
    Get statistics about orphaned entities (KRIs without risks, controls without links).
    Admin only.
    """
    # Note: KRIs cannot be orphaned in current schema (risk_id is NOT NULL)
    # But just in case the schema changes:
    orphan_kris_result = await db.execute(
        select(func.count()).select_from(KeyRiskIndicator).where(KeyRiskIndicator.risk_id.is_(None))
    )
    orphan_kris = orphan_kris_result.scalar() or 0

    # Controls without any risk links
    controls_without_links_result = await db.execute(
        select(func.count()).select_from(Control).where(~Control.id.in_(select(ControlRiskLink.control_id).distinct()))
    )
    controls_without_links = controls_without_links_result.scalar() or 0

    # Totals
    total_risks = (await db.execute(select(func.count()).select_from(Risk))).scalar() or 0
    total_controls = (await db.execute(select(func.count()).select_from(Control))).scalar() or 0
    total_kris = (await db.execute(select(func.count()).select_from(KeyRiskIndicator))).scalar() or 0
    total_links = (await db.execute(select(func.count()).select_from(ControlRiskLink))).scalar() or 0

    return OrphanStatsResponse(
        orphan_kris=orphan_kris,
        controls_without_links=controls_without_links,
        total_risks=total_risks,
        total_controls=total_controls,
        total_kris=total_kris,
        total_links=total_links,
    )


@router.post("/fix-orphans", response_model=OrphanFixResponse)
async def fix_orphan_mappings(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> OrphanFixResponse:
    """
    Fix orphaned entities by assigning random risks.
    - KRIs without risk_id get a random risk assigned
    - Controls without any risk links get a random risk link created
    Admin only.
    """
    # Get all risks for random assignment
    risks_result = await db.execute(select(Risk))
    all_risks = list(risks_result.scalars().all())

    if not all_risks:
        raise HTTPException(status_code=400, detail="No risks available for assignment")

    kris_fixed = 0
    controls_fixed = 0
    links_created = 0

    # Fix orphan KRIs (if schema allows null risk_id)
    orphan_kris_result = await db.execute(select(KeyRiskIndicator).where(KeyRiskIndicator.risk_id.is_(None)))
    orphan_kris = list(orphan_kris_result.scalars().all())

    for kri in orphan_kris:
        kri.risk_id = random.choice(all_risks).id
        kris_fixed += 1

    # Fix controls without risk links
    controls_without_links_result = await db.execute(
        select(Control).where(~Control.id.in_(select(ControlRiskLink.control_id).distinct()))
    )
    controls_without_links = list(controls_without_links_result.scalars().all())

    for control in controls_without_links:
        # Create 1-3 random risk links
        num_links = random.randint(1, 3)
        selected_risks = random.sample(all_risks, min(num_links, len(all_risks)))

        for risk in selected_risks:
            link = ControlRiskLink(
                control_id=control.id,
                risk_id=risk.id,
                effectiveness="medium",
                notes="Auto-assigned by admin fix-orphans endpoint",
            )
            db.add(link)
            links_created += 1
        controls_fixed += 1

    await db.commit()

    return OrphanFixResponse(
        message=f"Fixed {kris_fixed} KRIs and {controls_fixed} controls ({links_created} links created)",
        kris_fixed=kris_fixed,
        controls_fixed=controls_fixed,
        links_created=links_created,
    )

