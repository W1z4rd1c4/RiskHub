"""Orphaned items API endpoints for governance."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.permissions import can_manage_users, ensure_business_view_access
from app.core.scheduler import execute_tracked_job_with_session
from app.core.ttl_cache import TTLCache
from app.db.session import get_db
from app.models import User
from app.models.scheduler_job_run import SchedulerJobRun
from app.schemas.orphaned_item import (
    OrphanedItemDetail,
    OrphanedItemResolve,
    OrphanedItemsOverview,
    OrphanedItemStats,
    OrphanScanResponse,
)
from app.services.orphaned_item_service import OrphanedItemService

logger = logging.getLogger(__name__)

router = APIRouter()
ORPHAN_OVERVIEW_CACHE = TTLCache[dict](ttl_seconds=15, max_entries=500)


async def _get_latest_orphan_scan(db: AsyncSession) -> SchedulerJobRun | None:
    return (
        await db.execute(
            select(SchedulerJobRun)
            .where(SchedulerJobRun.job_name == "orphan_scan")
            .order_by(SchedulerJobRun.started_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def _run_manual_orphan_scan(db: AsyncSession) -> dict[str, int]:
    return {"flagged": await OrphanedItemService.scan_uncategorised_items(db)}


def _require_governance_operator(current_user: User) -> None:
    """Check that user may operate Governance business workflows."""
    ensure_business_view_access(current_user, detail="Platform admins cannot access Governance business data")
    if not can_manage_users(current_user):
        raise HTTPException(status_code=403, detail="Insufficient permissions")


@router.get("/", response_model=list[OrphanedItemDetail])
async def list_orphaned_items(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    item_type: str | None = Query(None, description="Filter by item type: risk, control"),
    status: str = Query("pending", description="Filter by status: pending, resolved"),
):
    """
    List orphaned items requiring administrative attention.

    Returns orphaned risks/controls with details about the item and previous owner.
    CRO or delegated governance owner required.
    """
    _require_governance_operator(current_user)

    orphans = await OrphanedItemService.get_pending_orphans_with_details(
        db=db,
        item_type=item_type,
        status=status,
    )
    return orphans


@router.post("/scan", response_model=OrphanScanResponse)
async def scan_orphaned_items(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Refresh orphan list by scanning the Uncategorised department.

    CRO or delegated governance owner required.
    """
    _require_governance_operator(current_user)
    result = await execute_tracked_job_with_session(
        db,
        "orphan_scan",
        lambda session: _run_manual_orphan_scan(session),
        trigger_type="manual",
    )
    flagged = int((result or {}).get("flagged", 0))
    return OrphanScanResponse(flagged=flagged)


@router.get("/overview", response_model=OrphanedItemsOverview)
async def get_orphaned_items_overview(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    item_type: str | None = Query(None, description="Filter by item type: risk, control, kri"),
    status: str = Query("pending", description="Filter by status: pending, resolved"),
):
    """Get governance overview payload without triggering a scan."""
    _require_governance_operator(current_user)
    cache_key = (
        current_user.id,
        getattr(current_user.access_scope, "value", str(current_user.access_scope)),
        current_user.department_id,
        getattr(getattr(current_user, "role", None), "name", None),
        item_type,
        status,
    )
    cached = ORPHAN_OVERVIEW_CACHE.get(cache_key)
    if cached is not None:
        return OrphanedItemsOverview(**cached)

    stats = await OrphanedItemService.get_orphan_stats(db, current_user=current_user)
    items = await OrphanedItemService.get_pending_orphans_with_details(
        db=db,
        item_type=item_type,
        status=status,
    )
    last_scan = await _get_latest_orphan_scan(db)
    payload = {
        "stats": OrphanedItemStats(**stats).model_dump(),
        "items": items,
        "last_scan_at": last_scan.started_at.isoformat() if last_scan else None,
        "scan_status": last_scan.status if last_scan else None,
    }
    return OrphanedItemsOverview(**ORPHAN_OVERVIEW_CACHE.set(cache_key, payload))


@router.get("/stats", response_model=OrphanedItemStats)
async def get_orphan_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Get statistics about orphaned items.

    Returns counts by type and status for dashboard widgets.
    """
    ensure_business_view_access(current_user, detail="Platform admins cannot access Governance business data")
    stats = await OrphanedItemService.get_orphan_stats(db, current_user=current_user)
    return OrphanedItemStats(**stats)


@router.get("/{orphan_id}", response_model=OrphanedItemDetail)
async def get_orphan_detail(
    orphan_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Get detailed information about a specific orphaned item.

    CRO or delegated governance owner required.
    """
    _require_governance_operator(current_user)

    orphan = await OrphanedItemService.get_orphan_detail(db, orphan_id)
    if not orphan:
        raise HTTPException(status_code=404, detail="Orphaned item not found")

    return orphan


@router.post("/{orphan_id}/resolve")
async def resolve_orphan(
    orphan_id: int,
    body: OrphanedItemResolve,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Resolve an orphaned item by assigning a new owner.

    Updates the underlying risk/control's owner and marks the orphan as resolved.
    CRO or delegated governance owner required.
    """
    _require_governance_operator(current_user)

    try:
        orphan = await OrphanedItemService.resolve_orphan(
            db=db,
            orphan_id=orphan_id,
            new_owner_id=body.new_owner_id,
            resolved_by_id=current_user.id,
            department_id=body.department_id,
            target_risk_id=body.target_risk_id,
        )

        return {
            "status": "resolved",
            "orphan_id": orphan.id,
            "new_owner_id": body.new_owner_id,
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
