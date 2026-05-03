"""Notification service for creating and managing in-app notifications."""

import logging
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.core.permissions import can_read_vendor_id
from app.models.approval_request import ApprovalRequest
from app.models.notification import Notification, NotificationType
from app.models.user import User
from app.services._notification_approval_helpers import (
    approval_action_label,
    eligible_approval_notification_recipients,
)
from app.services.notification_creation_helpers import (
    find_existing_notification,
    load_notification_recipient,
    notification_type_is_enabled,
)

logger = logging.getLogger(__name__)


class NotificationService:
    """Service for creating and managing notifications."""

    @staticmethod
    async def create_notification(
        db: AsyncSession,
        user_id: int,
        notification_type: NotificationType,
        title: str,
        message: str,
        resource_type: str | None = None,
        resource_id: int | None = None,
        skip_preference_check: bool = False,
        created_at: datetime | None = None,
    ) -> Notification | None:
        """
        Create a single notification for a user.

        Args:
            db: Database session
            user_id: ID of the user to notify
            notification_type: Type of notification
            title: Short title (max 255 chars)
            message: Full notification message
            resource_type: Optional resource type (risk, control, kri, approval)
            resource_id: Optional resource ID for navigation
            skip_preference_check: If True, skip user preference check (for critical notifications)

        Returns:
            Created Notification object, or None if user has disabled this type
        """
        # Check user preferences unless skipped
        if not skip_preference_check:
            user = await load_notification_recipient(db, user_id)
            if not notification_type_is_enabled(user, notification_type):
                logger.debug(f"Skipping notification {notification_type.value} for user {user_id} - disabled")
                return None

        notification = Notification(
            user_id=user_id,
            type=notification_type,
            title=title,
            message=message,
            resource_type=resource_type,
            resource_id=resource_id,
            created_at=created_at or utc_now(),
        )
        db.add(notification)
        await db.flush()  # Get ID without committing
        return notification

    @staticmethod
    async def create_notification_once(
        db: AsyncSession,
        *,
        user_id: int,
        notification_type: NotificationType,
        title: str,
        message: str,
        resource_type: str | None = None,
        resource_id: int | None = None,
        skip_preference_check: bool = False,
        created_at: datetime | None = None,
    ) -> Notification | None:
        """Create a notification only if an equivalent notification does not already exist."""
        duplicate = await find_existing_notification(
            db,
            user_id=user_id,
            notification_type=notification_type,
            resource_type=resource_type,
            resource_id=resource_id,
        )
        if duplicate is not None:
            return duplicate

        return await NotificationService.create_notification(
            db=db,
            user_id=user_id,
            notification_type=notification_type,
            title=title,
            message=message,
            resource_type=resource_type,
            resource_id=resource_id,
            skip_preference_check=skip_preference_check,
            created_at=created_at,
        )

    @staticmethod
    async def can_notify_vendor(db: AsyncSession, user: User, vendor_id: int) -> bool:
        """Vendor notification visibility gate (permission + scope + ownership)."""
        return await can_read_vendor_id(db, user, vendor_id)

    @staticmethod
    async def create_vendor_notification_if_visible(
        db: AsyncSession,
        *,
        user: User,
        vendor_id: int,
        notification_type: NotificationType,
        title: str,
        message: str,
        created_at: datetime | None = None,
        skip_preference_check: bool = False,
        visibility_cache: dict[tuple[int, int], bool] | None = None,
    ) -> Notification | None:
        """Create a vendor notification only when recipient can access the vendor."""
        cache_key = (user.id, vendor_id)
        visible = visibility_cache.get(cache_key) if visibility_cache is not None else None
        if visible is None:
            visible = await NotificationService.can_notify_vendor(db, user, vendor_id)
            if visibility_cache is not None:
                visibility_cache[cache_key] = visible
        if not visible:
            return None
        return await NotificationService.create_notification(
            db=db,
            user_id=user.id,
            notification_type=notification_type,
            title=title,
            message=message,
            resource_type="vendor",
            resource_id=vendor_id,
            skip_preference_check=skip_preference_check,
            created_at=created_at,
        )

    @staticmethod
    async def notify_approvers(
        db: AsyncSession,
        approval: ApprovalRequest,
        *,
        strict_errors: bool = False,
    ) -> list[Notification]:
        """
        Notify all users who can approve requests about a new pending approval.

        Args:
            db: Database session
            approval: The newly created approval request

        Returns:
            List of created Notification objects
        """
        notifications = []
        action_label = approval_action_label(approval)
        recipients, skipped = await eligible_approval_notification_recipients(
            db,
            approval,
            exclude_user_id=approval.requested_by_id,
        )

        for approver in recipients:
            try:
                notification = await NotificationService.create_notification_once(
                    db=db,
                    user_id=approver.id,
                    notification_type=NotificationType.APPROVAL_PENDING,
                    title=f"New {action_label} request",
                    message=(
                        f"New {action_label} request for {approval.resource_type.value} "
                        f"'{approval.resource_name}' requires your review."
                    ),
                    resource_type="approval",
                    resource_id=approval.id,
                )
                if notification:
                    notifications.append(notification)
            except Exception as e:
                if strict_errors:
                    raise
                logger.error(f"Failed to create notification for approver {approver.id}: {e}")
                # Continue creating notifications for other approvers

        logger.info(
            "Created %s approval pending notifications for approval %s; skipped=%s",
            len(notifications),
            approval.id,
            skipped,
        )
        return notifications

    @staticmethod
    async def notify_requester_resolved(
        db: AsyncSession,
        approval: ApprovalRequest,
        approved: bool,
        *,
        strict_errors: bool = False,
    ) -> Notification | None:
        """
        Notify the original requester that their approval was resolved.

        Args:
            db: Database session
            approval: The resolved approval request
            approved: True if approved, False if rejected

        Returns:
            Created Notification object, or None if creation failed
        """
        action_label = approval_action_label(approval)
        status_label = "approved" if approved else "rejected"

        try:
            title = f"Request {status_label}"
            message = (
                f"Your {action_label} request for {approval.resource_type.value} "
                f"'{approval.resource_name}' was {status_label}."
            )

            # Add resolution notes if present
            if approval.resolution_notes:
                message += f" Note: {approval.resolution_notes}"

            notification = await NotificationService.create_notification_once(
                db=db,
                user_id=approval.requested_by_id,
                notification_type=NotificationType.APPROVAL_RESOLVED,
                title=title,
                message=message,
                resource_type="approval",
                resource_id=approval.id,
            )

            logger.info(f"Created resolution notification for requester {approval.requested_by_id}")
            return notification

        except Exception as e:
            if strict_errors:
                raise
            logger.error(f"Failed to create resolution notification for requester {approval.requested_by_id}: {e}")
            return None

    @staticmethod
    async def notify_approvers_cancelled(
        db: AsyncSession,
        approval: ApprovalRequest,
        cancelled_by_user: User,
        *,
        strict_errors: bool = False,
    ) -> list[Notification]:
        """
        Notify approvers that a pending approval request was cancelled by the requester.

        Args:
            db: Database session
            approval: The cancelled approval request
            cancelled_by_user: The user who cancelled the request

        Returns:
            List of created Notification objects
        """
        notifications = []
        action_label = approval_action_label(approval)
        recipients, skipped = await eligible_approval_notification_recipients(
            db,
            approval,
            exclude_user_id=cancelled_by_user.id,
        )

        for approver in recipients:
            try:
                notification = await NotificationService.create_notification_once(
                    db=db,
                    user_id=approver.id,
                    notification_type=NotificationType.APPROVAL_CANCELLED,
                    title="Request cancelled",
                    message=(
                        f"{cancelled_by_user.name} cancelled their {action_label} request for "
                        f"{approval.resource_type.value} '{approval.resource_name}'."
                    ),
                    resource_type="approval",
                    resource_id=approval.id,
                )
                if notification:
                    notifications.append(notification)
            except Exception as e:
                if strict_errors:
                    raise
                logger.error(f"Failed to create cancellation notification for approver {approver.id}: {e}")
                # Continue creating notifications for other approvers

        logger.info(
            "Created %s cancellation notifications for approval %s; skipped=%s",
            len(notifications),
            approval.id,
            skipped,
        )
        return notifications
