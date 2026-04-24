"""Issue deadline reminders, overdue escalation, and exception expiry handling."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.activity_logger import log_activity
from app.core.datetime_utils import coerce_utc
from app.core.permissions import can_read_issue_id
from app.models import Issue, Role, RolePermission, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.global_config import ConfigDefaults, get_config_int
from app.models.issue import IssueExceptionStatus, IssueSeverity, IssueStatus
from app.models.notification import NotificationType
from app.models.role import Permission, RoleType
from app.services._issue_workflow.transitions import _is_remediation_complete, _status_value
from app.services.deadline_notifications import create_deadline_notification, increment_deadline_results

logger = logging.getLogger(__name__)


class IssueDeadlineService:
    DUE_SOON_DEFAULT_DAYS = ConfigDefaults.ADVANCE_REMINDER_DAYS
    OVERDUE_REMINDER_DEFAULT_DAYS = ConfigDefaults.DUPLICATE_LOOKBACK_DAYS
    ESCALATION_REMINDER_DEFAULT_DAYS = ConfigDefaults.DUPLICATE_LOOKBACK_DAYS

    @staticmethod
    def _active_exception(issue: Issue, now: datetime):
        approved = [
            ex
            for ex in issue.exceptions
            if ex.status == IssueExceptionStatus.approved.value
            and ex.expires_at is not None
            and coerce_utc(ex.expires_at) is not None
            and coerce_utc(ex.expires_at) > now
        ]
        if not approved:
            return None
        approved.sort(
            key=lambda ex: coerce_utc(ex.approved_at) or coerce_utc(ex.created_at) or datetime.min.replace(tzinfo=UTC),
            reverse=True,
        )
        return approved[0]

    @staticmethod
    async def _load_config(db: AsyncSession) -> dict[str, int]:
        return {
            "due_soon_days": await get_config_int(
                db,
                "issue_due_soon_reminder_days",
                IssueDeadlineService.DUE_SOON_DEFAULT_DAYS,
            ),
            "overdue_reminder_days": await get_config_int(
                db,
                "issue_overdue_reminder_days",
                IssueDeadlineService.OVERDUE_REMINDER_DEFAULT_DAYS,
            ),
            "escalation_reminder_days": await get_config_int(
                db,
                "issue_escalation_reminder_days",
                IssueDeadlineService.ESCALATION_REMINDER_DEFAULT_DAYS,
            ),
        }

    @staticmethod
    async def _users_by_ids(db: AsyncSession, user_ids: set[int]) -> dict[int, User]:
        if not user_ids:
            return {}
        permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
        result = await db.execute(
            select(User).options(permission_load).where(User.id.in_(user_ids), User.is_active.is_(True))
        )
        return {user.id: user for user in result.scalars().all()}

    @staticmethod
    async def _escalation_recipients(db: AsyncSession) -> list[User]:
        role_names = [RoleType.RISK_MANAGER.value, RoleType.CRO.value]
        permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
        stmt = (
            select(User)
            .join(Role, User.role_id == Role.id)
            .join(RolePermission, RolePermission.role_id == Role.id)
            .join(Permission, RolePermission.permission_id == Permission.id)
            .where(User.is_active.is_(True))
            .where(Role.name.in_(role_names))
            .where(Permission.resource.in_(("issues", "*")))
            .where(Permission.action.in_(("read", "*")))
            .options(permission_load)
            .distinct()
        )
        return list((await db.execute(stmt)).scalars().all())

    @staticmethod
    async def _create_issue_notification(
        db: AsyncSession,
        *,
        user: User,
        issue: Issue,
        notification_type: NotificationType,
        title: str,
        message: str,
        now: datetime,
    ) -> bool:
        return await create_deadline_notification(
            db=db,
            user_id=user.id,
            notification_type=notification_type,
            title=title,
            message=message,
            resource_type="issue",
            resource_id=issue.id,
            created_at=now,
            visibility_check=lambda: can_read_issue_id(db, user, issue.id),
        )

    @staticmethod
    async def _expire_exceptions(db: AsyncSession, issue: Issue, now: datetime) -> tuple[int, bool]:
        expired_count = 0
        reopened = False

        for ex in issue.exceptions:
            expires_at = coerce_utc(ex.expires_at)
            if ex.status != IssueExceptionStatus.approved.value or expires_at is None or expires_at > now:
                continue

            old_status = ex.status
            ex.status = IssueExceptionStatus.expired.value
            db.add(ex)
            expired_count += 1

            await log_activity(
                db,
                entity_type=ActivityEntityType.ISSUE_EXCEPTION,
                entity_id=ex.id,
                entity_name=f"Exception for {issue.title}",
                action=ActivityAction.STATUS_CHANGE,
                actor=None,
                department_id=issue.department_id,
                changes={"status": {"old": old_status, "new": ex.status}},
                description=f"Issue exception expired for {issue.title}",
            )

        if expired_count:
            if _status_value(issue.status) == IssueStatus.closed.value and not _is_remediation_complete(
                issue.remediation_plan
            ):
                issue.status = IssueStatus.in_progress.value
                issue.closed_at = None
                db.add(issue)
                reopened = True
                await log_activity(
                    db,
                    entity_type=ActivityEntityType.ISSUE,
                    entity_id=issue.id,
                    entity_name=issue.title,
                    action=ActivityAction.STATUS_CHANGE,
                    actor=None,
                    department_id=issue.department_id,
                    changes={"status": {"old": IssueStatus.closed.value, "new": IssueStatus.in_progress.value}},
                    description=f"Re-opened issue after exception expiry: {issue.title}",
                )

        return expired_count, reopened

    @staticmethod
    async def check_issue_deadlines(db: AsyncSession, *, now: datetime | None = None) -> dict[str, int]:
        now = now or datetime.now(UTC)
        config = await IssueDeadlineService._load_config(db)

        results = {
            "total_checked": 0,
            "due_soon": 0,
            "overdue": 0,
            "escalated": 0,
            "exceptions_expired": 0,
            "reopened": 0,
            "notifications_created": 0,
        }

        due_soon_cutoff = now + timedelta(days=config["due_soon_days"])
        due_soon_backoff = now - timedelta(days=config["due_soon_days"])
        overdue_cutoff = now - timedelta(days=config["overdue_reminder_days"])
        escalation_cutoff = now - timedelta(days=config["escalation_reminder_days"])

        stmt = select(Issue).options(
            selectinload(Issue.remediation_plan),
            selectinload(Issue.exceptions),
        )
        issues = list((await db.execute(stmt)).scalars().all())
        results["total_checked"] = len(issues)

        user_ids: set[int] = set()
        for issue in issues:
            if issue.owner_user_id:
                user_ids.add(issue.owner_user_id)
            if issue.remediation_plan and issue.remediation_plan.owner_user_id:
                user_ids.add(issue.remediation_plan.owner_user_id)
        users_by_id = await IssueDeadlineService._users_by_ids(db, user_ids)
        escalation_users = await IssueDeadlineService._escalation_recipients(db)

        for issue in issues:
            try:
                expired_count, reopened = await IssueDeadlineService._expire_exceptions(db, issue, now)
                if expired_count:
                    increment_deadline_results(results, "exceptions_expired", count=expired_count)
                if reopened:
                    increment_deadline_results(results, "reopened")

                # Skip deadline notifications for issues suppressed by active approved exception.
                if IssueDeadlineService._active_exception(issue, now) is not None:
                    continue

                if issue.status == IssueStatus.closed.value:
                    continue

                due_at = coerce_utc(issue.due_at)
                if due_at is None:
                    continue

                owner_ids = {
                    uid
                    for uid in {
                        issue.owner_user_id,
                        issue.remediation_plan.owner_user_id if issue.remediation_plan else None,
                    }
                    if uid is not None
                }
                recipients = [users_by_id[uid] for uid in owner_ids if uid in users_by_id]

                if now <= due_at <= due_soon_cutoff:
                    if (
                        issue.last_due_soon_notified_at is None
                        or coerce_utc(issue.last_due_soon_notified_at) < due_soon_backoff
                    ):
                        created_for_issue = 0
                        for user in recipients:
                            created = await IssueDeadlineService._create_issue_notification(
                                db,
                                user=user,
                                issue=issue,
                                notification_type=NotificationType.ISSUE_DUE_SOON,
                                title=f"Issue due soon: {issue.title}",
                                message=f"Issue '{issue.title}' is due on {due_at.date().isoformat()}.",
                                now=now,
                            )
                            if created:
                                created_for_issue += 1
                        if created_for_issue:
                            issue.last_due_soon_notified_at = now
                            db.add(issue)
                            increment_deadline_results(results, "due_soon")
                            increment_deadline_results(results, "notifications_created", count=created_for_issue)

                if due_at < now:
                    if (
                        issue.last_overdue_notified_at is None
                        or coerce_utc(issue.last_overdue_notified_at) < overdue_cutoff
                    ):
                        created_for_issue = 0
                        for user in recipients:
                            created = await IssueDeadlineService._create_issue_notification(
                                db,
                                user=user,
                                issue=issue,
                                notification_type=NotificationType.ISSUE_OVERDUE,
                                title=f"Issue overdue: {issue.title}",
                                message=f"Issue '{issue.title}' is overdue since {due_at.date().isoformat()}.",
                                now=now,
                            )
                            if created:
                                created_for_issue += 1
                        if created_for_issue:
                            issue.last_overdue_notified_at = now
                            db.add(issue)
                            increment_deadline_results(results, "overdue")
                            increment_deadline_results(results, "notifications_created", count=created_for_issue)

                    if issue.severity in {IssueSeverity.high.value, IssueSeverity.critical.value}:
                        if issue.last_escalated_at is None or coerce_utc(issue.last_escalated_at) < escalation_cutoff:
                            created_escalations = 0
                            recipient_ids = {u.id for u in escalation_users} - {u.id for u in recipients}
                            for user in escalation_users:
                                if user.id not in recipient_ids:
                                    continue
                                created = await IssueDeadlineService._create_issue_notification(
                                    db,
                                    user=user,
                                    issue=issue,
                                    notification_type=NotificationType.ISSUE_OVERDUE,
                                    title=f"Escalated overdue issue: {issue.title}",
                                    message=(
                                        f"High-severity issue '{issue.title}' remains overdue since "
                                        f"{due_at.date().isoformat()}."
                                    ),
                                    now=now,
                                )
                                if created:
                                    created_escalations += 1
                            if created_escalations:
                                issue.last_escalated_at = now
                                db.add(issue)
                                increment_deadline_results(results, "escalated")
                                increment_deadline_results(results, "notifications_created", count=created_escalations)

            except Exception as exc:
                logger.error("Issue deadline check failed for issue_id=%s: %s", issue.id, exc)
                continue

        await db.commit()
        return results
