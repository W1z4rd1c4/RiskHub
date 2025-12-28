"""Notification API endpoints for listing and managing user notifications."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models import User
from app.models.notification import Notification
from app.schemas.notification import NotificationRead, NotificationListResponse
from app.api import deps
from app.core.permissions import can_resolve_approvals
from app.services.kri_deadline_service import KRIDeadlineService

router = APIRouter()


def _build_notification_read(notification: Notification) -> dict:
    """Build NotificationRead dict from model."""
    return {
        "id": notification.id,
        "type": notification.type.value,
        "title": notification.title,
        "message": notification.message,
        "resource_type": notification.resource_type,
        "resource_id": notification.resource_id,
        "is_read": notification.is_read,
        "created_at": notification.created_at,
        "expires_at": notification.expires_at,
    }


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    unread_only: bool = Query(False),
):
    """
    List notifications for the current user.
    Ordered by created_at DESC (newest first).
    """
    # Base query for user's notifications
    base_query = select(Notification).where(Notification.user_id == current_user.id)
    
    # Filter unread only if requested
    if unread_only:
        base_query = base_query.where(Notification.is_read == False)
    
    # Count total
    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # Count unread (always returned regardless of filter)
    unread_count_query = select(func.count()).where(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    )
    unread_result = await db.execute(unread_count_query)
    unread_count = unread_result.scalar() or 0
    
    # Fetch with pagination
    query = base_query.offset(skip).limit(limit).order_by(Notification.created_at.desc())
    result = await db.execute(query)
    notifications = result.scalars().all()
    
    return NotificationListResponse(
        items=[_build_notification_read(n) for n in notifications],
        total=total,
        skip=skip,
        limit=limit,
        unread_count=unread_count,
    )


@router.get("/unread/count")
async def get_unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> dict[str, int]:
    """
    Get count of unread notifications for badge display.
    """
    result = await db.execute(
        select(func.count()).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False
        )
    )
    count = result.scalar() or 0
    return {"count": count}


@router.post("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_as_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Mark a single notification as read.
    Only the notification owner can mark it as read.
    """
    result = await db.execute(
        select(Notification).where(Notification.id == notification_id)
    )
    notification = result.scalar_one_or_none()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    # Security: only owner can mark as read
    if notification.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notification.is_read = True
    await db.commit()


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_as_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Mark all unread notifications as read for the current user.
    """
    await db.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read == False
        )
        .values(is_read=True)
    )
    await db.commit()


@router.post("/trigger-kri-check", status_code=status.HTTP_200_OK)
async def trigger_kri_deadline_check(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Manually trigger KRI deadline check.
    Admin, CRO, and Risk Manager only.
    Useful for testing without waiting for scheduled job.
    """
    if not can_resolve_approvals(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions. Only Admin, CRO, or Risk Manager can trigger."
        )
    
    result = await KRIDeadlineService.check_kri_deadlines(db)
    return {"status": "completed", "results": result}

