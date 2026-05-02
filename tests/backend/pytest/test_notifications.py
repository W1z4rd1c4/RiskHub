"""Tests for notification API endpoints."""

from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.models import (
    ApprovalRequest,
    Department,
    Issue,
    Permission,
    Risk,
    RiskQuestionnaire,
    Role,
    RolePermission,
    User,
)
from app.models.approval_request import ApprovalActionType, ApprovalResourceType, ApprovalStatus
from app.models.notification import NotificationType
from app.models.risk import RiskStatus
from app.models.risk_questionnaire import RiskQuestionnaireStatus
from app.models.user import AccessScope
from app.services.notification_service import NotificationService


def _headers_for(user) -> dict[str, str]:
    return {"X-Mock-User-Id": str(user.id)}


async def _create_hidden_risk_for_employee(
    db_session: AsyncSession,
    *,
    owner_id: int,
) -> Risk:
    hidden_department = Department(
        name="Notification Hidden Department",
        code="NOTIF-HIDDEN",
        description="Out-of-scope notification test department",
    )
    db_session.add(hidden_department)
    await db_session.flush()

    risk = Risk(
        risk_id_code="R-NOTIF-HIDDEN-001",
        name="Hidden Notification Risk",
        process="Operations",
        description="Out-of-scope linked resource",
        category="Operational",
        department_id=hidden_department.id,
        owner_id=owner_id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.flush()
    return risk


async def _create_manager_scoped_user(
    db_session: AsyncSession,
    *,
    manager_id: int,
    role_id: int,
) -> User:
    user = User(
        name="Manager Scoped Notification User",
        email="manager.scoped.notifications@test.com",
        department_id=None,
        manager_id=manager_id,
        role_id=role_id,
        is_active=True,
        access_scope=AccessScope.MANAGER,
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def _create_issue_for_notifications(
    db_session: AsyncSession,
    *,
    department_id: int,
    owner_user_id: int | None,
    created_by_id: int | None,
    title: str = "Notification issue",
) -> Issue:
    issue = Issue(
        title=title,
        description="Issue linked to a notification visibility test",
        severity="medium",
        status="open",
        source_type="manual",
        department_id=department_id,
        owner_user_id=owner_user_id,
        created_by_id=created_by_id,
    )
    db_session.add(issue)
    await db_session.flush()
    return issue


async def _grant_issues_read(db_session: AsyncSession, role: Role) -> None:
    permission = Permission(resource="issues", action="read", description="Read issues")
    db_session.add(permission)
    await db_session.flush()
    db_session.add(RolePermission(role_id=role.id, permission_id=permission.id))
    await db_session.commit()
    db_session.expire(role, ["permissions"])


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
async def test_list_notifications_filters_linked_resources_without_current_visibility(
    db_session: AsyncSession,
    client: AsyncClient,
    test_user_cro,
    test_user_employee,
):
    hidden_risk = await _create_hidden_risk_for_employee(
        db_session,
        owner_id=test_user_cro.id,
    )
    await NotificationService.create_notification(
        db=db_session,
        user_id=test_user_employee.id,
        notification_type=NotificationType.KRI_DUE_SOON,
        title="Generic reminder",
        message="Visible user-owned reminder",
    )
    await NotificationService.create_notification(
        db=db_session,
        user_id=test_user_employee.id,
        notification_type=NotificationType.APPROVAL_PENDING,
        title="Hidden linked risk",
        message="This linked resource is no longer visible",
        resource_type="risk",
        resource_id=hidden_risk.id,
    )
    await db_session.commit()

    response = await client.get("/api/v1/notifications", headers=_headers_for(test_user_employee))

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["unread_count"] == 1
    assert [item["title"] for item in data["items"]] == ["Generic reminder"]

    count_response = await client.get("/api/v1/notifications/unread/count", headers=_headers_for(test_user_employee))
    assert count_response.status_code == 200
    assert count_response.json() == {"count": 1}


@pytest.mark.asyncio
async def test_notifications_and_shell_summary_support_manager_derived_scope(
    db_session: AsyncSession,
    client: AsyncClient,
    test_department,
    test_role_employee,
    test_user_cro,
):
    manager_scoped_user = await _create_manager_scoped_user(
        db_session,
        manager_id=test_user_cro.id,
        role_id=test_role_employee.id,
    )
    risk = Risk(
        risk_id_code="R-NOTIF-MANAGER-SCOPE-001",
        name="Manager Scoped Notification Risk",
        process="Operations",
        description="Visible through manager-derived department scope",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.flush()

    await NotificationService.create_notification(
        db=db_session,
        user_id=manager_scoped_user.id,
        notification_type=NotificationType.APPROVAL_PENDING,
        title="Manager scoped linked risk",
        message="Visible through manager-derived department scope",
        resource_type="risk",
        resource_id=risk.id,
    )
    await db_session.commit()
    manager_scoped_user_id = manager_scoped_user.id
    db_session.expunge_all()

    headers = {"X-Mock-User-Id": str(manager_scoped_user_id)}
    response = await client.get("/api/v1/notifications", headers=headers)
    count_response = await client.get("/api/v1/notifications/unread/count", headers=headers)
    shell_response = await client.get("/api/v1/users/me/shell-summary", headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["unread_count"] == 1
    assert [item["title"] for item in data["items"]] == ["Manager scoped linked risk"]
    assert count_response.status_code == 200
    assert count_response.json() == {"count": 1}
    assert shell_response.status_code == 200
    assert shell_response.json()["unread_notifications_count"] == 1


@pytest.mark.asyncio
async def test_issue_notifications_require_issues_read_for_list_count_and_shell_summary(
    db_session: AsyncSession,
    client: AsyncClient,
    test_department,
    test_user_employee,
):
    issue = await _create_issue_for_notifications(
        db_session,
        department_id=test_department.id,
        owner_user_id=test_user_employee.id,
        created_by_id=test_user_employee.id,
        title="Hidden issue notification",
    )
    await NotificationService.create_notification(
        db=db_session,
        user_id=test_user_employee.id,
        notification_type=NotificationType.ISSUE_ASSIGNED,
        title="Issue linked notification",
        message="Should be hidden without issues read",
        resource_type="issue",
        resource_id=issue.id,
    )
    await NotificationService.create_notification(
        db=db_session,
        user_id=test_user_employee.id,
        notification_type=NotificationType.KRI_DUE_SOON,
        title="Generic issue-adjacent reminder",
        message="Generic notification remains visible",
    )
    await db_session.commit()

    headers = _headers_for(test_user_employee)
    response = await client.get("/api/v1/notifications", headers=headers)
    count_response = await client.get("/api/v1/notifications/unread/count", headers=headers)
    shell_response = await client.get("/api/v1/users/me/shell-summary", headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["unread_count"] == 1
    assert [item["title"] for item in data["items"]] == ["Generic issue-adjacent reminder"]
    assert count_response.status_code == 200
    assert count_response.json() == {"count": 1}
    assert shell_response.status_code == 200
    assert shell_response.json()["unread_notifications_count"] == 1


@pytest.mark.asyncio
async def test_issue_notifications_visible_with_issues_read_and_matching_scope(
    db_session: AsyncSession,
    client: AsyncClient,
    test_department,
    test_role_employee,
    test_user_employee,
):
    await _grant_issues_read(db_session, test_role_employee)
    issue = await _create_issue_for_notifications(
        db_session,
        department_id=test_department.id,
        owner_user_id=test_user_employee.id,
        created_by_id=test_user_employee.id,
        title="Visible issue notification",
    )
    await NotificationService.create_notification(
        db=db_session,
        user_id=test_user_employee.id,
        notification_type=NotificationType.ISSUE_ASSIGNED,
        title="Visible issue linked notification",
        message="Visible with issues read and issue scope",
        resource_type="issue",
        resource_id=issue.id,
    )
    await db_session.commit()

    response = await client.get("/api/v1/notifications", headers=_headers_for(test_user_employee))

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["unread_count"] == 1
    assert [item["title"] for item in data["items"]] == ["Visible issue linked notification"]


@pytest.mark.asyncio
async def test_global_scope_does_not_bypass_issue_notification_read_permission(
    db_session: AsyncSession,
    client: AsyncClient,
    test_department,
    test_role_employee,
    test_user_cro,
):
    global_user = User(
        name="Global User Without Issues Read",
        email="global.no.issues.read@test.com",
        department_id=None,
        role_id=test_role_employee.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    db_session.add(global_user)
    await db_session.flush()
    issue = await _create_issue_for_notifications(
        db_session,
        department_id=test_department.id,
        owner_user_id=test_user_cro.id,
        created_by_id=test_user_cro.id,
        title="Global hidden issue notification",
    )
    await NotificationService.create_notification(
        db=db_session,
        user_id=global_user.id,
        notification_type=NotificationType.ISSUE_ASSIGNED,
        title="Global issue linked notification",
        message="Global scope alone should not show issue notifications",
        resource_type="issue",
        resource_id=issue.id,
    )
    await db_session.commit()
    global_user_id = global_user.id
    db_session.expunge_all()

    response = await client.get("/api/v1/notifications", headers={"X-Mock-User-Id": str(global_user_id)})

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert data["items"] == []
    assert data["unread_count"] == 0


@pytest.mark.asyncio
async def test_notification_list_and_count_do_not_use_per_row_visibility_checks(
    db_session: AsyncSession,
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    test_user_cro,
    test_user_employee,
):
    hidden_risk = await _create_hidden_risk_for_employee(
        db_session,
        owner_id=test_user_cro.id,
    )
    for index in range(25):
        await NotificationService.create_notification(
            db=db_session,
            user_id=test_user_employee.id,
            notification_type=NotificationType.APPROVAL_PENDING,
            title=f"Hidden linked risk {index}",
            message="This linked resource is no longer visible",
            resource_type="risk",
            resource_id=hidden_risk.id,
        )
    await NotificationService.create_notification(
        db=db_session,
        user_id=test_user_employee.id,
        notification_type=NotificationType.KRI_DUE_SOON,
        title="Visible generic reminder",
        message="Visible user-owned reminder",
    )
    await db_session.commit()

    async def fail_per_row_visibility(*_args, **_kwargs) -> bool:
        raise AssertionError("list/count paths must use set-based notification visibility")

    monkeypatch.setattr(
        "app.services.notification_visibility.can_view_notification_resource",
        fail_per_row_visibility,
    )

    response = await client.get("/api/v1/notifications?limit=1", headers=_headers_for(test_user_employee))

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["unread_count"] == 1
    assert [item["title"] for item in data["items"]] == ["Visible generic reminder"]

    count_response = await client.get("/api/v1/notifications/unread/count", headers=_headers_for(test_user_employee))
    assert count_response.status_code == 200
    assert count_response.json() == {"count": 1}


@pytest.mark.asyncio
async def test_notifications_hide_unknown_linked_resources_with_ids(
    db_session: AsyncSession,
    client: AsyncClient,
    test_user_employee,
):
    await NotificationService.create_notification(
        db=db_session,
        user_id=test_user_employee.id,
        notification_type=NotificationType.KRI_DUE_SOON,
        title="Unsupported linked notification",
        message="Unknown resource should not leak",
        resource_type="external_case",
        resource_id=42,
    )
    await NotificationService.create_notification(
        db=db_session,
        user_id=test_user_employee.id,
        notification_type=NotificationType.KRI_DUE_TOMORROW,
        title="Generic typed reminder",
        message="Missing resource id is generic",
        resource_type="external_case",
        resource_id=None,
    )
    await db_session.commit()

    response = await client.get("/api/v1/notifications", headers=_headers_for(test_user_employee))

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["unread_count"] == 1
    assert [item["title"] for item in data["items"]] == ["Generic typed reminder"]


@pytest.mark.asyncio
async def test_scenario_approval_notifications_require_resource_visibility(
    db_session: AsyncSession,
    client: AsyncClient,
    test_department,
    test_user_cro,
    test_user_employee,
):
    hidden_risk = await _create_hidden_risk_for_employee(
        db_session,
        owner_id=test_user_cro.id,
    )
    visible_risk = Risk(
        risk_id_code="R-NOTIF-SCENARIO-001",
        name="Visible Scenario Approval Risk",
        process="Operations",
        description="In-scope scenario approval target",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
    )
    db_session.add(visible_risk)
    await db_session.flush()

    visible_approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=visible_risk.id,
        resource_name=visible_risk.name,
        action_type=ApprovalActionType.EDIT,
        pending_changes={"name": {"old": visible_risk.name, "new": "Updated"}},
        requested_by_id=test_user_cro.id,
        reason="Scenario approver with visible resource",
        status=ApprovalStatus.PENDING,
        scenario_approver_roles=["employee"],
    )
    hidden_approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=hidden_risk.id,
        resource_name=hidden_risk.name,
        action_type=ApprovalActionType.EDIT,
        pending_changes={"name": {"old": hidden_risk.name, "new": "Updated"}},
        requested_by_id=test_user_cro.id,
        reason="Scenario approver without visible resource",
        status=ApprovalStatus.PENDING,
        scenario_approver_roles=["employee"],
    )
    db_session.add_all([visible_approval, hidden_approval])
    await db_session.flush()

    await NotificationService.create_notification(
        db=db_session,
        user_id=test_user_employee.id,
        notification_type=NotificationType.APPROVAL_PENDING,
        title="Visible scenario approval",
        message="Scenario approval target is visible",
        resource_type="approval",
        resource_id=visible_approval.id,
    )
    await NotificationService.create_notification(
        db=db_session,
        user_id=test_user_employee.id,
        notification_type=NotificationType.APPROVAL_PENDING,
        title="Hidden scenario approval",
        message="Scenario approval target is hidden",
        resource_type="approval",
        resource_id=hidden_approval.id,
    )
    await db_session.commit()

    response = await client.get("/api/v1/notifications", headers=_headers_for(test_user_employee))

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert [item["title"] for item in data["items"]] == ["Visible scenario approval"]


@pytest.mark.asyncio
async def test_mark_as_read_returns_visible_unread_count(
    db_session: AsyncSession,
    client: AsyncClient,
    test_user_cro,
    test_user_employee,
):
    hidden_risk = await _create_hidden_risk_for_employee(
        db_session,
        owner_id=test_user_cro.id,
    )
    visible_notification = await NotificationService.create_notification(
        db=db_session,
        user_id=test_user_employee.id,
        notification_type=NotificationType.KRI_DUE_SOON,
        title="Visible unread",
        message="Visible user-owned reminder",
    )
    await NotificationService.create_notification(
        db=db_session,
        user_id=test_user_employee.id,
        notification_type=NotificationType.APPROVAL_PENDING,
        title="Hidden unread",
        message="Hidden linked reminder",
        resource_type="risk",
        resource_id=hidden_risk.id,
    )
    await db_session.commit()

    response = await client.post(
        f"/api/v1/notifications/{visible_notification.id}/read",
        headers=_headers_for(test_user_employee),
    )

    assert response.status_code == 200
    assert response.json() == {"unread_count": 0}


@pytest.mark.asyncio
async def test_approval_notifications_follow_detail_visibility(
    db_session: AsyncSession,
    client: AsyncClient,
    test_user_cro,
    test_user_employee,
):
    hidden_risk = await _create_hidden_risk_for_employee(
        db_session,
        owner_id=test_user_cro.id,
    )
    requester_approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=hidden_risk.id,
        resource_name=hidden_risk.name,
        action_type=ApprovalActionType.EDIT,
        pending_changes={"name": {"old": hidden_risk.name, "new": "Updated"}},
        requested_by_id=test_user_employee.id,
        reason="Requester should still see their approval notification",
        status=ApprovalStatus.PENDING,
    )
    hidden_approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=hidden_risk.id,
        resource_name=hidden_risk.name,
        action_type=ApprovalActionType.EDIT,
        pending_changes={"description": {"old": "", "new": "Updated"}},
        requested_by_id=test_user_cro.id,
        reason="Out-of-scope approval should be hidden",
        status=ApprovalStatus.PENDING,
    )
    db_session.add_all([requester_approval, hidden_approval])
    await db_session.flush()

    await NotificationService.create_notification(
        db=db_session,
        user_id=test_user_employee.id,
        notification_type=NotificationType.APPROVAL_PENDING,
        title="Requester approval",
        message="Requester-visible approval",
        resource_type="approval",
        resource_id=requester_approval.id,
    )
    await NotificationService.create_notification(
        db=db_session,
        user_id=test_user_employee.id,
        notification_type=NotificationType.APPROVAL_PENDING,
        title="Hidden approval",
        message="Approval target is not visible",
        resource_type="approval",
        resource_id=hidden_approval.id,
    )
    await db_session.commit()

    response = await client.get("/api/v1/notifications", headers=_headers_for(test_user_employee))

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert [item["title"] for item in data["items"]] == ["Requester approval"]


@pytest.mark.asyncio
async def test_questionnaire_notifications_require_questionnaire_read_visibility(
    db_session: AsyncSession,
    client: AsyncClient,
    test_user_cro,
    test_user_employee,
):
    now = utc_now()
    hidden_risk = await _create_hidden_risk_for_employee(
        db_session,
        owner_id=test_user_cro.id,
    )
    questionnaire = RiskQuestionnaire(
        risk_id=hidden_risk.id,
        assigned_to_user_id=test_user_employee.id,
        sent_by_user_id=test_user_cro.id,
        status=RiskQuestionnaireStatus.sent,
        template_key="default",
        template_version="1",
        sent_at=now,
        due_at=now + timedelta(days=7),
    )
    db_session.add(questionnaire)
    await db_session.flush()

    await NotificationService.create_notification(
        db=db_session,
        user_id=test_user_employee.id,
        notification_type=NotificationType.QUESTIONNAIRE_SENT,
        title="Hidden questionnaire",
        message="Questionnaire risk is not visible",
        resource_type="questionnaire",
        resource_id=questionnaire.id,
    )
    await db_session.commit()

    response = await client.get("/api/v1/notifications", headers=_headers_for(test_user_employee))

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert data["items"] == []
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
    """Test marking a notification as read returns updated unread count."""
    notification = await NotificationService.create_notification(
        db=db_session,
        user_id=test_user.id,
        notification_type=NotificationType.APPROVAL_RESOLVED,
        title="Read This",
        message="Message",
    )
    await db_session.commit()

    # Mark as read - now returns 200 with unread_count
    response = await auth_client.post(f"/api/v1/notifications/{notification.id}/read")
    assert response.status_code == 200
    data = response.json()
    assert "unread_count" in data
    assert data["unread_count"] == 0  # Should be 0 after marking the only notification as read

    # Verify via separate endpoint too
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
