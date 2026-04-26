"""Tests for NotificationService."""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Department,
    Risk,
    User,
    Vendor,
)
from app.models.notification import Notification, NotificationType
from app.models.risk import RiskStatus
from app.models.role import Permission, Role, RolePermission
from app.models.user import AccessScope
from app.services.notification_creation_helpers import find_existing_notification, notification_type_is_enabled
from app.services.notification_service import NotificationService


def test_notification_type_is_enabled_defaults_and_respects_preferences(test_user: User):
    assert notification_type_is_enabled(None, NotificationType.APPROVAL_PENDING) is True

    test_user.notification_preferences = None
    assert notification_type_is_enabled(test_user, NotificationType.APPROVAL_PENDING) is True

    test_user.notification_preferences = {"approval_pending": False}
    assert notification_type_is_enabled(test_user, NotificationType.APPROVAL_PENDING) is False
    assert notification_type_is_enabled(test_user, NotificationType.APPROVAL_RESOLVED) is True


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
async def test_create_notification_once_reuses_existing_duplicate(db_session: AsyncSession, test_user: User):
    first = await NotificationService.create_notification_once(
        db=db_session,
        user_id=test_user.id,
        notification_type=NotificationType.KRI_OVERDUE,
        title="KRI overdue",
        message="Original message",
        resource_type="kri",
        resource_id=42,
    )
    second = await NotificationService.create_notification_once(
        db=db_session,
        user_id=test_user.id,
        notification_type=NotificationType.KRI_OVERDUE,
        title="KRI overdue again",
        message="Updated message",
        resource_type="kri",
        resource_id=42,
    )
    await db_session.commit()

    assert first is not None
    assert second is not None
    assert second.id == first.id
    assert second.message == "Original message"

    duplicate = await find_existing_notification(
        db_session,
        user_id=test_user.id,
        notification_type=NotificationType.KRI_OVERDUE,
        resource_type="kri",
        resource_id=42,
    )
    assert duplicate is not None
    assert duplicate.id == first.id


@pytest.mark.asyncio
async def test_vendor_notification_visibility_denial_blocks_creation(
    db_session: AsyncSession,
    test_user_employee: User,
    test_user: User,
):
    other_department = Department(name="Other Department", code="OTHER", description="Other department")
    db_session.add(other_department)
    await db_session.commit()
    await db_session.refresh(other_department)

    vendor = Vendor(
        name="Hidden Vendor",
        process="Hidden Process",
        department_id=other_department.id,
        outsourcing_owner_user_id=test_user.id,
        vendor_type="outsourcing",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=True,
        status="active",
    )
    db_session.add(vendor)
    await db_session.commit()
    await db_session.refresh(vendor)

    notification = await NotificationService.create_vendor_notification_if_visible(
        db=db_session,
        user=test_user_employee,
        vendor_id=vendor.id,
        notification_type=NotificationType.ISSUE_DUE_SOON,
        title="Vendor review due",
        message="Review vendor",
    )
    await db_session.commit()

    assert notification is None


@pytest.mark.asyncio
async def test_notify_approvers_creates_for_all_privileged(
    db_session: AsyncSession,
    test_user_employee: User,  # requester
    test_user_risk_manager: User,  # should get notification
    test_user_cro: User,  # should get notification
    test_user: User,  # admin - should get notification
    test_department,
):
    """Test that notify_approvers creates notifications for all privileged users."""
    risk = Risk(
        risk_id_code="R-APP-NOTIF-001",
        name="Approval Notification Risk",
        process="Process",
        description="desc",
        category="Test",
        department_id=test_department.id,
        owner_id=test_user_employee.id,
        risk_type="operational",
        status=RiskStatus.active.value,
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    # Create mock approval request
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
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

    # Should create notifications for admin, CRO, and risk_manager (3 privileged users), but not the requester.
    assert notifications
    assert all(n is not None for n in notifications)

    # All notifications should be APPROVAL_PENDING type
    for n in notifications:
        assert n.type == NotificationType.APPROVAL_PENDING
        assert "delete request" in n.title.lower()
        assert "R-001: Test Risk" in n.message

    notified_user_ids = {n.user_id for n in notifications}
    assert test_user_employee.id not in notified_user_ids
    assert test_user.id in notified_user_ids
    assert test_user_cro.id in notified_user_ids
    assert test_user_risk_manager.id in notified_user_ids


@pytest.mark.asyncio
async def test_notify_approvers_filters_recipients_without_risk_visibility(
    db_session: AsyncSession,
    test_user_employee: User,
    test_user: User,
    test_department,
):
    """
    Approver candidates are selected by approvals:write and global scope, but recipients must
    also be able to see the referenced object (e.g., risks:read for risk approvals).
    """
    # Create an approver-like user: global scope + approvals:write but no risks:read
    role = Role(name="approver_no_risk_read", display_name="Approver (no risks)", description=None)
    db_session.add(role)
    await db_session.commit()

    perm = Permission(resource="approvals", action="write", description="Approvals write")
    db_session.add(perm)
    await db_session.commit()
    await db_session.refresh(perm)
    db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await db_session.commit()

    user = User(
        name="Approver No Risk Read",
        email="approver_no_risk@test.com",
        department_id=test_department.id,
        role_id=role.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    # Ensure role permissions are loaded for has_permission checks during visibility evaluation
    user = (
        await db_session.execute(
            select(User)
            .options(selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission))
            .where(User.id == user.id)
        )
    ).scalar_one()

    risk = Risk(
        risk_id_code="R-APP-NOTIF-002",
        name="Approval Notification Risk 2",
        process="Process",
        description="desc",
        category="Test",
        department_id=test_department.id,
        owner_id=test_user_employee.id,
        risk_type="operational",
        status=RiskStatus.active.value,
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
        resource_name="R-002: Test Risk",
        action_type=ApprovalActionType.EDIT,
        requested_by_id=test_user_employee.id,
        reason="Test edit request",
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval)
    await db_session.commit()
    await db_session.refresh(approval)

    await NotificationService.notify_approvers(db_session, approval)
    await db_session.commit()

    # Admin should be notified (has *:*)
    admin_notif = (
        await db_session.execute(
            select(Notification).where(
                Notification.user_id == test_user.id,
                Notification.type == NotificationType.APPROVAL_PENDING,
                Notification.resource_id == approval.id,
            )
        )
    ).scalar_one_or_none()
    assert admin_notif is not None

    # Approver without risks:read must not be notified for a risk approval.
    blocked_notif = (
        await db_session.execute(
            select(Notification).where(
                Notification.user_id == user.id,
                Notification.type == NotificationType.APPROVAL_PENDING,
                Notification.resource_id == approval.id,
            )
        )
    ).scalar_one_or_none()
    assert blocked_notif is None


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


@pytest.mark.asyncio
async def test_notify_approvers_cancelled_creates_cancellation_notification(
    db_session: AsyncSession,
    test_user_employee: User,
    test_user: User,
    test_department,
):
    risk = Risk(
        risk_id_code="R-APP-NOTIF-003",
        name="Cancellation Notification Risk",
        process="Process",
        description="desc",
        category="Test",
        department_id=test_department.id,
        owner_id=test_user_employee.id,
        risk_type="operational",
        status=RiskStatus.active.value,
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
        resource_name="R-003: Test Risk",
        action_type=ApprovalActionType.DELETE,
        requested_by_id=test_user_employee.id,
        reason="Test deletion request",
        status=ApprovalStatus.CANCELLED,
    )
    db_session.add(approval)
    await db_session.commit()
    await db_session.refresh(approval)

    notifications = await NotificationService.notify_approvers_cancelled(
        db=db_session,
        approval=approval,
        cancelled_by_user=test_user_employee,
    )
    await db_session.commit()

    assert notifications
    assert test_user_employee.id not in {notification.user_id for notification in notifications}

    admin_notification = (
        await db_session.execute(
            select(Notification).where(
                Notification.user_id == test_user.id,
                Notification.type == NotificationType.APPROVAL_CANCELLED,
                Notification.resource_id == approval.id,
            )
        )
    ).scalar_one_or_none()
    assert admin_notification is not None
    assert admin_notification.title == "Request cancelled"
    assert "cancelled their delete request" in admin_notification.message
