"""Tests for notification preferences API and service integration."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import NotificationType
from app.models.user import User
from app.services.notification_service import NotificationService


class TestNotificationPreferencesAPI:
    """Tests for /api/v1/notifications/preferences endpoints."""

    @pytest.mark.asyncio
    async def test_get_preferences_default(self, client: AsyncClient, test_user: User, auth_headers: dict):
        """Returns all True when user has no preferences set."""
        response = await client.get(
            "/api/v1/notifications/preferences",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()

        # All should default to True
        assert data["approval_pending"] is True
        assert data["approval_resolved"] is True
        assert data["kri_due_soon"] is True
        assert data["kri_due_tomorrow"] is True
        assert data["kri_overdue"] is True
        assert data["kri_near_breach"] is True
        assert data["kri_breach_detected"] is True

    @pytest.mark.asyncio
    async def test_update_preferences_partial(
        self, client: AsyncClient, db_session: AsyncSession, test_user: User, auth_headers: dict
    ):
        """Updates only specified fields, preserves others."""
        # Disable one preference
        response = await client.put(
            "/api/v1/notifications/preferences",
            headers=auth_headers,
            json={"approval_pending": False},
        )
        assert response.status_code == 200
        data = response.json()

        # Updated field should be False
        assert data["approval_pending"] is False
        # Others should still be True
        assert data["approval_resolved"] is True
        assert data["kri_due_soon"] is True

        # Verify persisted in DB
        await db_session.refresh(test_user)
        assert test_user.notification_preferences is not None
        assert test_user.notification_preferences.get("approval_pending") is False


class TestNotificationServicePreferences:
    """Tests for NotificationService preference enforcement."""

    @pytest.mark.asyncio
    async def test_notification_skipped_when_disabled(self, db_session: AsyncSession, test_user: User):
        """Disabling a type prevents notification creation."""
        # Set preference to disable approval_pending
        test_user.notification_preferences = {"approval_pending": False}
        await db_session.commit()
        await db_session.refresh(test_user)

        # Try to create notification for disabled type
        notification = await NotificationService.create_notification(
            db=db_session,
            user_id=test_user.id,
            notification_type=NotificationType.APPROVAL_PENDING,
            title="Test notification",
            message="This should be skipped",
        )

        # Should return None (skipped)
        assert notification is None

    @pytest.mark.asyncio
    async def test_notification_created_when_enabled(self, db_session: AsyncSession, test_user: User):
        """Enabled types still create notifications."""
        # Set preference to enable approval_pending
        test_user.notification_preferences = {"approval_pending": True}
        await db_session.commit()
        await db_session.refresh(test_user)

        # Create notification for enabled type
        notification = await NotificationService.create_notification(
            db=db_session,
            user_id=test_user.id,
            notification_type=NotificationType.APPROVAL_PENDING,
            title="Test notification",
            message="This should be created",
        )

        # Should return notification object
        assert notification is not None
        assert notification.id is not None
        assert notification.title == "Test notification"

    @pytest.mark.asyncio
    async def test_notification_created_when_no_preferences(self, db_session: AsyncSession, test_user: User):
        """Default behavior (no preferences set) creates notifications."""
        # Ensure no preferences set
        test_user.notification_preferences = None
        await db_session.commit()
        await db_session.refresh(test_user)

        # Create notification
        notification = await NotificationService.create_notification(
            db=db_session,
            user_id=test_user.id,
            notification_type=NotificationType.KRI_OVERDUE,
            title="KRI Overdue",
            message="Your KRI is overdue",
        )

        # Should create notification (default is enabled)
        assert notification is not None
        assert notification.id is not None
