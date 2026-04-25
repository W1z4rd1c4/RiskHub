from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models import Control, ControlRiskLink, KeyRiskIndicator, Risk, User
from app.schemas.admin import OrphanFixRequest, OrphanFixResponse, OrphanFixResult, OrphanStatsResponse
from app.services._orphaned_items.resolution import validate_resolution_context
from app.services._orphaned_items.workflow import OrphanResolutionConflict
from app.services.orphaned_item_service import OrphanedItemService

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
    payload: OrphanFixRequest,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> OrphanFixResponse:
    """
    Fix orphaned items using explicit admin-supplied resolution targets.
    """
    results = []
    risks_fixed = 0
    controls_fixed = 0
    kris_fixed = 0
    seen_orphan_ids: set[int] = set()

    for resolution in payload.resolutions:
        if resolution.orphan_id in seen_orphan_ids:
            raise HTTPException(status_code=400, detail=f"Duplicate orphan_id in request: {resolution.orphan_id}")
        seen_orphan_ids.add(resolution.orphan_id)
        try:
            context = await validate_resolution_context(
                db,
                orphan_id=resolution.orphan_id,
                new_owner_id=resolution.new_owner_id,
                department_id=resolution.department_id,
                target_risk_id=resolution.target_risk_id,
            )
        except OrphanResolutionConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        results.append(
            OrphanFixResult(
                orphan_id=context.orphan.id,
                item_type=context.orphan.item_type,
                item_id=context.orphan.item_id,
                applied=not payload.dry_run,
                new_owner_id=resolution.new_owner_id,
                department_id=context.target_department_id,
                target_risk_id=context.target_risk.id if context.target_risk else None,
            )
        )

        if context.orphan.item_type == "risk":
            risks_fixed += 1
        elif context.orphan.item_type == "control":
            controls_fixed += 1
        elif context.orphan.item_type == "kri":
            kris_fixed += 1

    if not payload.dry_run:
        for resolution in payload.resolutions:
            try:
                await OrphanedItemService.resolve_orphan(
                    db=db,
                    orphan_id=resolution.orphan_id,
                    new_owner_id=resolution.new_owner_id,
                    resolved_by_id=admin_user.id,
                    department_id=resolution.department_id,
                    target_risk_id=resolution.target_risk_id,
                )
            except OrphanResolutionConflict as exc:
                raise HTTPException(status_code=409, detail=str(exc)) from exc
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

    return OrphanFixResponse(
        message="Validated orphan remediation plan" if payload.dry_run else "Applied orphan remediation plan",
        dry_run=payload.dry_run,
        resolved_count=len(results),
        risks_fixed=risks_fixed,
        kris_fixed=kris_fixed,
        controls_fixed=controls_fixed,
        results=results,
    )
