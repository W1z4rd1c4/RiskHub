from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import coerce_utc
from app.models import (
    Issue,
    IssueException,
    IssueRemediationPlan,
    IssueSeverity,
    Notification,
    NotificationType,
    Permission,
    RolePermission,
    User,
)
from app.models.user import AccessScope
from app.services.issue_deadline_decisions import (
    build_issue_due_soon_notification_plan,
    build_issue_escalation_notification_plan,
    build_issue_overdue_notification_plan,
    should_escalate_issue_overdue,
    should_send_issue_due_soon,
    should_send_issue_overdue,
)
from app.services.issue_deadline_service import IssueDeadlineService


async def _grant(db: AsyncSession, role_id: int, resource: str, action: str) -> None:
    perm = (
        await db.execute(select(Permission).where(Permission.resource == resource, Permission.action == action))
    ).scalar_one_or_none()
    if perm is None:
        perm = Permission(resource=resource, action=action, description=f"{resource}:{action}")
        db.add(perm)
        await db.flush()

    existing = (
        await db.execute(
            select(RolePermission).where(RolePermission.role_id == role_id, RolePermission.permission_id == perm.id)
        )
    ).scalar_one_or_none()
    if existing is None:
        db.add(RolePermission(role_id=role_id, permission_id=perm.id))
        await db.flush()

    await db.commit()
    db.expire_all()


async def _create_manager_scoped_user(
    db: AsyncSession,
    *,
    email: str,
    name: str,
    role_id: int,
    manager_id: int,
) -> User:
    user = User(
        email=email,
        name=name,
        role_id=role_id,
        department_id=None,
        manager_id=manager_id,
        access_scope=AccessScope.MANAGER,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.mark.asyncio
async def test_issue_deadline_service_due_soon_overdue_and_escalation(
    db_session: AsyncSession,
    test_department,
    test_user,
    test_role_risk_manager,
    test_user_risk_manager,
):
    department_id = test_department.id
    user_id = test_user.id
    role_id = test_role_risk_manager.id
    await _grant(db_session, role_id, "issues", "read")

    now = datetime.now(UTC).replace(microsecond=0)

    due_soon_issue = Issue(
        title="Due soon issue",
        severity="medium",
        status="open",
        source_type="manual",
        department_id=department_id,
        owner_user_id=user_id,
        created_by_id=user_id,
        opened_at=now - timedelta(days=2),
        due_at=now + timedelta(days=2),
    )
    overdue_issue = Issue(
        title="Overdue high issue",
        severity=IssueSeverity.high,
        status="in_progress",
        source_type="manual",
        department_id=department_id,
        owner_user_id=user_id,
        created_by_id=user_id,
        opened_at=now - timedelta(days=6),
        due_at=now - timedelta(days=2),
    )
    db_session.add_all([due_soon_issue, overdue_issue])
    await db_session.flush()

    db_session.add_all(
        [
            IssueRemediationPlan(
                issue_id=due_soon_issue.id, status="active", progress_percent=50, owner_user_id=user_id
            ),
            IssueRemediationPlan(
                issue_id=overdue_issue.id, status="active", progress_percent=40, owner_user_id=user_id
            ),
        ]
    )
    await db_session.commit()

    result1 = await IssueDeadlineService.check_issue_deadlines(db_session, now=now)
    assert result1["due_soon"] == 1
    assert result1["overdue"] == 1
    assert result1["escalated"] == 1
    assert result1["notifications_created"] >= 3
    await db_session.refresh(overdue_issue)
    assert coerce_utc(overdue_issue.last_escalated_at) == now

    notifications = (
        (
            await db_session.execute(
                select(Notification).where(
                    Notification.resource_type == "issue",
                    Notification.resource_id.in_([due_soon_issue.id, overdue_issue.id]),
                )
            )
        )
        .scalars()
        .all()
    )
    notif_types = {n.type for n in notifications}
    assert NotificationType.ISSUE_DUE_SOON in notif_types
    assert NotificationType.ISSUE_OVERDUE in notif_types

    # Dedupe check: immediate re-run should not create duplicates.
    result2 = await IssueDeadlineService.check_issue_deadlines(db_session, now=now)
    assert result2["due_soon"] == 0
    assert result2["overdue"] == 0
    assert result2["escalated"] == 0


@pytest.mark.asyncio
async def test_issue_deadline_notifications_support_manager_scoped_recipients(
    db_session: AsyncSession,
    test_department,
    test_role_risk_manager,
    test_user_cro,
):
    role_id = test_role_risk_manager.id
    manager_id = test_user_cro.id
    department_id = test_department.id
    await _grant(db_session, role_id, "issues", "read")
    manager_scoped_owner = await _create_manager_scoped_user(
        db_session,
        email="issue.deadline.owner.manager.scope@test.com",
        name="Manager Scoped Issue Deadline Owner",
        role_id=role_id,
        manager_id=manager_id,
    )
    manager_scoped_escalation = await _create_manager_scoped_user(
        db_session,
        email="issue.deadline.escalation.manager.scope@test.com",
        name="Manager Scoped Issue Escalation Recipient",
        role_id=role_id,
        manager_id=manager_id,
    )
    now = datetime.now(UTC).replace(microsecond=0)
    due_soon_issue = Issue(
        title="Manager scoped due soon issue",
        severity="medium",
        status="open",
        source_type="manual",
        department_id=department_id,
        owner_user_id=manager_scoped_owner.id,
        created_by_id=manager_id,
        opened_at=now - timedelta(days=1),
        due_at=now + timedelta(days=2),
    )
    overdue_issue = Issue(
        title="Manager scoped escalated issue",
        severity=IssueSeverity.high,
        status="in_progress",
        source_type="manual",
        department_id=department_id,
        owner_user_id=manager_id,
        created_by_id=manager_id,
        opened_at=now - timedelta(days=8),
        due_at=now - timedelta(days=3),
    )
    db_session.add_all([due_soon_issue, overdue_issue])
    await db_session.commit()
    owner_id = manager_scoped_owner.id
    escalation_id = manager_scoped_escalation.id
    due_soon_issue_id = due_soon_issue.id
    overdue_issue_id = overdue_issue.id
    db_session.expunge_all()

    result = await IssueDeadlineService.check_issue_deadlines(db_session, now=now)

    assert result["due_soon"] >= 1
    assert result["escalated"] >= 1
    owner_notification = (
        await db_session.execute(
            select(Notification).where(
                Notification.user_id == owner_id,
                Notification.resource_type == "issue",
                Notification.resource_id == due_soon_issue_id,
                Notification.type == NotificationType.ISSUE_DUE_SOON,
            )
        )
    ).scalar_one_or_none()
    escalation_notification = (
        await db_session.execute(
            select(Notification).where(
                Notification.user_id == escalation_id,
                Notification.resource_type == "issue",
                Notification.resource_id == overdue_issue_id,
                Notification.type == NotificationType.ISSUE_OVERDUE,
            )
        )
    ).scalar_one_or_none()
    assert owner_notification is not None
    assert escalation_notification is not None


@pytest.mark.asyncio
async def test_issue_deadline_service_expires_exception_and_reopens_issue(
    db_session: AsyncSession,
    test_department,
    test_user,
):
    now = datetime.now(UTC).replace(microsecond=0)
    department_id = test_department.id
    user_id = test_user.id

    issue = Issue(
        title="Exception-expired issue",
        severity="critical",
        status="closed",
        source_type="manual",
        department_id=department_id,
        owner_user_id=user_id,
        created_by_id=user_id,
        opened_at=now - timedelta(days=30),
        closed_at=now - timedelta(days=5),
        due_at=now - timedelta(days=10),
    )
    db_session.add(issue)
    await db_session.flush()

    remediation = IssueRemediationPlan(
        issue_id=issue.id,
        status="active",
        progress_percent=25,
        owner_user_id=user_id,
    )
    exception = IssueException(
        issue_id=issue.id,
        status="approved",
        reason="Temporary acceptance",
        requested_by_id=user_id,
        approved_by_id=user_id,
        requested_at=now - timedelta(days=20),
        approved_at=now - timedelta(days=15),
        expires_at=now - timedelta(hours=1),
    )
    db_session.add_all([remediation, exception])
    await db_session.commit()

    result = await IssueDeadlineService.check_issue_deadlines(db_session, now=now)
    assert result["exceptions_expired"] == 1
    assert result["reopened"] == 1

    refreshed_issue = (await db_session.execute(select(Issue).where(Issue.id == issue.id))).scalar_one()
    refreshed_exception = (
        await db_session.execute(select(IssueException).where(IssueException.id == exception.id))
    ).scalar_one()

    assert refreshed_exception.status == "expired"
    assert refreshed_issue.status == "in_progress"
    assert refreshed_issue.closed_at is None


@pytest.mark.asyncio
async def test_issue_deadline_service_expired_exception_keeps_completed_issue_closed(
    db_session: AsyncSession,
    test_department,
    test_user,
):
    now = datetime.now(UTC).replace(microsecond=0)
    department_id = test_department.id
    user_id = test_user.id

    issue = Issue(
        title="Completed exception-expired issue",
        severity="critical",
        status="closed",
        source_type="manual",
        department_id=department_id,
        owner_user_id=user_id,
        created_by_id=user_id,
        opened_at=now - timedelta(days=30),
        closed_at=now - timedelta(days=5),
        due_at=now - timedelta(days=10),
    )
    db_session.add(issue)
    await db_session.flush()

    remediation = IssueRemediationPlan(
        issue_id=issue.id,
        status="completed",
        progress_percent=100,
        completed_at=now - timedelta(days=5),
        owner_user_id=user_id,
    )
    exception = IssueException(
        issue_id=issue.id,
        status="approved",
        reason="Temporary acceptance",
        requested_by_id=user_id,
        approved_by_id=user_id,
        requested_at=now - timedelta(days=20),
        approved_at=now - timedelta(days=15),
        expires_at=now - timedelta(hours=1),
    )
    db_session.add_all([remediation, exception])
    await db_session.commit()

    result = await IssueDeadlineService.check_issue_deadlines(db_session, now=now)
    assert result["exceptions_expired"] == 1
    assert result["reopened"] == 0

    refreshed_issue = (await db_session.execute(select(Issue).where(Issue.id == issue.id))).scalar_one()
    refreshed_exception = (
        await db_session.execute(select(IssueException).where(IssueException.id == exception.id))
    ).scalar_one()

    assert refreshed_exception.status == "expired"
    assert refreshed_issue.status == "closed"
    assert refreshed_issue.closed_at is not None


@pytest.mark.asyncio
async def test_issue_deadline_service_rolls_back_failed_issue_and_continues(
    db_session: AsyncSession,
    test_department,
    test_user,
    monkeypatch,
):
    now = datetime.now(UTC).replace(microsecond=0)
    department_id = test_department.id
    user_id = test_user.id

    failed_issue = Issue(
        title="Failed deadline issue",
        severity="critical",
        status="closed",
        source_type="manual",
        department_id=department_id,
        owner_user_id=user_id,
        created_by_id=user_id,
        opened_at=now - timedelta(days=30),
        closed_at=now - timedelta(days=5),
        due_at=now - timedelta(days=10),
    )
    later_issue = Issue(
        title="Later deadline issue",
        severity="medium",
        status="open",
        source_type="manual",
        department_id=department_id,
        owner_user_id=user_id,
        created_by_id=user_id,
        opened_at=now - timedelta(days=2),
        due_at=now + timedelta(days=2),
    )
    db_session.add_all([failed_issue, later_issue])
    await db_session.flush()
    db_session.add_all(
        [
            IssueRemediationPlan(
                issue_id=failed_issue.id,
                status="active",
                progress_percent=25,
                owner_user_id=user_id,
            ),
            IssueException(
                issue_id=failed_issue.id,
                status="approved",
                reason="Temporary acceptance",
                requested_by_id=user_id,
                approved_by_id=user_id,
                requested_at=now - timedelta(days=20),
                approved_at=now - timedelta(days=15),
                expires_at=now - timedelta(hours=1),
            ),
            IssueRemediationPlan(
                issue_id=later_issue.id,
                status="active",
                progress_percent=50,
                owner_user_id=user_id,
            ),
        ]
    )
    await db_session.commit()
    failed_issue_id = failed_issue.id
    later_issue_id = later_issue.id
    original_expire = IssueDeadlineService._expire_exceptions

    async def fail_after_dirtying_issue(db: AsyncSession, issue: Issue, current_now: datetime):
        if issue.id == failed_issue_id:
            issue.status = "in_progress"
            db.add(issue)
            raise RuntimeError("simulated per-issue failure")
        return await original_expire(db, issue, current_now)

    monkeypatch.setattr(IssueDeadlineService, "_expire_exceptions", staticmethod(fail_after_dirtying_issue))

    result = await IssueDeadlineService.check_issue_deadlines(db_session, now=now)

    assert result["due_soon"] == 1
    assert result["notifications_created"] >= 1
    refreshed_failed = (
        await db_session.execute(select(Issue).where(Issue.id == failed_issue_id))
    ).scalar_one()
    refreshed_later = (
        await db_session.execute(select(Issue).where(Issue.id == later_issue_id))
    ).scalar_one()
    assert refreshed_failed.status == "closed"
    assert coerce_utc(refreshed_later.last_due_soon_notified_at) == now


def test_issue_deadline_decisions_cover_due_soon_overdue_and_escalation() -> None:
    now = datetime(2026, 4, 26, 9, 0, tzinfo=UTC)
    due_soon_due_at = now + timedelta(days=2)
    overdue_due_at = now - timedelta(days=2)

    assert should_send_issue_due_soon(
        now=now,
        due_at=due_soon_due_at,
        due_soon_cutoff=now + timedelta(days=7),
        due_soon_backoff=now - timedelta(days=7),
        last_due_soon_notified_at=None,
    )
    assert not should_send_issue_due_soon(
        now=now,
        due_at=due_soon_due_at,
        due_soon_cutoff=now + timedelta(days=7),
        due_soon_backoff=now - timedelta(days=7),
        last_due_soon_notified_at=now - timedelta(days=1),
    )

    assert should_send_issue_overdue(
        now=now,
        due_at=overdue_due_at,
        overdue_cutoff=now - timedelta(days=7),
        last_overdue_notified_at=None,
    )
    assert should_escalate_issue_overdue(
        now=now,
        due_at=overdue_due_at,
        escalation_cutoff=now - timedelta(days=7),
        last_escalated_at=None,
        issue_severity="high",
    )
    assert should_escalate_issue_overdue(
        now=now,
        due_at=overdue_due_at,
        escalation_cutoff=now - timedelta(days=7),
        last_escalated_at=None,
        issue_severity=IssueSeverity.high,
    )
    assert should_escalate_issue_overdue(
        now=now,
        due_at=overdue_due_at,
        escalation_cutoff=now - timedelta(days=7),
        last_escalated_at=None,
        issue_severity=IssueSeverity.critical,
    )
    assert not should_escalate_issue_overdue(
        now=now,
        due_at=overdue_due_at,
        escalation_cutoff=now - timedelta(days=7),
        last_escalated_at=None,
        issue_severity="medium",
    )
    assert not should_escalate_issue_overdue(
        now=now,
        due_at=overdue_due_at,
        escalation_cutoff=now - timedelta(days=7),
        last_escalated_at=None,
        issue_severity=IssueSeverity.medium,
    )


def test_issue_deadline_payload_builders_preserve_notification_copy() -> None:
    due_at = datetime(2026, 4, 30, 12, 0, tzinfo=UTC)
    issue = Issue(title="Decision Issue")

    due_soon = build_issue_due_soon_notification_plan(issue=issue, due_at=due_at)
    assert due_soon.notification_type == NotificationType.ISSUE_DUE_SOON
    assert due_soon.title == "Issue due soon: Decision Issue"
    assert due_soon.message == "Issue 'Decision Issue' is due on 2026-04-30."

    overdue = build_issue_overdue_notification_plan(issue=issue, due_at=due_at)
    assert overdue.notification_type == NotificationType.ISSUE_OVERDUE
    assert overdue.title == "Issue overdue: Decision Issue"
    assert overdue.message == "Issue 'Decision Issue' is overdue since 2026-04-30."

    escalation = build_issue_escalation_notification_plan(issue=issue, due_at=due_at)
    assert escalation.notification_type == NotificationType.ISSUE_OVERDUE
    assert escalation.title == "Escalated overdue issue: Decision Issue"
    assert escalation.message == "High-severity issue 'Decision Issue' remains overdue since 2026-04-30."
