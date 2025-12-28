"""Tests for notification API endpoints."""
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.notification_service import NotificationService
from app.models.notification import NotificationType


@pytest.mark.asyncio
async def test_list_notifications_empty(auth_client: AsyncClient):
    """Test that empty list is returned for user with no notifications."""
    response = await auth_client.get("/api/v1/notifications")
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["unread_count"] == 0


@pytest.mark.asyncio
async def test_list_notifications_returns_user_own(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_user,
):
    """Test that user only sees their own notifications."""
    # Create notification for test_user
    await NotificationService.create_notification(
        db=db_session,
        user_id=test_user.id,
        notification_type=NotificationType.APPROVAL_PENDING,
        title="Test Notification",
        message="Test message",
    )
    await db_session.commit()
    
    response = await auth_client.get("/api/v1/notifications")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["title"] == "Test Notification"
    assert data["total"] == 1


@pytest.mark.asyncio
async def test_unread_count(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_user,
):
    """Test unread count endpoint."""
    # Create 2 unread notifications
    for i in range(2):
        await NotificationService.create_notification(
            db=db_session,
            user_id=test_user.id,
            notification_type=NotificationType.APPROVAL_PENDING,
            title=f"Notification {i}",
            message="Message",
        )
    await db_session.commit()
    
    response = await auth_client.get("/api/v1/notifications/unread/count")
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 2


@pytest.mark.asyncio
async def test_mark_as_read(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_user,
):
    """Test marking a notification as read."""
    notification = await NotificationService.create_notification(
        db=db_session,
        user_id=test_user.id,
        notification_type=NotificationType.APPROVAL_RESOLVED,
        title="Read This",
        message="Message",
    )
    await db_session.commit()
    
    # Mark as read
    response = await auth_client.post(f"/api/v1/notifications/{notification.id}/read")
    assert response.status_code == 204
    
    # Verify unread count is now 0
    count_response = await auth_client.get("/api/v1/notifications/unread/count")
    assert count_response.json()["count"] == 0


@pytest.mark.asyncio
async def test_mark_as_read_not_found(auth_client: AsyncClient):
    """Test 404 for non-existent notification."""
    response = await auth_client.post("/api/v1/notifications/99999/read")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_mark_as_read_not_owner(
    db_session: AsyncSession,
    auth_client: AsyncClient,  # admin user
    test_user_employee,  # different user
):
    """Test 404 when accessing another user's notification."""
    # Create notification for employee (not the auth_client user)
    notification = await NotificationService.create_notification(
        db=db_session,
        user_id=test_user_employee.id,
        notification_type=NotificationType.APPROVAL_PENDING,
        title="Employee Only",
        message="Message",
    )
    await db_session.commit()
    
    # Try to mark as read with admin client - should fail with 404
    response = await auth_client.post(f"/api/v1/notifications/{notification.id}/read")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_mark_all_as_read(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_user,
):
    """Test marking all notifications as read."""
    # Create 3 unread notifications
    for i in range(3):
        await NotificationService.create_notification(
            db=db_session,
            user_id=test_user.id,
            notification_type=NotificationType.KRI_DUE_SOON,
            title=f"Notification {i}",
            message="Message",
        )
    await db_session.commit()
    
    # Verify 3 unread
    count_response = await auth_client.get("/api/v1/notifications/unread/count")
    assert count_response.json()["count"] == 3
    
    # Mark all as read
    response = await auth_client.post("/api/v1/notifications/read-all")
    assert response.status_code == 204
    
    # Verify 0 unread
    count_response = await auth_client.get("/api/v1/notifications/unread/count")
    assert count_response.json()["count"] == 0
