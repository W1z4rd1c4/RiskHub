"""Notification API endpoints for listing and managing user notifications."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.permissions import can_resolve_approvals
from app.db.session import get_db
from app.models import User
from app.schemas.notification import (
    NotificationListResponse,
    NotificationPreferences,
    NotificationPreferencesUpdate,
)
from app.services._notification_inbox.lifecycle import (
    NotificationInboxOptions,
    count_notification_inbox_unread,
    list_notification_inbox,
    mark_all_notifications_read,
    mark_notification_read,
    read_notification_preferences,
    update_notification_preferences,
)
from app.services.kri_deadline_service import KRIDeadlineService

router = APIRouter()


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
    page = await list_notification_inbox(
        db,
        NotificationInboxOptions(
            actor=current_user,
            unread_only=unread_only,
            offset=skip,
            limit=limit,
        ),
    )
    return NotificationListResponse(
        items=page.items,
        total=page.total,
        skip=page.offset,
        limit=page.limit,
        unread_count=page.unread_count,
    )


@router.get("/unread/count")
async def get_unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> dict[str, int]:
    """
    Get count of unread notifications for badge display.
    """
    return {"count": await count_notification_inbox_unread(db, current_user)}


@router.get("/preferences", response_model=NotificationPreferences)
async def get_notification_preferences(
    current_user: User = Depends(deps.get_current_user),
):
    """Get current user's notification preferences."""
    return read_notification_preferences(current_user).preferences


@router.put("/preferences", response_model=NotificationPreferences)
async def put_notification_preferences(
    preferences: NotificationPreferencesUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Update current user's notification preferences."""
    outcome = await update_notification_preferences(db, actor=current_user, preferences=preferences)
    return outcome.preferences


@router.post("/{notification_id}/read")
async def mark_as_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> dict[str, int]:
    """
    Mark a single notification as read.
    Only the notification owner can mark it as read.
    Returns the updated unread count for immediate UI sync.
    """
    outcome = await mark_notification_read(db, notification_id=notification_id, actor=current_user)
    return {"unread_count": outcome.unread_count or 0}


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_as_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Mark all unread notifications as read for the current user.
    """
    await mark_all_notifications_read(db, current_user)


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
    from fastapi import HTTPException

    if not can_resolve_approvals(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions. Only Admin, CRO, or Risk Manager can trigger.",
        )

    result = await KRIDeadlineService.check_kri_deadlines(db)
    return {"status": "completed", "results": result}
