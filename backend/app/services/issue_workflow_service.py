from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set, log_activity
from app.core.datetime_utils import coerce_utc
from app.models import Issue, IssueException, IssueRemediationPlan, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.issue import (
    IssueExceptionStatus,
    IssueRemediationStatus,
    IssueStatus,
)


def _conflict(detail: str) -> None:
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


class IssueWorkflowService:
    ISSUE_TRANSITIONS: dict[str, set[str]] = {
        IssueStatus.open.value: {IssueStatus.triaged.value, IssueStatus.in_progress.value},
        IssueStatus.triaged.value: {IssueStatus.in_progress.value},
        IssueStatus.in_progress.value: {IssueStatus.ready_for_validation.value},
        IssueStatus.ready_for_validation.value: {IssueStatus.closed.value, IssueStatus.in_progress.value},
        IssueStatus.closed.value: set(),
    }
    REMEDIATION_TRANSITIONS: dict[str, set[str]] = {
        IssueRemediationStatus.draft.value: {IssueRemediationStatus.active.value, IssueRemediationStatus.blocked.value},
        IssueRemediationStatus.active.value: {IssueRemediationStatus.blocked.value, IssueRemediationStatus.completed.value},
        IssueRemediationStatus.blocked.value: {IssueRemediationStatus.active.value, IssueRemediationStatus.completed.value},
        IssueRemediationStatus.completed.value: set(),
    }

    @staticmethod
    def _ensure_issue_transition(current_status: str, next_status: str) -> None:
        if next_status == current_status:
            return
        allowed = IssueWorkflowService.ISSUE_TRANSITIONS.get(current_status, set())
        if next_status not in allowed:
            _conflict(f"Invalid issue transition: {current_status} -> {next_status}")

    @staticmethod
    def _ensure_remediation_transition(current_status: str, next_status: str) -> None:
        if next_status == current_status:
            return
        allowed = IssueWorkflowService.REMEDIATION_TRANSITIONS.get(current_status, set())
        if next_status not in allowed:
            _conflict(f"Invalid remediation transition: {current_status} -> {next_status}")

    @staticmethod
    def _get_or_init_remediation(issue: Issue) -> IssueRemediationPlan:
        remediation = issue.remediation_plan
        if remediation is None:
            remediation = IssueRemediationPlan(
                issue_id=issue.id,
                status=IssueRemediationStatus.draft.value,
                progress_percent=0,
            )
            issue.remediation_plan = remediation
        return remediation

    @staticmethod
    async def assign_issue(
        db: AsyncSession,
        *,
        issue: Issue,
        owner_user_id: int,
        due_at: datetime,
        target_date: datetime | None,
        actor: User,
    ) -> Issue:
        due_at = coerce_utc(due_at) or due_at
        target_date = coerce_utc(target_date) or due_at
        remediation = IssueWorkflowService._get_or_init_remediation(issue)

        issue_updates: dict[str, object] = {
            "owner_user_id": owner_user_id,
            "due_at": due_at,
        }
        if issue.status == IssueStatus.open.value:
            issue_updates["status"] = IssueStatus.triaged.value

        issue_changes = build_change_set(issue, issue_updates)
        for key, value in issue_updates.items():
            setattr(issue, key, value)

        remediation_updates: dict[str, object] = {
            "owner_user_id": owner_user_id,
            "target_date": target_date,
        }
        remediation_changes = build_change_set(remediation, remediation_updates)
        for key, value in remediation_updates.items():
            setattr(remediation, key, value)

        db.add(issue)
        db.add(remediation)

        await log_activity(
            db,
            entity_type=ActivityEntityType.ISSUE,
            entity_id=issue.id,
            entity_name=issue.title,
            action=ActivityAction.UPDATE,
            actor=actor,
            department_id=issue.department_id,
            changes=issue_changes,
            description=f"Assigned issue {issue.title}",
        )
        await log_activity(
            db,
            entity_type=ActivityEntityType.ISSUE_REMEDIATION,
            entity_id=remediation.id or issue.id,
            entity_name=f"Remediation for {issue.title}",
            action=ActivityAction.UPDATE,
            actor=actor,
            department_id=issue.department_id,
            changes=remediation_changes,
        )
        return issue

    @staticmethod
    async def start_remediation(
        db: AsyncSession,
        *,
        issue: Issue,
        actor: User,
        target_date: datetime | None = None,
    ) -> Issue:
        if issue.status not in {IssueStatus.open.value, IssueStatus.triaged.value}:
            _conflict(f"Issue must be open or triaged to start remediation (current={issue.status})")

        remediation = IssueWorkflowService._get_or_init_remediation(issue)
        target_date = coerce_utc(target_date) or remediation.target_date or issue.due_at

        IssueWorkflowService._ensure_issue_transition(issue.status, IssueStatus.in_progress.value)
        issue_updates = {"status": IssueStatus.in_progress.value}
        issue_changes = build_change_set(issue, issue_updates)
        issue.status = IssueStatus.in_progress.value

        remediation_updates = {
            "status": IssueRemediationStatus.active.value,
            "target_date": target_date,
        }
        remediation_changes = build_change_set(remediation, remediation_updates)
        remediation.status = IssueRemediationStatus.active.value
        remediation.target_date = target_date

        db.add(issue)
        db.add(remediation)

        await log_activity(
            db,
            entity_type=ActivityEntityType.ISSUE,
            entity_id=issue.id,
            entity_name=issue.title,
            action=ActivityAction.STATUS_CHANGE,
            actor=actor,
            department_id=issue.department_id,
            changes=issue_changes,
            description=f"Started remediation for issue {issue.title}",
        )
        await log_activity(
            db,
            entity_type=ActivityEntityType.ISSUE_REMEDIATION,
            entity_id=remediation.id or issue.id,
            entity_name=f"Remediation for {issue.title}",
            action=ActivityAction.STATUS_CHANGE,
            actor=actor,
            department_id=issue.department_id,
            changes=remediation_changes,
        )
        return issue

    @staticmethod
    async def update_progress(
        db: AsyncSession,
        *,
        issue: Issue,
        actor: User,
        progress_percent: int | None = None,
        remediation_status: str | None = None,
        blocker_reason: str | None = None,
        completion_notes: str | None = None,
    ) -> Issue:
        remediation = IssueWorkflowService._get_or_init_remediation(issue)
        if issue.status not in {IssueStatus.in_progress.value, IssueStatus.ready_for_validation.value}:
            _conflict(f"Issue must be in progress to update remediation (current={issue.status})")

        remediation_updates: dict[str, object] = {}
        if progress_percent is not None:
            if progress_percent < 0 or progress_percent > 100:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="progress_percent must be between 0 and 100")
            remediation_updates["progress_percent"] = progress_percent
        if remediation_status is not None:
            IssueWorkflowService._ensure_remediation_transition(remediation.status, remediation_status)
            remediation_updates["status"] = remediation_status
        if blocker_reason is not None:
            remediation_updates["blocker_reason"] = blocker_reason
        if completion_notes is not None:
            remediation_updates["completion_notes"] = completion_notes

        if progress_percent == 100 and remediation.status != IssueRemediationStatus.completed.value:
            remediation_updates["status"] = IssueRemediationStatus.completed.value
            remediation_updates["completed_at"] = datetime.now(UTC)

        remediation_changes = build_change_set(remediation, remediation_updates)
        for key, value in remediation_updates.items():
            setattr(remediation, key, value)

        issue_updates: dict[str, object] = {}
        if remediation.status == IssueRemediationStatus.completed.value and issue.status != IssueStatus.ready_for_validation.value:
            IssueWorkflowService._ensure_issue_transition(issue.status, IssueStatus.ready_for_validation.value)
            issue_updates["status"] = IssueStatus.ready_for_validation.value
        elif remediation.status == IssueRemediationStatus.active.value and issue.status == IssueStatus.ready_for_validation.value:
            IssueWorkflowService._ensure_issue_transition(issue.status, IssueStatus.in_progress.value)
            issue_updates["status"] = IssueStatus.in_progress.value

        issue_changes = build_change_set(issue, issue_updates)
        for key, value in issue_updates.items():
            setattr(issue, key, value)

        db.add(issue)
        db.add(remediation)

        await log_activity(
            db,
            entity_type=ActivityEntityType.ISSUE_REMEDIATION,
            entity_id=remediation.id or issue.id,
            entity_name=f"Remediation for {issue.title}",
            action=ActivityAction.UPDATE,
            actor=actor,
            department_id=issue.department_id,
            changes=remediation_changes,
            description=f"Updated remediation progress for issue {issue.title}",
        )
        if issue_changes:
            await log_activity(
                db,
                entity_type=ActivityEntityType.ISSUE,
                entity_id=issue.id,
                entity_name=issue.title,
                action=ActivityAction.STATUS_CHANGE,
                actor=actor,
                department_id=issue.department_id,
                changes=issue_changes,
            )
        return issue

    @staticmethod
    async def request_exception(
        db: AsyncSession,
        *,
        issue: Issue,
        reason: str,
        actor: User,
    ) -> IssueException:
        now = datetime.now(UTC)
        exception = IssueException(
            issue_id=issue.id,
            status=IssueExceptionStatus.requested.value,
            reason=reason,
            requested_by_id=actor.id,
            requested_at=now,
        )
        db.add(exception)
        await db.flush()

        await log_activity(
            db,
            entity_type=ActivityEntityType.ISSUE_EXCEPTION,
            entity_id=exception.id,
            entity_name=f"Exception for {issue.title}",
            action=ActivityAction.CREATE,
            actor=actor,
            department_id=issue.department_id,
            changes={"status": {"old": None, "new": IssueExceptionStatus.requested.value}},
            description=f"Requested exception for issue {issue.title}",
        )
        return exception

    @staticmethod
    async def approve_exception(
        db: AsyncSession,
        *,
        issue: Issue,
        exception: IssueException,
        expires_at: datetime,
        actor: User,
    ) -> IssueException:
        if exception.status != IssueExceptionStatus.requested.value:
            _conflict(f"Only requested exceptions can be approved (current={exception.status})")

        expires_at = coerce_utc(expires_at)
        if expires_at is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="expires_at is required")
        now = datetime.now(UTC)
        if expires_at <= now:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="expires_at must be in the future")
        updates = {
            "status": IssueExceptionStatus.approved.value,
            "approved_by_id": actor.id,
            "approved_at": now,
            "expires_at": expires_at,
        }
        changes = build_change_set(exception, updates)
        for key, value in updates.items():
            setattr(exception, key, value)
        db.add(exception)

        await log_activity(
            db,
            entity_type=ActivityEntityType.ISSUE_EXCEPTION,
            entity_id=exception.id,
            entity_name=f"Exception for {issue.title}",
            action=ActivityAction.APPROVE,
            actor=actor,
            department_id=issue.department_id,
            changes=changes,
            description=f"Approved exception for issue {issue.title}",
        )
        return exception

    @staticmethod
    async def revoke_exception(
        db: AsyncSession,
        *,
        issue: Issue,
        exception: IssueException,
        actor: User,
    ) -> IssueException:
        if exception.status != IssueExceptionStatus.approved.value:
            _conflict(f"Only approved exceptions can be revoked (current={exception.status})")

        updates = {
            "status": IssueExceptionStatus.revoked.value,
        }
        changes = build_change_set(exception, updates)
        for key, value in updates.items():
            setattr(exception, key, value)
        db.add(exception)

        await log_activity(
            db,
            entity_type=ActivityEntityType.ISSUE_EXCEPTION,
            entity_id=exception.id,
            entity_name=f"Exception for {issue.title}",
            action=ActivityAction.STATUS_CHANGE,
            actor=actor,
            department_id=issue.department_id,
            changes=changes,
            description=f"Revoked exception for issue {issue.title}",
        )

        remediation = issue.remediation_plan
        remediation_done = (
            remediation is not None
            and remediation.status == IssueRemediationStatus.completed.value
            and remediation.progress_percent >= 100
        )
        if issue.status == IssueStatus.closed.value and not remediation_done:
            issue_updates = {
                "status": IssueStatus.in_progress.value,
                "closed_at": None,
            }
            issue_changes = build_change_set(issue, issue_updates)
            for key, value in issue_updates.items():
                setattr(issue, key, value)
            db.add(issue)

            await log_activity(
                db,
                entity_type=ActivityEntityType.ISSUE,
                entity_id=issue.id,
                entity_name=issue.title,
                action=ActivityAction.STATUS_CHANGE,
                actor=actor,
                department_id=issue.department_id,
                changes=issue_changes,
                description=f"Re-opened issue after exception revocation: {issue.title}",
            )

        return exception

    @staticmethod
    async def close_issue(
        db: AsyncSession,
        *,
        issue: Issue,
        validation_note: str,
        completion_notes: str | None,
        actor: User,
    ) -> Issue:
        remediation = IssueWorkflowService._get_or_init_remediation(issue)
        if remediation.status != IssueRemediationStatus.completed.value and remediation.progress_percent < 100:
            _conflict("Issue cannot be closed until remediation is completed")

        if issue.status != IssueStatus.ready_for_validation.value:
            _conflict(f"Issue must be ready_for_validation before closing (current={issue.status})")

        now = datetime.now(UTC)
        issue_updates = {
            "status": IssueStatus.closed.value,
            "closed_at": now,
            "validation_note": validation_note,
        }
        issue_changes = build_change_set(issue, issue_updates)
        for key, value in issue_updates.items():
            setattr(issue, key, value)

        remediation_updates: dict[str, object] = {}
        if remediation.status != IssueRemediationStatus.completed.value:
            remediation_updates["status"] = IssueRemediationStatus.completed.value
        remediation_updates["completed_at"] = remediation.completed_at or now
        remediation_updates["progress_percent"] = 100
        if completion_notes is not None:
            remediation_updates["completion_notes"] = completion_notes
        remediation_changes = build_change_set(remediation, remediation_updates)
        for key, value in remediation_updates.items():
            setattr(remediation, key, value)

        db.add(issue)
        db.add(remediation)

        await log_activity(
            db,
            entity_type=ActivityEntityType.ISSUE,
            entity_id=issue.id,
            entity_name=issue.title,
            action=ActivityAction.STATUS_CHANGE,
            actor=actor,
            department_id=issue.department_id,
            changes=issue_changes,
            description=f"Closed issue {issue.title}",
        )
        await log_activity(
            db,
            entity_type=ActivityEntityType.ISSUE_REMEDIATION,
            entity_id=remediation.id or issue.id,
            entity_name=f"Remediation for {issue.title}",
            action=ActivityAction.UPDATE,
            actor=actor,
            department_id=issue.department_id,
            changes=remediation_changes,
        )
        return issue
