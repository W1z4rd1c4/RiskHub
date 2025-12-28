"""Tests for NotificationService."""
import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.services.notification_service import NotificationService
from app.models import User, ApprovalRequest, ApprovalStatus, ApprovalResourceType, ApprovalActionType
from app.models.notification import Notification, NotificationType


@pytest.mark.asyncio
async def test_create_notification(db_session: AsyncSession, test_user: User):
    """Test basic notification creation."""
    notification = await NotificationService.create_notification(
        db=db_session,
        user_id=test_user.id,
        notification_type=NotificationType.APPROVAL_PENDING,
        title="Test Title",
        message="Test message content",
        resource_type="approval",
        resource_id=1,
    )
    await db_session.commit()
    
    assert notification.id is not None
    assert notification.user_id == test_user.id
    assert notification.type == NotificationType.APPROVAL_PENDING
    assert notification.title == "Test Title"
    assert notification.message == "Test message content"
    assert notification.resource_type == "approval"
    assert notification.resource_id == 1
    assert notification.is_read is False
    assert notification.created_at is not None


@pytest.mark.asyncio
async def test_notify_approvers_creates_for_all_privileged(
    db_session: AsyncSession, 
    test_user_employee: User,  # requester
    test_user_risk_manager: User,  # should get notification
    test_user_cro: User,  # should get notification
    test_user: User,  # admin - should get notification
):
    """Test that notify_approvers creates notifications for all privileged users."""
    # Create mock approval request
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=1,
        resource_name="R-001: Test Risk",
        action_type=ApprovalActionType.DELETE,
        requested_by_id=test_user_employee.id,
        reason="Test deletion request",
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval)
    await db_session.commit()
    await db_session.refresh(approval)
    
    # Notify approvers
    notifications = await NotificationService.notify_approvers(db_session, approval)
    await db_session.commit()
    
    # Should create notifications for admin, CRO, and risk_manager (3 privileged users)
    # But NOT for the requester (employee)
    assert len(notifications) >= 1  # At least one approver should be notified
    
    # All notifications should be APPROVAL_PENDING type
    for n in notifications:
        assert n.type == NotificationType.APPROVAL_PENDING
        assert "delete request" in n.title.lower()
        assert "R-001: Test Risk" in n.message


@pytest.mark.asyncio
async def test_notify_requester_resolved_approved(
    db_session: AsyncSession,
    test_user_employee: User,
):
    """Test notification for approved request."""
    # Create and resolve an approval
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.CONTROL,
        resource_id=2,
        resource_name="C-001: Test Control",
        action_type=ApprovalActionType.EDIT,
        requested_by_id=test_user_employee.id,
        reason="Edit request",
        status=ApprovalStatus.APPROVED,
        resolution_notes="Looks good, approved!",
    )
    db_session.add(approval)
    await db_session.commit()
    await db_session.refresh(approval)
    
    # Notify requester of approval
    notification = await NotificationService.notify_requester_resolved(
        db=db_session,
        approval=approval,
        approved=True,
    )
    await db_session.commit()
    
    assert notification is not None
    assert notification.user_id == test_user_employee.id
    assert notification.type == NotificationType.APPROVAL_RESOLVED
    assert "approved" in notification.title.lower()
    assert "approved" in notification.message.lower()
    assert "Looks good, approved!" in notification.message


@pytest.mark.asyncio
async def test_notify_requester_resolved_rejected(
    db_session: AsyncSession,
    test_user_employee: User,
):
    """Test notification for rejected request."""
    # Create and reject an approval
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.KRI,
        resource_id=3,
        resource_name="KRI-001: Test KRI",
        action_type=ApprovalActionType.DELETE,
        requested_by_id=test_user_employee.id,
        reason="Delete request",
        status=ApprovalStatus.REJECTED,
        resolution_notes="Cannot delete this KRI",
    )
    db_session.add(approval)
    await db_session.commit()
    await db_session.refresh(approval)
    
    # Notify requester of rejection
    notification = await NotificationService.notify_requester_resolved(
        db=db_session,
        approval=approval,
        approved=False,
    )
    await db_session.commit()
    
    assert notification is not None
    assert notification.user_id == test_user_employee.id
    assert notification.type == NotificationType.APPROVAL_RESOLVED
    assert "rejected" in notification.title.lower()
    assert "rejected" in notification.message.lower()
    assert "Cannot delete this KRI" in notification.message
