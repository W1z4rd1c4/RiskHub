"""Orphaned items API endpoints for governance."""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.permissions import can_manage_users
from app.db.session import get_db
from app.models import User
from app.services.orphaned_item_service import OrphanedItemService
from app.schemas.orphaned_item import (
    OrphanedItemRead,
    OrphanedItemDetail,
    OrphanedItemResolve,
    OrphanedItemStats,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _require_admin_or_cro(current_user: User) -> None:
    """Check that user has admin or CRO role."""
    if not can_manage_users(current_user):
        from app.models.role import RoleType
        if not current_user.role or current_user.role.name not in (RoleType.CRO, RoleType.ADMIN):
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
    Admin or CRO role required.
    """
    _require_admin_or_cro(current_user)
    
    # Refresh orphans list by scanning Uncategorised department
    try:
        await OrphanedItemService.scan_uncategorised_items(db)
    except Exception as e:
        logger.error(f"Failed to scan uncategorised items: {e}")
    
    orphans = await OrphanedItemService.get_pending_orphans_with_details(
        db=db,
        item_type=item_type,
        status=status,
    )
    return orphans


@router.get("/stats", response_model=OrphanedItemStats)
async def get_orphan_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Get statistics about orphaned items.
    
    Returns counts by type and status for dashboard widgets.
    Any authenticated user can view stats.
    """
    stats = await OrphanedItemService.get_orphan_stats(db)
    return OrphanedItemStats(**stats)


@router.get("/{orphan_id}", response_model=OrphanedItemDetail)
async def get_orphan_detail(
    orphan_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Get detailed information about a specific orphaned item.
    
    Admin or CRO role required.
    """
    _require_admin_or_cro(current_user)
    
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
    Admin role required.
    """
    if not can_manage_users(current_user):
        raise HTTPException(status_code=403, detail="Admin role required")
    
    try:
        orphan = await OrphanedItemService.resolve_orphan(
            db=db,
            orphan_id=orphan_id,
            new_owner_id=body.new_owner_id,
            resolved_by_id=current_user.id,
            department_id=body.department_id,
        )
        
        return {
            "status": "resolved",
            "orphan_id": orphan.id,
            "new_owner_id": body.new_owner_id,
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
