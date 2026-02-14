"""Notification service for creating and managing in-app notifications."""
import logging
from datetime import UTC, datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import can_read_control_id, can_read_kri_id, can_read_risk_id, can_read_vendor_id
from app.models.approval_request import ApprovalRequest, ApprovalResourceType
from app.models.notification import Notification, NotificationType
from app.models.role import Permission, Role, RolePermission
from app.models.user import AccessScope, User

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
            user_result = await db.execute(select(User).where(User.id == user_id))
            user = user_result.scalar_one_or_none()
            if user and user.notification_preferences:
                type_key = notification_type.value  # e.g., "approval_pending"
                if not user.notification_preferences.get(type_key, True):
                    logger.debug(f"Skipping notification {notification_type.value} for user {user_id} - disabled")
                    return None
        
        notification = Notification(
            user_id=user_id,
            type=notification_type,
            title=title,
            message=message,
            resource_type=resource_type,
            resource_id=resource_id,
            created_at=created_at or datetime.now(UTC),
        )
        db.add(notification)
        await db.flush()  # Get ID without committing
        return notification

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
    ) -> list[Notification]:
        """
        Notify all users who can approve requests about a new pending approval.
        
        Args:
            db: Database session
            approval: The newly created approval request
            
        Returns:
            List of created Notification objects
        """
        permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
        candidates_stmt = (
            select(User)
            .join(Role, User.role_id == Role.id)
            .join(RolePermission, RolePermission.role_id == Role.id)
            .join(Permission, RolePermission.permission_id == Permission.id)
            .where(
                User.is_active == True,
                User.access_scope == AccessScope.GLOBAL,  # only privileged approvers
                or_(
                    (Permission.resource.in_(("approvals", "*")) & Permission.action.in_(("write", "*"))),
                ),
            )
            .options(permission_load)
            .distinct()
        )
        candidates = (await db.execute(candidates_stmt)).scalars().all()
        
        notifications = []
        action_label = "delete" if approval.action_type.value == "delete" else "edit"
        
        for approver in candidates:
            # Don't notify the requester themselves if they're an approver
            if approver.id == approval.requested_by_id:
                continue

            # Visibility filter: never notify users who can't see the referenced object (prevents cross-scope leaks).
            visible = False
            if approval.resource_type == ApprovalResourceType.RISK:
                visible = await can_read_risk_id(db, approver, approval.resource_id)
            elif approval.resource_type == ApprovalResourceType.CONTROL:
                visible = await can_read_control_id(db, approver, approval.resource_id)
            elif approval.resource_type == ApprovalResourceType.KRI:
                visible = await can_read_kri_id(db, approver, approval.resource_id)
            else:
                visible = False

            if not visible:
                continue
                
            try:
                notification = await NotificationService.create_notification(
                    db=db,
                    user_id=approver.id,
                    notification_type=NotificationType.APPROVAL_PENDING,
                    title=f"New {action_label} request",
                    message=f"New {action_label} request for {approval.resource_type.value} '{approval.resource_name}' requires your review.",
                    resource_type="approval",
                    resource_id=approval.id,
                )
                if notification:
                    notifications.append(notification)
            except Exception as e:
                logger.error(f"Failed to create notification for approver {approver.id}: {e}")
                # Continue creating notifications for other approvers
        
        logger.info(f"Created {len(notifications)} approval pending notifications for approval {approval.id}")
        return notifications
    
    @staticmethod
    async def notify_requester_resolved(
        db: AsyncSession,
        approval: ApprovalRequest,
        approved: bool,
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
        action_label = "delete" if approval.action_type.value == "delete" else "edit"
        status_label = "approved" if approved else "rejected"
        
        try:
            title = f"Request {status_label}"
            message = f"Your {action_label} request for {approval.resource_type.value} '{approval.resource_name}' was {status_label}."
            
            # Add resolution notes if present
            if approval.resolution_notes:
                message += f" Note: {approval.resolution_notes}"
            
            notification = await NotificationService.create_notification(
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
            logger.error(f"Failed to create resolution notification for requester {approval.requested_by_id}: {e}")
            return None
    
    @staticmethod
    async def notify_approvers_cancelled(
        db: AsyncSession,
        approval: ApprovalRequest,
        cancelled_by_user: User,
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
        permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
        candidates_stmt = (
            select(User)
            .join(Role, User.role_id == Role.id)
            .join(RolePermission, RolePermission.role_id == Role.id)
            .join(Permission, RolePermission.permission_id == Permission.id)
            .where(
                User.is_active == True,
                User.access_scope == AccessScope.GLOBAL,  # only privileged approvers
                or_(
                    (Permission.resource.in_(("approvals", "*")) & Permission.action.in_(("write", "*"))),
                ),
            )
            .options(permission_load)
            .distinct()
        )
        candidates = (await db.execute(candidates_stmt)).scalars().all()
        
        notifications = []
        action_label = "delete" if approval.action_type.value == "delete" else "edit"
        
        for approver in candidates:
            # Don't notify the user who cancelled
            if approver.id == cancelled_by_user.id:
                continue

            visible = False
            if approval.resource_type == ApprovalResourceType.RISK:
                visible = await can_read_risk_id(db, approver, approval.resource_id)
            elif approval.resource_type == ApprovalResourceType.CONTROL:
                visible = await can_read_control_id(db, approver, approval.resource_id)
            elif approval.resource_type == ApprovalResourceType.KRI:
                visible = await can_read_kri_id(db, approver, approval.resource_id)
            else:
                visible = False

            if not visible:
                continue
                
            try:
                notification = await NotificationService.create_notification(
                    db=db,
                    user_id=approver.id,
                    notification_type=NotificationType.APPROVAL_CANCELLED,
                    title="Request cancelled",
                    message=f"{cancelled_by_user.name} cancelled their {action_label} request for {approval.resource_type.value} '{approval.resource_name}'.",
                    resource_type="approval",
                    resource_id=approval.id,
                )
                if notification:
                    notifications.append(notification)
            except Exception as e:
                logger.error(f"Failed to create cancellation notification for approver {approver.id}: {e}")
                # Continue creating notifications for other approvers
        
        logger.info(f"Created {len(notifications)} cancellation notifications for approval {approval.id}")
        return notifications
